import { mkdir, cp, access, writeFile, rename, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const MODEL_SHA256 = '97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

/** Prepare one host's local Worker, runtime and pinned model. Destination is a directory URL. */
export async function prepareGestureAssets(destination) {
  const runtime = new URL(destination);
  if (runtime.protocol !== 'file:' || !runtime.pathname.endsWith('/')) {
    throw new Error('Gesture asset destination must be an absolute file directory URL ending in /.');
  }
  const require = createRequire(import.meta.url);
  const library = new URL('./', pathToFileURL(require.resolve('@mediapipe/tasks-vision')));
  await mkdir(runtime, { recursive: true });
  await cp(new URL('wasm/', library), new URL('wasm/', runtime), { recursive: true });
  // The upstream WASM loader requires a classic Worker and unmodified bundle.
  await cp(new URL('vision_bundle.cjs', library), new URL('vision_bundle.js', runtime));
  await cp(new URL('../src/worker.js', import.meta.url), new URL('gesture-worker.js', runtime));
  const model = new URL('gesture_recognizer.task', runtime);
  try {
    await access(model);
  } catch {
    console.info('Downloading gesture model (first run only)…');
    const response = await fetch(MODEL_URL, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== MODEL_SHA256) {
      throw new Error('Downloaded gesture model checksum mismatch. Please retry.');
    }
    const temporary = new URL(`gesture_recognizer.task.${process.pid}.tmp`, runtime);
    await writeFile(temporary, bytes);
    await rename(temporary, model);
  }
  const hash = createHash('sha256').update(await readFile(model)).digest('hex');
  if (hash !== MODEL_SHA256) {
    throw new Error(`Model checksum mismatch. Remove ${fileURLToPath(model)} and retry.`);
  }
  console.info(`Local model ready: ${fileURLToPath(model)} (sha256 ${hash})`);
}

await prepareGestureAssets(new URL('../public/runtime/', import.meta.url));
