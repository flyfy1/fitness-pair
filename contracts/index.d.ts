export const VERSION: 1;
export const JOINT_NAMES: readonly JointName[];
export type JointName = 'leftShoulder' | 'rightShoulder' | 'leftElbow' | 'rightElbow'
  | 'leftWrist' | 'rightWrist' | 'leftHip' | 'rightHip' | 'leftKnee' | 'rightKnee'
  | 'leftAnkle' | 'rightAnkle';
export type Source = { kind: 'camera' | 'replay' | 'synthetic'; id: string };
export type Joint = { x: number; y: number; confidence: number | null };
export interface PoseFrame {
  version: 1;
  sessionId: string;
  seq: number;
  /** Input sampling/media time in milliseconds; strictly increasing per session. */
  tMs: number;
  source: Source;
  modelId: string;
  coordinateSpace: 'image-normalized-unmirrored';
  image: { width: number; height: number };
  /** Missing joints are omitted. x/y may lie outside [0,1]. */
  joints: Partial<Record<JointName, Joint>>;
}
export interface ActionFrame {
  version: 1;
  sessionId: string;
  inputSeq: number;
  tMs: number;
  source: Source;
  recognizerId: string;
  /** Stable action identifier; v1 baseline is squat. */
  action: string;
  phase: 'missing' | 'calibrating' | 'ready' | 'active' | 'completed';
  /** Game charge, not cycle completion or calories; 0 during missing/calibration. */
  progress: number;
  calibrationProgress: number | null;
  /** Action-specific UI cue; never used as an attack signal. */
  cue: string;
  completion: null | { id: string; repIndex: number };
}
export interface ActionRecognizer {
  reset(session: { sessionId: string; source: Source }): void;
  recalibrate(): void;
  update(frame: PoseFrame): ActionFrame | null; // null: duplicate or stale input
}
export interface GameSnapshot {
  version: 1;
  sessionId: string;
  source: Source;
  action: string;
  health: number;
  maxHealth: number;
  completedReps: number;
  targetReps: number;
  damagePerRep: number;
  lastInputSeq: number;
  lastTMs: number;
  consumedCompletionIds: string[];
  finished: boolean;
}
export interface EvaluationResult {
  version: 1;
  runId: string;
  fixtureId: string;
  evidence: 'synthetic' | 'public-fixture' | 'consented-human';
  modelId: string;
  recognizerId: string;
  device: string;
  expectedCount: number | null;
  observedCount: number;
  falseCompletions: number | null;
  missedCompletions: number | null;
  /** One-to-one annotation window. null if no event-level annotations. */
  matchingWindowMs: number | null;
  timing: { metric: 'inference_ms' | 'completion_event_delay_ms' | 'synthetic_event_delay_ms';
    p50Ms: number | null; p95Ms: number | null };
}
export function assertPoseFrame(value: unknown): asserts value is PoseFrame;
export function assertActionFrame(value: unknown): asserts value is ActionFrame;
export function assertEvaluationResult(value: unknown): asserts value is EvaluationResult;
export function sameSource(a: Source, b: Source): boolean;
