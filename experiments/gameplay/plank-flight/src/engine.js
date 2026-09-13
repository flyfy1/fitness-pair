import { assertActionFrame, sameSource } from '../../../../contracts/index.js';
export const COAST_SECONDS = 3;
export function createFlight(session) {
  return { version: 1, sessionId: session.sessionId, source: { ...session.source }, action: 'plank-hold',
    health: 1, maxHealth: 1, completedReps: 0, targetReps: 1, damagePerRep: 0,
    lastInputSeq: -1, lastTMs: -1, consumedCompletionIds: [], finished: false,
    status: 'waiting', y: .52, velocity: 0, holdSeconds: 0, flightSeconds: 0,
    releasedSeconds: 0, crashSeconds: 0, passed: 0, spawned: 0, obstacles: [], reason: null, active: false };
}
export function consumeAction(state, action) {
  assertActionFrame(action);
  if (state.finished || action.sessionId !== state.sessionId || !sameSource(action.source, state.source) ||
    action.action !== state.action || action.inputSeq <= state.lastInputSeq || action.tMs <= state.lastTMs) return false;
  state.lastInputSeq = action.inputSeq; state.lastTMs = action.tMs;
  state.active = action.phase === 'active';
  if (state.status === 'waiting' && state.active) state.status = 'flying';
  return true;
}
export function crash(state, reason) {
  if (state.status !== 'flying') return;
  state.status = 'crashing'; state.reason = reason; state.active = false;
}
/** Frame-rate independent flight seconds, never pose progress/repetition scoring. */
export function stepFlight(state, dt, nowMs) {
  dt = Math.max(0, Math.min(dt, .05));
  if (state.status === 'crashing') {
    state.crashSeconds += dt; state.velocity += .8 * dt; state.y += state.velocity * dt;
    if (state.crashSeconds >= 1.6) { state.status = 'finished'; state.finished = true; state.health = 0; }
    return;
  }
  if (state.status !== 'flying') return;
  if (nowMs - state.lastTMs > 250) return; // host presents an explicit tracking interruption
  state.flightSeconds += dt;
  if (state.active) { state.holdSeconds += dt; state.releasedSeconds = 0; }
  else state.releasedSeconds += dt;
  // Support lifts gently; rest lowers. No head movement is required to steer.
  const target = state.active ? -.065 : .11;
  state.velocity += (target - state.velocity) * Math.min(1, dt * 4);
  state.y = Math.max(.12, Math.min(.88, state.y + state.velocity * dt));
  if (state.releasedSeconds >= COAST_SECONDS) { crash(state, 'rest'); return; }
  const obstacleIndex = Math.floor(state.flightSeconds / 6);
  if (obstacleIndex > state.spawned) {
    state.spawned = obstacleIndex;
    state.obstacles.push({ x: 1.12, gap: [.43,.32,.57,.38][(obstacleIndex-1)%4], counted: false });
  }
  for (const obstacle of state.obstacles) {
    obstacle.x -= dt * .105;
    if (Math.abs(obstacle.x - .28) < .065 && Math.abs(state.y - obstacle.gap) > .25 - .042) {
      crash(state, 'obstacle'); return;
    }
    if (!obstacle.counted && obstacle.x < .20) { obstacle.counted = true; state.passed++; }
  }
  state.obstacles = state.obstacles.filter(o => o.x > -.12);
}
