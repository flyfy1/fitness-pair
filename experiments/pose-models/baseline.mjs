import { fromMediaPipe } from '@fitness-pair/pose-mediapipe';
import { assertPoseFrame } from '@fitness-pair/contracts';

const landmarks = [];
landmarks[11] = { x: .4, y: .3, visibility: .9 };
const frame = fromMediaPipe({ landmarks, sessionId: 'adapter-example', seq: 0, tMs: 0,
  source: { kind: 'synthetic', id: 'adapter-fixture' }, width: 640, height: 480 });
assertPoseFrame(frame);
console.log(JSON.stringify({ note: 'Adapter smoke check only; no model was run.', frame }, null, 2));
