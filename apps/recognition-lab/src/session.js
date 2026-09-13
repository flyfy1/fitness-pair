import { assertPoseFrame, assertActionFrame, sameSource } from '@fitness-pair/contracts';
import { SquatRecognizer } from '@fitness-pair/action-squat';
import { JumpHeightRecognizer } from '@fitness-pair/action-jump-height';

export const FORMAT = 'recognition-lab/1';
export const MAX_FRAMES = 9000;
export const MAX_DURATION_MS = 300000;
export const MAX_BYTES = 32 * 1024 * 1024;
export const PHASES = ['missing', 'calibrating', 'ready', 'active', 'completed'];
const check = (ok, message) => { if (!ok) throw new Error(message); };
const text = (value, max = 500) => typeof value === 'string' && value.length <= max;
export function createRecognizer(profile) {
  check(['squat', 'jump-height'].includes(profile), 'Unsupported recognizer profile');
  return profile === 'squat' ? new SquatRecognizer() : new JumpHeightRecognizer();
}
export function newSession(profile, evidence = 'consented-human') {
  createRecognizer(profile);
  return { format: FORMAT, id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    name: `${profile} session`, profile, evidence, samples: [], markers: [],
    test: { start: 0, end: null, expectedCount: null, states: [], note: '' } };
}
export function validateSession(s) {
  check(s?.format === FORMAT && text(s.id, 100) && s.id.length > 0, 'Invalid recording format or ID');
  check(text(s.name, 120) && text(s.createdAt, 50) && Number.isFinite(Date.parse(s.createdAt)), 'Invalid session metadata');
  createRecognizer(s.profile);
  check(['synthetic', 'public-fixture', 'consented-human'].includes(s.evidence), 'Invalid evidence label');
  check(Array.isArray(s.samples) && s.samples.length > 0 && s.samples.length <= MAX_FRAMES, 'Recording must contain 1–9000 frames');
  const first = s.samples[0].pose;
  let previous = null;
  for (const sample of s.samples) {
    assertPoseFrame(sample.pose); assertActionFrame(sample.observed);
    const p = sample.pose, a = sample.observed;
    check(p.sessionId === first.sessionId && sameSource(p.source, first.source) && p.modelId === first.modelId, 'Mixed session, source or model');
    check(!previous || p.seq > previous.seq && p.tMs > previous.tMs, 'Nonmonotonic input');
    check(p.tMs - first.tMs <= MAX_DURATION_MS, 'Recording exceeds five minutes');
    check(p.sessionId === a.sessionId && sameSource(p.source, a.source) && p.seq === a.inputSeq && p.tMs === a.tMs && a.action === s.profile, 'Observation does not match its input');
    check(Number.isFinite(sample.resultDelayMs) && sample.resultDelayMs >= 0, 'Invalid result delay');
    check(s.evidence !== 'synthetic' || p.source.kind === 'synthetic', 'Synthetic evidence requires synthetic input');
    check(p.source.kind !== 'synthetic' || s.evidence === 'synthetic', 'Synthetic input cannot be human evidence');
    previous = p;
  }
  const index = i => Number.isSafeInteger(i) && i >= 0 && i < s.samples.length;
  check(Array.isArray(s.markers) && s.markers.length <= MAX_FRAMES && s.markers.every(m => index(m.index) && text(m.note)), 'Invalid issue markers');
  const t = s.test;
  check(t && index(t.start) && (t.end === null || index(t.end)) && (t.end ?? s.samples.length - 1) >= t.start, 'Invalid test window');
  check(t.expectedCount === null || Number.isSafeInteger(t.expectedCount) && t.expectedCount >= 0 && t.expectedCount <= MAX_FRAMES, 'Invalid expected count');
  check(text(t.note) && Array.isArray(t.states) && t.states.length <= MAX_FRAMES && t.states.every(a => index(a.index) && a.index >= t.start && a.index <= (t.end ?? s.samples.length - 1) && PHASES.includes(a.phase)), 'Invalid state assertions');
  return s;
}
export function replaySession(session, runId = crypto.randomUUID()) {
  validateSession(session);
  const source = { kind: 'replay', id: session.id };
  const recognizer = createRecognizer(session.profile);
  recognizer.reset({ sessionId: runId, source });
  // Keep the calibration prefix even when assertions target a later window.
  const outputs = session.samples.map(({ pose }) => recognizer.update({ ...pose, sessionId: runId, source }));
  const start = session.test.start, end = session.test.end ?? outputs.length - 1;
  const count = new Set(outputs.slice(start, end + 1).flatMap(a => a?.completion ? [a.completion.id] : [])).size;
  const assertions = session.test.states.map(a => ({ ...a, actual: outputs[a.index]?.phase, passed: outputs[a.index]?.phase === a.phase }));
  const expectedCount = session.test.expectedCount;
  const labeled = expectedCount !== null || assertions.length > 0;
  const passed = labeled && (expectedCount === null || count === expectedCount) && assertions.every(a => a.passed);
  const report = { format: 'recognition-lab-report/1', fixtureId: session.id, runId, evidence: session.evidence,
    recognizerId: outputs[0].recognizerId, profile: session.profile, modelId: session.samples[0].pose.modelId,
    window: { start, end }, expectedCount, observedCount: count, assertions,
    status: !labeled ? 'UNLABELED' : passed ? 'PASS' : 'FAIL',
    falseCompletions: null, missedCompletions: null };
  return { outputs, report };
}
