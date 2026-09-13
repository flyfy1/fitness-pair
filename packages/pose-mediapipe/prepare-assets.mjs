import { mkdir, cp, access, writeFile, rename, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const MODEL_SHA256 = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/** Prepare one host's local Worker, runtime and pinned model. Destination is a directory URL. */
export async function preparePoseAssets(destination) {
  const runtime = new URL(destination);
  if (runtime.protocol !== 'file:' || !runtime.pathname.endsWith('/')) {
    throw new Error('Pose asset destination must be an absolute file directory URL ending in /.');
  }
  const require = createRequire(import.meta.url);
  const library = new URL('./', pathToFileURL(require.resolve('@mediapipe/tasks-vision')));
  await mkdir(runtime, { recursive: true });
  await cp(new URL('wasm/', library), new URL('wasm/', runtime), { recursive: true });
  // The upstream WASM loader requires a classic Worker and unmodified bundle.
  await cp(new URL('vision_bundle.cjs', library), new URL('vision_bundle.js', runtime));
  await cp(new URL('worker.js', import.meta.url), new URL('pose-worker.js', runtime));
  await cp(new URL('asset-cache.js', import.meta.url), new URL('asset-cache.js', runtime));
  const model = new URL('pose_landmarker_lite.task', runtime);
  try {
    await access(model);
  } catch {
    console.info('Downloading pose model (first run only)…');
    const response = await fetch(MODEL_URL, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== MODEL_SHA256) {
      throw new Error('Downloaded pose model checksum mismatch. Please retry.');
    }
    const temporary = new URL(`pose_landmarker_lite.task.${process.pid}.tmp`, runtime);
    await writeFile(temporary, bytes);
    await rename(temporary, model);
  }
  const hash = createHash('sha256').update(await readFile(model)).digest('hex');
  if (hash !== MODEL_SHA256) {
    throw new Error(`Model checksum mismatch. Remove ${fileURLToPath(model)} and retry.`);
  }
  const paths = ['vision_bundle.js', 'pose_landmarker_lite.task',
    'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm',
    'wasm/vision_wasm_nosimd_internal.js', 'wasm/vision_wasm_nosimd_internal.wasm'];
  const assets = await Promise.all(paths.map(async path => {
    const bytes = await readFile(new URL(path, runtime));
    return { path, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  await writeFile(new URL('asset-manifest.json', runtime), JSON.stringify({ schema: 1, assets }));
  console.info(`Local model ready: ${fileURLToPath(model)} (sha256 ${hash})`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (!process.argv[2]) throw new Error('Usage: node prepare-assets.mjs <runtime-directory>');
  await preparePoseAssets(pathToFileURL(`${resolve(process.argv[2])}/`));
}
