// Classic-worker helper: the homepage preloader and every pose worker share this path.
(() => {
  const CACHE = 'hopmodo-tracking-v1';
  const TIMEOUT_MS = 300_000;
  const allowed = /^(vision_bundle\.js|pose_landmarker_lite\.task|wasm\/vision_wasm_(nosimd_)?internal\.(js|wasm))$/;
  const abort = signal => { if (signal.aborted) throw signal.reason; };
  const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');

  async function load({ base, onProgress = () => {}, select, signal: callerSignal, timeoutMs = TIMEOUT_MS }) {
    const controller = new AbortController();
    const cancel = () => controller.abort(callerSignal.reason);
    callerSignal?.addEventListener('abort', cancel, { once: true });
    if (callerSignal?.aborted) cancel();
    const timer = setTimeout(() => controller.abort(new DOMException('Tracking download timed out. Please retry.', 'TimeoutError')), timeoutMs);
    const signal = controller.signal;
    // Arcade aliases must use one canonical key, including direct /games/ entry.
    const root = new URL('runtime/', base);
    if (/^\/games\/(motion-quest|dino-run|dino-ar|plank-flight|camera-start)\//.test(root.pathname)) root.pathname = '/runtime/';
    let cache, persistent = true, loaded = 0, total = null;
    const report = (state, extra = {}) => onProgress({ state, loaded, total, persistent, ...extra });
    try {
      report('checking');
      const response = await fetch(new URL('asset-manifest.json', root), { signal, cache: 'no-cache' });
      if (!response.ok) throw new Error('Tracking files are unavailable. Please retry.');
      const manifest = await response.json();
      if (manifest.schema !== 1 || !Array.isArray(manifest.assets) || !manifest.assets.length || manifest.assets.some(a =>
        !allowed.test(a.path) || !/^[a-f0-9]{64}$/.test(a.sha256) || !Number.isSafeInteger(a.bytes) || a.bytes <= 0)) {
        throw new Error('Tracking file list is invalid. Please retry.');
      }
      try { cache = await caches.open(CACHE); } catch { persistent = false; }
      const buffers = {};
      async function asset(path) {
        abort(signal);
        const entry = manifest.assets.find(a => a.path === path);
        if (!entry) throw new Error('A tracking file is missing. Please retry.');
        const url = new URL(path, root);
        url.searchParams.set('sha256', entry.sha256);
        const get = async () => {
          abort(signal);
          let bytes;
          try {
            const stored = await cache?.match(url.href);
            if (stored) {
              const candidate = await stored.arrayBuffer();
              if (candidate.byteLength === entry.bytes && await hash(candidate) === entry.sha256) bytes = candidate;
              else await cache.delete(url.href);
            }
          } catch { persistent = false; }
          if (bytes) {
            loaded += bytes.byteLength; report('checking');
          } else {
            report('downloading', { file: path });
            const result = await fetch(url, { signal, cache: 'no-store' });
            if (!result.ok) throw new Error('A tracking download failed. Please retry.');
            const reader = result.body?.getReader();
            const chunks = []; let received = 0;
            if (reader) {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  abort(signal);
                  received += value.byteLength;
                  if (received > entry.bytes) throw new Error('A tracking file has changed. Please retry.');
                  chunks.push(value); report('downloading', { loaded: loaded + received, file: path });
                }
              } catch (error) { await reader.cancel().catch(() => {}); throw error; }
            } else {
              const value = new Uint8Array(await result.arrayBuffer()); chunks.push(value); received = value.byteLength;
            }
            bytes = new Uint8Array(received);
            let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            bytes = bytes.buffer;
            if (received !== entry.bytes || await hash(bytes) !== entry.sha256) throw new Error('A tracking download was incomplete. Please retry.');
            abort(signal);
            loaded += received;
            try {
              if (cache) await cache.put(url.href, new Response(bytes, { headers: { 'Content-Type': path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' } }));
            } catch { persistent = false; }
          }
          abort(signal);
          buffers[path] = bytes;
        };
        // Origin-wide locks prevent a preload and game/tab fetching the same bytes twice.
        if (navigator.locks?.request) {
          report('waiting');
          await navigator.locks.request(`hopmodo:${entry.sha256}`, { signal }, get);
        } else await get();
      }
      await asset('vision_bundle.js');
      const selected = await select(buffers['vision_bundle.js']);
      const paths = ['vision_bundle.js', 'pose_landmarker_lite.task', ...selected];
      total = paths.reduce((sum, path) => sum + (manifest.assets.find(a => a.path === path)?.bytes ?? 0), 0);
      report('checking');
      for (const path of paths.slice(1)) await asset(path);
      abort(signal);
      report('complete');
      return { buffers, selected, persistent };
    } finally {
      clearTimeout(timer); callerSignal?.removeEventListener('abort', cancel);
    }
  }
  globalThis.HopmodoTrackingAssets = { load, CACHE, TIMEOUT_MS };
})();
