import { preparePoseAssets } from '../../../packages/pose-mediapipe/prepare-assets.mjs';

await preparePoseAssets(new URL('../public/runtime/', import.meta.url));
