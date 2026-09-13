import { cp } from 'node:fs/promises';
import { preparePoseAssets } from '../../../packages/pose-mediapipe/prepare-assets.mjs';
await preparePoseAssets(new URL('../public/runtime/', import.meta.url));

await cp(new URL('../../../experiments/gameplay/plank-flight/public/audio/', import.meta.url), new URL('../public/audio/', import.meta.url), { recursive: true });
