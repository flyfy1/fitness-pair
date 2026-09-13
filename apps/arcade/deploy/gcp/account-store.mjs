import {mkdir, readFile, open, rename, unlink, readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes, createHash} from 'node:crypto';

export const ACCOUNT_LIMIT_BYTES = 2_000_000_000;
export const ANONYMOUS_LIMIT_BYTES = 10_000_000_000;
const limitFor = userId => userId === null ? ANONYMOUS_LIMIT_BYTES : ACCOUNT_LIMIT_BYTES;
const fail = (status, message) => Object.assign(new Error(message), {status});
// One gateway process owns this directory. The systemd unit preserves it across releases.
export function createAccountStore(directory, {now = Date.now} = {}) {
  const pending = new Map();
  const ledgerKey = createHash('sha256').update('hopmodo-gallery-v1').digest('hex');
  const filename = (kind, key) => {
    if (!['sessions', 'accounts'].includes(kind) || !/^[a-f0-9]{64}$/.test(key)) throw Error('Invalid state key');
    return path.join(directory, kind, key + '.json');
  };
  async function read(kind, key) {
    try { return JSON.parse(await readFile(filename(kind, key), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async function write(kind, key, value) {
    const target = filename(kind, key), folder = path.dirname(target);
    await mkdir(folder, {recursive: true, mode: 0o700});
    const temporary = target + '.' + randomBytes(8).toString('hex');
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value)); await file.sync(); }
    finally { await file.close(); }
    try {
      await rename(temporary, target);
      const parent = await open(folder, 'r');
      try { await parent.sync(); } finally { await parent.close(); }
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async function remove(kind, key) {
    await unlink(filename(kind, key)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  async function serialized(key, action) {
    const previous = pending.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    pending.set(key, next);
    try { return await next; } finally { if (pending.get(key) === next) pending.delete(key); }
  }
  async function entries() {
    const value = await read('accounts', ledgerKey);
    if (value && (value.version !== 1 || !Array.isArray(value.clips) || value.clips.some(clip =>
      !/^[0-9a-f-]{36}$/.test(clip.id) || !Number.isSafeInteger(clip.bytes) || clip.bytes <= 0 ||
      (clip.ownerId !== null && !/^[a-f0-9]{64}$/.test(clip.ownerId)) || !Number.isSafeInteger(clip.expiresAt)))) throw Error('Invalid account ledger');
    return (value?.clips || []).filter(clip => clip.expiresAt > now());
  }
  return {
    read, write, remove,
    async list(userId) {
      return serialized(ledgerKey, async () => {
        const clips = (await entries()).filter(clip => clip.ownerId === userId).map(({ownerId, ...clip}) => clip);
        return {clips, usedBytes: clips.reduce((sum, clip) => sum + clip.bytes, 0), limitBytes: limitFor(userId)};
      });
    },
    async syncAnonymous(imported) {
      return serialized(ledgerKey, async () => {
        const clips = await entries();
        for (const clip of imported) {
          if (!/^[0-9a-f-]{36}$/.test(clip.id) || !Number.isSafeInteger(clip.bytes) || clip.bytes <= 0 || !Number.isSafeInteger(clip.expiresAt)) throw Error('Invalid anonymous inventory');
          if (clip.expiresAt > now() && !clips.some(item => item.id === clip.id)) clips.push({...clip, ownerId: null});
        }
        await write('accounts', ledgerKey, {version: 1, clips});
      });
    },
    async reserve(userId, clip) {
      return serialized(ledgerKey, async () => {
        const clips = await entries();
        const existing = clips.find(item => item.id === clip.id);
        if (existing) throw fail(409, 'This upload is still being processed. Please try again later.');
        if ((userId !== null && !/^[a-f0-9]{64}$/.test(userId)) || !/^[0-9a-f-]{36}$/.test(clip.id) || !Number.isSafeInteger(clip.bytes) || clip.bytes <= 0 || !Number.isSafeInteger(clip.expiresAt) || clip.expiresAt <= now()) throw Error('Invalid reservation');
        if (clips.filter(item => item.ownerId === userId).reduce((sum, item) => sum + item.bytes, 0) + clip.bytes > limitFor(userId))
          throw fail(413, userId === null ? 'The shared 10 GB anonymous storage is full. Log in to use your own 2 GB, or try again later.' : 'Your 2 GB storage is full. Remove a shared clip to free space, then try again.');
        await write('accounts', ledgerKey, {version: 1, clips: [...clips, {...clip, ownerId: userId}]});
      });
    },
    async release(userId, id) {
      return serialized(ledgerKey, async () => {
        const clips = await entries();
        await write('accounts', ledgerKey, {version: 1, clips: clips.filter(clip => clip.id !== id || clip.ownerId !== userId)});
      });
    },
    async pruneSessions() {
      const folder = path.join(directory, 'sessions');
      const files = await readdir(folder).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      for (const file of files) if (/^[a-f0-9]{64}\.json$/.test(file)) {
        const key = file.slice(0, -5), session = await read('sessions', key);
        if (session && session.expiresAt <= now()) await remove('sessions', key);
      }
    }
  };
}
