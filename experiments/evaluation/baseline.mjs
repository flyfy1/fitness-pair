import { assertEvaluationResult } from '@fitness-pair/contracts';
import { baselineActions } from '../action-recognition/baseline.mjs';

const result = { version: 1, runId: 'synthetic-baseline-v1', fixtureId: 'squat-step-geometry-v1',
  evidence: 'synthetic', modelId: 'synthetic-geometry/1', recognizerId: 'squat-2d-hysteresis/1',
  device: `Node ${process.version}; ${process.platform}/${process.arch}; no model inference`,
  expectedCount: 5, observedCount: baselineActions().filter(f => f.completion).length,
  falseCompletions: null, missedCompletions: null, matchingWindowMs: null,
  timing: { metric: 'synthetic_event_delay_ms', p50Ms: null, p95Ms: null } };
assertEvaluationResult(result);
console.log(JSON.stringify(result, null, 2));
