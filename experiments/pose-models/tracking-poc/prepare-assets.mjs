import { mkdir, cp, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const library = new URL('./', pathToFileURL(require.resolve('@mediapipe/tasks-vision')));
const runtime = new URL('./public/runtime/', import.meta.url);
await mkdir(runtime, { recursive: true });
await cp(new URL('wasm/', library), new URL('wasm/', runtime), { recursive: true });
await cp(new URL('vision_bundle.cjs', library), new URL('vision_bundle.js', runtime));
await cp(new URL('./worker.js', import.meta.url), new URL('tracking-worker.js', runtime));
const models = [
  ['pose_landmarker_lite', 'pose_landmarker/pose_landmarker_lite', '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'],
  ['hand_landmarker', 'hand_landmarker/hand_landmarker', 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'],
];
for (const [name, path, hash] of models) {
  const target = new URL(`${name}.task`, runtime);
  let bytes;
  try { bytes = await readFile(target); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.info(`Downloading ${name} (first run only)…`);
    const response = await fetch(`https://storage.googleapis.com/mediapipe-models/${path}/float16/1/${name}.task`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`Checksum mismatch: ${name}`);
  const temporary = new URL(`${name}.tmp`, runtime);
  await writeFile(temporary, bytes); await rename(temporary, target);
}
console.info('Tracking runtime and verified models ready.');
