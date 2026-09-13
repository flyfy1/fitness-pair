import { mkdir, cp, access, writeFile, rename, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const runtime = new URL('public/runtime/', root);
const require = createRequire(import.meta.url);
const workerPath = require.resolve('@fitness-pair/pose-mediapipe/worker');
const providerRequire = createRequire(workerPath);
const library = new URL('./', pathToFileURL(providerRequire.resolve('@mediapipe/tasks-vision')));
await mkdir(runtime, { recursive: true });
await cp(new URL('wasm/', library), new URL('wasm/', runtime), { recursive: true });
// Use a classic worker: this version's WASM loader relies on classic-script
// semantics. Keep the upstream loader unchanged rather than patching it.
await cp(new URL('vision_bundle.cjs', library), new URL('vision_bundle.js', runtime));
await cp(workerPath, new URL('pose-worker.js', runtime));
const model = new URL('pose_landmarker_lite.task', runtime);
try {
  await access(model);
} catch {
  const url = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  console.info('Downloading pose model (first run only)…');
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1_000_000) throw new Error('Incomplete model download');
  const temporary = new URL('pose_landmarker_lite.task.tmp', runtime);
  await writeFile(temporary, bytes);
  await rename(temporary, model);
}
const hash = createHash('sha256').update(await readFile(model)).digest('hex');
if (hash !== '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a') {
  throw new Error('Model checksum mismatch. Remove public/runtime/pose_landmarker_lite.task and retry.');
}
console.info(`Local model ready: ${fileURLToPath(model)} (sha256 ${hash})`);
