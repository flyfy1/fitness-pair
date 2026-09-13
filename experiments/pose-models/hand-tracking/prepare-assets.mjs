import { mkdir, cp, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const library = new URL('./', pathToFileURL(require.resolve('@mediapipe/tasks-vision')));
const runtime = new URL('public/runtime/', import.meta.url);
const model = new URL('models/hand_landmarker.task', import.meta.url);
const expected = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
await mkdir(new URL('models/', import.meta.url), { recursive: true });
let bytes;
try { bytes = await readFile(model); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.info('Downloading the official hand model (first run only)…');
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
if (createHash('sha256').update(bytes).digest('hex') !== expected) {
  throw new Error('Hand model checksum mismatch. Remove models/hand_landmarker.task and retry.');
}
const temporary = new URL('models/hand_landmarker.task.tmp', import.meta.url);
await writeFile(temporary, bytes); await rename(temporary, model);
await mkdir(runtime, { recursive: true });
await cp(model, new URL('hand_landmarker.task', runtime));
await cp(new URL('wasm/', library), new URL('wasm/', runtime), { recursive: true });
await cp(new URL('vision_bundle.cjs', library), new URL('vision_bundle.js', runtime));
await cp(new URL('worker.js', import.meta.url), new URL('hand-worker.js', runtime));
console.info('Local hand model and runtime ready.');
