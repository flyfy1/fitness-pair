export const VERSION = 1;
export const JOINT_NAMES = Object.freeze([
  'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist',
  'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle',
]);
const object = (v, name) => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError(`${name}: expected object`); };
const string = (v, name) => { if (typeof v !== 'string' || !v.trim()) throw new TypeError(`${name}: expected non-empty string`); };
const number = (v, name, min = -Infinity, max = Infinity) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new TypeError(`${name}: invalid finite number`);
};
const integer = (v, name, min = 0) => { number(v, name, min); if (!Number.isSafeInteger(v)) throw new TypeError(`${name}: expected safe integer`); };
const oneOf = (v, values, name) => { if (!values.includes(v)) throw new TypeError(`${name}: unsupported value`); };
function source(value) {
  object(value, 'source'); oneOf(value.kind, ['camera', 'replay', 'synthetic'], 'source.kind'); string(value.id, 'source.id');
}
function envelope(v) {
  object(v, 'frame'); if (v.version !== VERSION) throw new TypeError('Unsupported contract version');
  string(v.sessionId, 'sessionId'); number(v.tMs, 'tMs', 0); source(v.source);
}
export function sameSource(a, b) { return a.kind === b.kind && a.id === b.id; }
export function assertPoseFrame(v) {
  envelope(v); integer(v.seq, 'seq'); string(v.modelId, 'modelId');
  oneOf(v.coordinateSpace, ['image-normalized-unmirrored'], 'coordinateSpace');
  object(v.image, 'image'); integer(v.image.width, 'image.width', 1); integer(v.image.height, 'image.height', 1);
  object(v.joints, 'joints');
  for (const [name, joint] of Object.entries(v.joints)) {
    oneOf(name, JOINT_NAMES, 'joint name'); object(joint, name);
    number(joint.x, `${name}.x`); number(joint.y, `${name}.y`);
    if (joint.confidence !== null) number(joint.confidence, `${name}.confidence`, 0, 1);
  }
}
export function assertActionFrame(v) {
  envelope(v); integer(v.inputSeq, 'inputSeq'); string(v.recognizerId, 'recognizerId');
  string(v.action, 'action'); string(v.cue, 'cue');
  oneOf(v.phase, ['missing', 'calibrating', 'ready', 'active', 'completed'], 'phase');
  number(v.progress, 'progress', 0, 1);
  if (v.calibrationProgress !== null) number(v.calibrationProgress, 'calibrationProgress', 0, 1);
  if (['missing', 'calibrating'].includes(v.phase) && v.progress !== 0) throw new TypeError('Untracked/calibrating frames cannot charge a game');
  if (v.phase !== 'calibrating' && v.calibrationProgress !== null) throw new TypeError('Calibration progress belongs to calibration phase');
  if (v.completion !== null) {
    object(v.completion, 'completion'); string(v.completion.id, 'completion.id'); integer(v.completion.repIndex, 'completion.repIndex', 1);
    if (v.phase !== 'completed') throw new TypeError('Completion requires completed phase');
  } else if (v.phase === 'completed') throw new TypeError('Completed phase requires a completion event');
}
export function assertEvaluationResult(v) {
  object(v, 'result'); if (v.version !== VERSION) throw new TypeError('Unsupported contract version');
  for (const key of ['runId', 'fixtureId', 'modelId', 'recognizerId', 'device']) string(v[key], key);
  oneOf(v.evidence, ['synthetic', 'public-fixture', 'consented-human'], 'evidence');
  integer(v.observedCount, 'observedCount');
  for (const key of ['expectedCount', 'falseCompletions', 'missedCompletions']) if (v[key] !== null) integer(v[key], key);
  if (v.matchingWindowMs !== null) number(v.matchingWindowMs, 'matchingWindowMs', 0);
  object(v.timing, 'timing');
  oneOf(v.timing.metric, ['inference_ms', 'completion_event_delay_ms', 'synthetic_event_delay_ms'], 'timing.metric');
  // Early events may have negative completion delay. Inference duration cannot.
  for (const key of ['p50Ms', 'p95Ms']) if (v.timing[key] !== null) number(v.timing[key], key, v.timing.metric === 'inference_ms' ? 0 : -Infinity);
  if (v.timing.p50Ms !== null && v.timing.p95Ms !== null && v.timing.p50Ms > v.timing.p95Ms) throw new TypeError('p50 cannot exceed p95');
}
