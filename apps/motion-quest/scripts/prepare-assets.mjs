import { mkdir, copyFile } from 'node:fs/promises';
import { preparePoseAssets } from '../../../packages/pose-mediapipe/prepare-assets.mjs';

await preparePoseAssets(new URL('../public/runtime/', import.meta.url));

// Reuse the locally generated encouragement already bundled with Push-up Flight.
await mkdir(new URL('../public/audio/', import.meta.url), { recursive: true });
for (const name of ['start', 'nice', 'keep-going', 'finish']) {
  await copyFile(new URL(`../../../experiments/gameplay/plank-flight/public/audio/${name}.wav`, import.meta.url), new URL(`../public/audio/${name}.wav`, import.meta.url));
}
