import { fromMediaPipe as bodyFrame } from '../../../../packages/pose-mediapipe/index.js';

/** Optional presentation-only head hint. Shared named body joints stay unchanged. */
export function fromMediaPipe(input) {
  const frame = bodyFrame(input);
  const visible = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && p.visibility >= .6;
  // Official model indices belong only in this provider, never recognition/UI.
  const points = [input.landmarks[0], input.landmarks[7], input.landmarks[8]].filter(visible);
  if (points.length) {
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    const shoulders = ['leftShoulder', 'rightShoulder'].map(name => frame.joints[name]);
    const hips = ['leftHip', 'rightHip'].map(name => frame.joints[name]);
    const lengths = shoulders.flatMap((p, i) => p && hips[i] && p.confidence >= .6 && hips[i].confidence >= .6
      ? [Math.hypot((p.x - hips[i].x) * input.width, (p.y - hips[i].y) * input.height)] : []);
    if (lengths.length) frame.head = { x, y, sizePx: Math.max(40, Math.min(input.width * .3, Math.max(...lengths) * .7)) };
  }
  return frame;
}
