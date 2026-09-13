import { fromMediaPipe as bodyFrame } from '../../../../packages/pose-mediapipe/index.js';

/** Experimental named head extension; never depends on hips or legs being visible. */
export function fromMediaPipe(input) {
  const frame = bodyFrame(input);
  const visible = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && Number.isFinite(p.visibility) && p.visibility >= .6 && p.visibility <= 1;
  // Official model indices stay in the provider, never recognition/UI.
  const nose = input.landmarks[0];
  const ears = [input.landmarks[7], input.landmarks[8]].filter(visible);
  const points = visible(nose) ? [nose] : ears;
  if (points.length) {
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    const shoulders = ['leftShoulder', 'rightShoulder'].map(name => frame.joints[name])
      .filter(p => p && visible({ ...p, visibility: p.confidence }));
    const pixels = (a,b) => Math.hypot((a.x-b.x)*input.width,(a.y-b.y)*input.height);
    const sizes = shoulders.map(p => pixels({x,y},p)*.85);
    if (shoulders.length === 2) sizes.push(pixels(...shoulders)*.65);
    if (ears.length === 2) sizes.push(pixels(...ears)*2.2);
    frame.head = { x, y, confidence: Math.min(...points.map(p=>p.visibility)),
      sizePx: Math.max(40, Math.min(input.width*.3, Math.max(40,...sizes))) };
  }
  return frame;
}
