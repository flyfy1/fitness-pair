import { assertPoseFrame } from '../index.js';

/** Artificial geometry for integration checks; never human-accuracy evidence. */
export function squatSession(repetitions = 5) {
  const frames = [], sessionId = 'fixture-squat-v1';
  const source = { kind: 'synthetic', id: 'squat-step-geometry-v1' };
  const add = down => {
    const joints = {};
    for (const side of ['left', 'right']) {
      joints[`${side}Shoulder`] = { x: .5, y: down ? .28 : .2, confidence: 1 };
      joints[`${side}Hip`] = { x: .5, y: down ? .53 : .45, confidence: 1 };
      joints[`${side}Knee`] = { x: down ? .68 : .5, y: .65, confidence: 1 };
      joints[`${side}Ankle`] = { x: .5, y: .9, confidence: 1 };
    }
    const frame = { version: 1, sessionId, source, seq: frames.length, tMs: (frames.length + 1) * 80,
      modelId: 'synthetic-geometry/1', coordinateSpace: 'image-normalized-unmirrored',
      image: { width: 640, height: 480 }, joints };
    assertPoseFrame(frame); frames.push(frame);
  };
  for (let i = 0; i < 30; i++) add(false);
  for (let rep = 0; rep < repetitions; rep++) {
    for (let i = 0; i < 12; i++) add(true);
    for (let i = 0; i < 12; i++) add(false);
  }
  return frames;
}
