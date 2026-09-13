import http from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, rm, rename, stat, open } from 'node:fs/promises';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const exec = promisify(execFile), here = path.dirname(fileURLToPath(import.meta.url));
const ID = /^[a-f0-9]{32}$/;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash = value => createHash('sha256').update(value).digest();
const equal = (a, b) => timingSafeEqual(hash(a || ''), hash(b || ''));
const fail = (status, message) => Object.assign(new Error(message), {status});

export async function createApp(options = {}) {
  const data = path.resolve(options.dataDir || process.env.DATA_DIR || path.join(here, '.local/data'));
  const origin = options.origin || process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:8410';
  const uploadCode = options.uploadCode || process.env.UPLOAD_CODE;
  if (!uploadCode || uploadCode.length < 12) throw new Error('UPLOAD_CODE must contain at least 12 characters');
  if (new URL(origin).origin !== origin) throw new Error('PUBLIC_ORIGIN must be an exact origin');
  const maxBytes = options.maxBytes || 20 * 1024 * 1024;
  const storageBytes = options.storageBytes || 500 * 1024 * 1024;
  const ttlMs = options.ttlMs || 7 * 86400_000;
  const now = options.now || Date.now;
  const records = new Map();
  let busy = false, used = 0, attempts = [];
  await mkdir(data, {recursive:true, mode:0o700});
  async function remove(id) {
    const record = records.get(id);
    // Remove the publication marker first, so a crash cannot resurrect a deleted clip.
    await rm(path.join(data, id + '.json'), {force:true});
    records.delete(id);
    if (record) used -= record.bytes;
    await Promise.all(['.video','.jpg'].map(ext => rm(path.join(data, id + ext), {force:true})));
  }
  async function cleanup() {
    for (const [id, record] of records) if (record.expiresAt <= now()) await remove(id);
  }
  const names = await readdir(data);
  for (const name of names.filter(n => /^[a-f0-9]{32}\.json$/.test(n))) {
    const id = name.slice(0,32);
    const record = JSON.parse(await readFile(path.join(data,name),'utf8'));
    if (record.id !== id || !Number.isFinite(record.expiresAt) || !(record.bytes > 0)) throw new Error('Invalid stored record');
    try { await stat(path.join(data,id+'.video')); await stat(path.join(data,id+'.jpg')); }
    catch { await rm(path.join(data,name),{force:true}); continue; }
    records.set(id,record); used += record.bytes;
  }
  await cleanup();
  for (const name of names) {
    if (/^[a-f0-9]{32}\.(part|video|jpg|json\.part)$/.test(name) && !records.has(name.slice(0,32))) {
      await rm(path.join(data,name),{force:true});
    }
  }
  const timer = setInterval(() => cleanup().catch(() => console.error('Expiry cleanup failed')), 3600_000);
  timer.unref();
  function publicRecord(r) {
    const {id,title,source,createdAt,expiresAt,duration,mime} = r;
    return {id,title,source,createdAt,expiresAt,duration,mime,url:`${origin}/s/${id}`};
  }
  function headers(res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  }
  function json(res,status,value) {
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value));
  }
  async function sendFile(req,res,file,mime,range=false) {
    const {size} = await stat(file);
    let start=0, end=size-1, status=200;
    if (range) {
      res.setHeader('Accept-Ranges','bytes');
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!match || (!match[1] && !match[2])) throw fail(416,'Invalid byte range');
        if (!match[1]) start=Math.max(0,size-Number(match[2]));
        else { start=Number(match[1]); if (match[2]) end=Math.min(end,Number(match[2])); }
        if (!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size) {
          res.setHeader('Content-Range',`bytes */${size}`); throw fail(416,'Range not satisfiable');
        }
        status=206; res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
      }
    }
    res.writeHead(status,{'Content-Type':mime,'Content-Length':end-start+1});
    if (req.method === 'HEAD') return res.end();
    await pipeline(createReadStream(file,{start,end}),res);
  }
  async function ingest(req,res,url) {
    if (!equal(req.headers.authorization,`Bearer ${uploadCode}`)) throw fail(401,'Enter the private upload code to publish.');
    if (req.headers['x-sharing-consent'] !== 'public-v1') throw fail(400,'Confirm public sharing before uploading.');
    if (req.headers.origin && req.headers.origin !== origin) throw fail(403,'Wrong origin');
    const mime = (req.headers['content-type'] || '').split(';')[0];
    if (!['video/mp4','video/webm'].includes(mime)) throw fail(415,'Choose an MP4 or WebM video.');
    const title = (url.searchParams.get('title') || '').trim();
    const source = url.searchParams.get('source');
    if (!title || title.length > 90 || /[\x00-\x1f]/.test(title)) throw fail(400,'Use a title of 1–90 characters.');
    if (!['replay','synthetic'].includes(source)) throw fail(400,'Choose the clip provenance.');
    const length = Number(req.headers['content-length']);
    if (!Number.isSafeInteger(length) || length < 1) throw fail(411,'A nonempty Content-Length is required.');
    if (length > maxBytes) throw fail(413,'Clip is larger than 20 MiB.');
    if (busy) throw fail(429,'Another clip is processing. Please retry shortly.');
    if (used + length + 512*1024 > storageBytes) throw fail(507,'Clip storage is full. Remove old clips or try after expiry.');
    attempts=attempts.filter(t => t > now()-3600_000);
    if (attempts.length >= 30) throw fail(429,'Upload limit reached. Try again in an hour.');
    attempts.push(now()); busy=true;
    const id=randomBytes(16).toString('hex'), temp=path.join(data,id+'.part');
    let published=false;
    try {
      let bytes=0;
      const limit = new Transform({transform(chunk,encoding,callback) {
        bytes+=chunk.length; callback(bytes > maxBytes || bytes > length ? fail(413,'Clip is too large.') : null,chunk);
      }});
      await pipeline(req,limit,createWriteStream(temp,{flags:'wx',mode:0o600}));
      if (bytes !== length) throw fail(400,'Incomplete upload.');
      const fh=await open(temp,'r'), signature=Buffer.alloc(12);
      try { await fh.read(signature,0,12,0); } finally { await fh.close(); }
      if (mime==='video/mp4' ? signature.toString('ascii',4,8)!=='ftyp' : signature.readUInt32BE(0)!==0x1a45dfa3) throw fail(415,'Video format does not match its file type.');
      const format = mime==='video/mp4' ? 'mov' : 'matroska,webm';
      let probe;
      try {
        const {stdout}=await exec('ffprobe',['-v','error','-protocol_whitelist','file','-format_whitelist',format,'-show_format','-show_streams','-of','json',temp],{timeout:15000,maxBuffer:256*1024});
        probe=JSON.parse(stdout);
      } catch { throw fail(422,'This video could not be read. Export it as H.264 MP4 or VP8/VP9 WebM.'); }
      const videos=probe.streams.filter(s=>s.codec_type==='video');
      let duration=Number(probe.format.duration);
      // MediaRecorder WebM omits the container duration. Read bounded packet timestamps.
      if (!Number.isFinite(duration) && mime==='video/webm') {
        try {
          const {stdout}=await exec('ffprobe',['-v','error','-protocol_whitelist','file','-format_whitelist',format,'-select_streams','v:0','-show_packets','-show_entries','packet=pts_time,duration_time','-of','csv=p=0',temp],{timeout:15000,maxBuffer:4*1024*1024});
          const packets=stdout.trim().split('\n').map(line=>line.split(',').map(Number)).filter(p=>Number.isFinite(p[0]));
          const first=Math.min(...packets.map(p=>p[0])), last=Math.max(...packets.map(p=>p[0]+(Number.isFinite(p[1])?p[1]:0)));
          duration=last-first;
        } catch { throw fail(422,'Cannot determine video duration. Export a standard MP4 or WebM.'); }
      }
      if (videos.length !== 1 || !['h264','vp8','vp9'].includes(videos[0].codec_name) || !videos[0].width || !videos[0].height || videos[0].width>3840 || videos[0].height>3840 || probe.streams.some(s => s.codec_type!=='video' && (s.codec_type!=='audio'||!['aac','opus','vorbis'].includes(s.codec_name)))) throw fail(422,'Use one H.264, VP8 or VP9 video track with optional AAC, Opus or Vorbis audio.');
      if (!Number.isFinite(duration) || duration<=0 || duration>60) throw fail(422,'Trim your clip to 60 seconds or less before uploading.');
      const poster=path.join(data,id+'.jpg');
      try { await exec('ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file','-format_whitelist',format,'-threads','1','-i',temp,'-map','0:v:0','-frames:v','1','-vf','scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2','-threads','1','-update','1',poster],{timeout:20000,maxBuffer:128*1024}); }
      catch { throw fail(422,'Unable to generate a preview for this video.'); }
      const token=randomBytes(32).toString('hex');
      const mediaPath=path.join(data,id+'.video');
      if (mime==='video/webm') {
        // Finalize MediaRecorder's streaming container so duration and seeking work.
        try { await exec('ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file','-format_whitelist',format,'-i',temp,'-map','0:v:0','-map','0:a?','-c','copy','-f','webm',mediaPath],{timeout:20000,maxBuffer:128*1024}); }
        catch { throw fail(422,'Unable to finalize this recording. Please export it again.'); }
        await rm(temp,{force:true});
      } else await rename(temp,mediaPath);
      const record={id,title,source,mime,duration,createdAt:now(),expiresAt:now()+ttlMs,bytes:(await stat(mediaPath)).size+(await stat(poster)).size,tokenHash:hash(token).toString('hex')};
      if (used+record.bytes>storageBytes) throw fail(507,'Clip storage is full.');
      await writeFile(path.join(data,id+'.json.part'),JSON.stringify(record),{mode:0o600,flag:'wx'});
      await rename(path.join(data,id+'.json.part'),path.join(data,id+'.json'));
      records.set(id,record); used+=record.bytes; published=true;
      json(res,201,{...publicRecord(record),manageToken:token});
    } finally {
      busy=false;
      if (!published) await Promise.all(['.part','.video','.jpg','.json.part'].map(ext=>rm(path.join(data,id+ext),{force:true})));
    }
  }
  const server=http.createServer(async (req,res) => {
    headers(res);
    try {
      const url=new URL(req.url,origin), route=url.pathname;
      if (req.method==='POST' && route==='/api/clips') return await ingest(req,res,url);
      const matched=/^\/(api\/clips|s|media|poster)\/([a-f0-9]{32})$/.exec(route);
      if (matched) {
        const [,kind,id]=matched, r=records.get(id);
        if (!ID.test(id)||!r||r.expiresAt<=now()) throw fail(404,'This clip has expired, was removed, or does not exist.');
        if (req.method==='DELETE' && kind==='api/clips') {
          const token=(req.headers.authorization||'').replace(/^Bearer /,'');
          if (!equal(hash(token).toString('hex'),r.tokenHash)) throw fail(403,'The management key is required.');
          await remove(id); return json(res,200,{removed:true});
        }
        if (!['GET','HEAD'].includes(req.method)) throw fail(405,'Method not allowed');
        if (kind==='api/clips') return json(res,200,publicRecord(r));
        if (kind==='media') return await sendFile(req,res,path.join(data,id+'.video'),r.mime,true);
        if (kind==='poster') return await sendFile(req,res,path.join(data,id+'.jpg'),'image/jpeg');
        const template=await readFile(path.join(here,'public/view.html'),'utf8');
        const description=`${r.source==='synthetic'?'Synthetic gameplay demo':'Player-selected recording'} · ${Math.ceil(r.duration)} seconds · Available until ${new Date(r.expiresAt).toISOString().slice(0,10)}`;
        const html=template.replaceAll('{{TITLE}}',escape(r.title)).replaceAll('{{DESCRIPTION}}',escape(description)).replaceAll('{{URL}}',`${origin}/s/${id}`).replaceAll('{{ORIGIN}}',origin).replaceAll('{{ID}}',id).replaceAll('{{MIME}}',r.mime);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); return res.end(req.method==='HEAD'?undefined:html);
      }
      if (!['GET','HEAD'].includes(req.method)) throw fail(405,'Method not allowed');
      if (route==='/healthz') return json(res,200,{ok:true,service:'fitness-result-sharing',release:process.env.RELEASE||'development'});
      const assets={'/':'index.html','/style.css':'style.css','/studio.js':'studio.js','/view.js':'view.js','/robots.txt':'robots.txt'};
      const asset=assets[route];
      if (!asset) throw fail(404,'Page not found');
      const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',txt:'text/plain; charset=utf-8'};
      await sendFile(req,res,path.join(here,'public',asset),types[asset.split('.').pop()]);
    } catch(error) {
      if (res.headersSent || res.destroyed) { if (!res.destroyed) res.destroy(); return; }
      const status=error.status||500;
      if (status===500) console.error('Request failed:',error.code||error.name);
      if (req.url.startsWith('/s/')) {
        res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});
        res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><title>Clip unavailable · Fitness Pair</title><main class="shell"><p class="eyebrow">FITNESS PAIR / HIGHLIGHTS</p><h1>That moment<br>has moved on.</h1><p>${escape(error.status?error.message:'Please try again.')}</p><a class="button" href="/">Create a highlight</a></main></html>`);
      } else json(res,status,{error:error.status?error.message:'Something went wrong. Please retry.'});
      req.resume();
    }
  });
  server.requestTimeout=60000; server.headersTimeout=15000; server.timeout=65000;
  server.on('close',()=>clearInterval(timer));
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server=await createApp();
  server.listen(Number(process.env.PORT||8410),'127.0.0.1',()=>console.log('Fitness Result Sharing listening on loopback'));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{ server.close(()=>process.exit(0)); setTimeout(()=>process.exit(1),10000).unref(); });
}
