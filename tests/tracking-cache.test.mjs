import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto, createHash } from 'node:crypto';
const script = await readFile(new URL('../packages/pose-mediapipe/asset-cache.js', import.meta.url), 'utf8');
function environment({ denied = false, quota = false, broken = false, hanging = false } = {}) {
  const stored = new Map(), requests = [], progress = [];
  const paths = ['vision_bundle.js', 'pose_landmarker_lite.task', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm'];
  const files = Object.fromEntries(paths.map(path => [path, new TextEncoder().encode(path)]));
  const manifest = { schema: 1, assets: paths.map(path => ({ path, bytes: files[path].length, sha256: createHash('sha256').update(files[path]).digest('hex') })) };
  const cache = { match: async key => stored.get(key)?.clone(), delete: async key => stored.delete(key), put: async (key, response) => { if (quota) throw Error('quota'); stored.set(key, response); } };
  const context = { URL, AbortController, DOMException, Response, Uint8Array, setTimeout, clearTimeout, crypto: webcrypto,
    navigator: {}, caches: { open: async () => { if (denied) throw Error('denied'); return cache; } },
    fetch: async (url, { signal }) => {
      url = new URL(url); requests.push(url.href);
      if (url.pathname.endsWith('asset-manifest.json')) return Response.json(manifest);
      if (hanging) return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      const path = url.pathname.replace('/runtime/', '');
      return new Response(broken ? 'corrupt' : files[path]);
    } };
  vm.runInNewContext(script, context);
  const load = options => context.HopmodoTrackingAssets.load({ base: 'https://example.test/games/motion-quest/', onProgress: event => progress.push(event), select: async () => paths.slice(2), ...options });
  return { load, stored, requests, progress, manifest, files };
}
test('cold bytes are validated, warm load shares canonical keys and measured totals', async () => {
  const env = environment();
  await env.load();
  assert.equal(env.requests.filter(url => url.includes('sha256')).length, 4);
  const complete = env.progress.at(-1);
  assert.equal(complete.loaded, complete.total);
  assert.equal(complete.total, Object.values(env.files).reduce((sum, bytes) => sum + bytes.length, 0));
  await env.load({ base: 'https://example.test/' });
  assert.equal(env.requests.filter(url => url.includes('sha256')).length, 4);
  assert.equal(env.progress.at(-1).persistent, true);
});
test('unavailable storage and quota still return usable bytes without claiming persistence', async () => {
  for (const options of [{ denied: true }, { quota: true }]) {
    const env = environment(options); const result = await env.load();
    assert.equal(result.persistent, false); assert.equal(Object.keys(result.buffers).length, 4);
  }
});
test('corrupt cache refetches, missing entry refetches, version change has a different key', async () => {
  const env = environment(); await env.load();
  const keys = [...env.stored.keys()]; env.stored.set(keys[0], new Response('corrupt')); env.stored.delete(keys[1]);
  await env.load(); assert.equal(env.requests.filter(url => url.includes('sha256')).length, 6);
  const path = 'pose_landmarker_lite.task'; env.files[path] = new TextEncoder().encode('new version');
  Object.assign(env.manifest.assets[1], { bytes: env.files[path].length, sha256: createHash('sha256').update(env.files[path]).digest('hex') });
  await env.load(); assert.equal(env.requests.filter(url => url.includes('sha256')).length, 7);
});
test('corrupt network response cannot enter cache', async () => {
  const env = environment({ broken: true }); await assert.rejects(env.load(), /changed|incomplete/); assert.equal(env.stored.size, 0);
});
test('stalled download is bounded and explicit cancellation rejects', async () => {
  const env = environment({ hanging: true });
  await assert.rejects(env.load({ timeoutMs: 20 }), { name: 'TimeoutError' });
  const controller = new AbortController(); const loading = env.load({ signal: controller.signal });
  setTimeout(() => controller.abort(), 10); await assert.rejects(loading, { name: 'AbortError' });
});
