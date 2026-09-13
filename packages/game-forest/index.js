import { assertActionFrame, sameSource } from '@fitness-pair/contracts';

/** Pure game rules. The renderer and camera are deliberately outside this module. */
export function createGameState({ sessionId, source, action = 'squat', targetReps = 5, damagePerRep = 20 }) {
  if (!Number.isSafeInteger(targetReps) || targetReps < 1 || !Number.isFinite(damagePerRep) || damagePerRep <= 0) throw new TypeError('Invalid game configuration');
  return { version: 1, sessionId, source: { ...source }, action, maxHealth: targetReps * damagePerRep,
    health: targetReps * damagePerRep, completedReps: 0, targetReps, damagePerRep,
    lastInputSeq: -1, lastTMs: -1, consumedCompletionIds: [], finished: false };
}

/** Returns a new snapshot and an optional attack event. Re-delivery is idempotent. */
export function consumeAction(state, frame) {
  assertActionFrame(frame);
  if (state.finished || frame.sessionId !== state.sessionId || !sameSource(frame.source, state.source)
    || frame.action !== state.action || frame.inputSeq <= state.lastInputSeq || frame.tMs <= state.lastTMs) return { state, attack: null };
  const next = { ...state, lastInputSeq: frame.inputSeq, lastTMs: frame.tMs };
  if (!frame.completion || state.consumedCompletionIds.includes(frame.completion.id)) return { state: next, attack: null };
  next.completedReps++; next.health = Math.max(0, next.health - state.damagePerRep);
  next.finished = next.completedReps >= state.targetReps;
  next.consumedCompletionIds = [...state.consumedCompletionIds, frame.completion.id];
  return { state: next, attack: { completionId: frame.completion.id, damage: state.damagePerRep } };
}
