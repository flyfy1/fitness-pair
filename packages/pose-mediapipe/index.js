import { assertPoseFrame } from '@fitness-pair/contracts';

export const MODEL_ID = 'mediapipe-pose-lite-f16-v1/tasks-vision-0.10.32';
const indices = { leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16, leftHip: 23, rightHip: 24, leftKnee: 25,
  rightKnee: 26, leftAnkle: 27, rightAnkle: 28 };

/** Pure adapter; Worker transport and 33-point indices stay inside this provider. */
export function fromMediaPipe({ landmarks, sessionId, seq, tMs, source, width, height }) {
  const joints = {};
  for (const [name, index] of Object.entries(indices)) {
    const p = landmarks[index];
    if (p) joints[name] = { x: p.x, y: p.y, confidence: p.visibility ?? null };
  }
  const frame = { version: 1, sessionId, seq, tMs, source: { ...source }, modelId: MODEL_ID,
    coordinateSpace: 'image-normalized-unmirrored', image: { width, height }, joints };
  assertPoseFrame(frame);
  return frame;
}
