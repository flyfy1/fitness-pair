import {mkdir, open, readFile, link, unlink} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';

const JSON_LIMIT = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (status, message) => Object.assign(new Error(message), {status});
const headers = {'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers});
const text = (value, limit) => typeof value === 'string' && value.length <= limit ? value : null;

async function readJSON(request) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > JSON_LIMIT) throw fail(413, 'Feedback is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw fail(400, 'Feedback is required.');
  const chunks = []; let bytes = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > JSON_LIMIT) { await reader.cancel(); throw fail(413, 'Feedback is too large.'); }
    chunks.push(value);
  }
  try {
    const body = Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8');
    return JSON.parse(body);
  } catch { throw fail(400, 'Feedback must be valid JSON.'); }
}

function refererPath(request, origin) {
  const raw = request.headers.get('Referer');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return text(url.origin === origin ? url.pathname : url.origin, 512);
  } catch { return null; }
}

export function createFeedbackCollector({directory, origin, games, getUser = async () => null, now = Date.now} = {}) {
  if (!directory) throw Error('A durable feedback directory is required.');
  const allowed = new Map(games.map(game => [game.id, game]));
  const events = path.join(directory, 'feedback', 'events');

  async function persist(record) {
    await mkdir(events, {recursive:true, mode:0o700});
    const target = path.join(events, record.id + '.json');
    const temporary = target + '.' + randomBytes(8).toString('hex');
    let file;
    file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(record) + '\n'); await file.sync(); }
    finally { await file.close(); }
    try {
      try { await link(temporary, target); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const existing = JSON.parse(await readFile(target, 'utf8'));
        if (existing.id !== record.id) throw Error('Invalid feedback record.');
        return existing;
      }
      const parent = await open(events, 'r');
      try { await parent.sync(); } finally { await parent.close(); }
      return record;
    } finally { await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;}); }
  }

  return {
    async handle(request) {
      const url = new URL(request.url);
      if (url.pathname !== '/api/feedback') return null;
      if (request.method !== 'POST') return json({error:'Method not allowed.'}, 405);
      if (request.headers.get('Origin') !== origin) throw fail(403, 'Feedback must come from this website.');
      if (request.headers.get('Content-Type')?.split(';',1)[0].trim().toLowerCase() !== 'application/json') throw fail(415, 'Feedback must use JSON.');
      const body = await readJSON(request);
      const game = allowed.get(body.gameId);
      if (!game || !UUID.test(body.id || '')) throw fail(400, 'Unknown game or feedback event.');
      if (!['up','down'].includes(body.rating)) throw fail(400, 'Choose thumbs up or thumbs down.');
      if (!Number.isSafeInteger(body.durationMs) || body.durationMs < 0 || body.durationMs > 86400000) throw fail(400, 'Invalid game duration.');
      if (!Number.isSafeInteger(body.stoppedAt) || Math.abs(body.stoppedAt - now()) > 7 * 86400000) throw fail(400, 'Invalid stop time.');
      const page = text(body.sourcePage, 256), score = body.score == null ? null : text(body.score, 160);
      if (page !== `/play/${game.id}` || (body.score != null && score === null)) throw fail(400, 'Invalid game details.');
      const inputSource = body.inputSource == null ? null : text(body.inputSource, 32);
      if (inputSource !== null && !['camera','replay','synthetic'].includes(inputSource)) throw fail(400, 'Invalid game source.');
      const session = await getUser(request);
      const record = {
        version:1,
        id:body.id,
        rating:body.rating,
        game:{id:game.id,title:game.title,inputSource,score},
        sourcePage:page,
        durationMs:body.durationMs,
        stoppedAt:body.stoppedAt,
        receivedAt:now(),
        request:{
          origin,
          referer:refererPath(request, origin),
          userAgent:text(request.headers.get('User-Agent'), 1024),
          secFetchSite:text(request.headers.get('Sec-Fetch-Site'), 32),
        },
        user:session ? {id:session.userId,email:session.email} : null,
      };
      const saved = await persist(record);
      return json({ok:true,id:saved.id,receivedAt:saved.receivedAt}, 201);
    }
  };
}
