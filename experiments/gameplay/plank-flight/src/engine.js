import { assertActionFrame, sameSource } from '../../../../contracts/index.js';
import { projectHead, helicopterScale, validHeadControl } from './projection.js';
export function createFlight(session) {
  return { version: 1, sessionId: session.sessionId, source: { ...session.source }, action: 'head-flight',
    health: 1, maxHealth: 1, completedReps: 0, targetReps: 1, damagePerRep: 0,
    lastInputSeq: -1, lastTMs: -1, consumedCompletionIds: [], finished: false,
    status: 'waiting', x: .35, y: .52, headControl: null, velocity: 0, flightSeconds: 0,
    crashSeconds: 0, passed: 0, spawned: 0, obstacles: [], reason: null, active: false };
}
export function consumeAction(state, action) {
  assertActionFrame(action);
  if (state.finished || state.status === 'crashing' || action.sessionId !== state.sessionId || !sameSource(action.source, state.source) ||
    action.action !== state.action || action.inputSeq <= state.lastInputSeq || action.tMs <= state.lastTMs) return false;
  if (action.headControl !== null && !validHeadControl(action.headControl)) return false;
  if (action.phase === 'active' && !action.headControl) return false;
  state.lastInputSeq = action.inputSeq; state.lastTMs = action.tMs;
  state.headControl = action.headControl ? { ...action.headControl, image: { ...action.headControl.image } } : null;
  state.active = action.phase === 'active';
  if (state.status === 'waiting' && state.active) state.status = 'flying';
  return true;
}
export function crash(state, reason) {
  if (state.status !== 'flying') return;
  state.status = 'crashing'; state.reason = reason; state.active = false;
}
/** Follow camera position directly; elapsed flight time is not workout or rep credit. */
export function stepFlight(state, dt, nowMs, viewport = { width: 1280, height: 720 }) {
  dt = Math.max(0, Math.min(dt, .05));
  if (state.status === 'crashing') {
    state.crashSeconds += dt; state.velocity += .8 * dt; state.y += state.velocity * dt;
    if (state.crashSeconds >= 1.6) { state.status = 'finished'; state.finished = true; state.health = 0; }
    return;
  }
  if (nowMs - state.lastTMs > 250 || !state.headControl) return;
  if (!['waiting','flying'].includes(state.status)) return;
  const position = projectHead(state.headControl, viewport.width, viewport.height);
  state.x = position.x; state.y = position.y;
  if (state.status !== 'flying' || !state.active) return;
  state.flightSeconds += dt;
  const obstacleIndex = Math.floor(state.flightSeconds / 6);
  if (obstacleIndex > state.spawned) {
    state.spawned = obstacleIndex;
    state.obstacles.push({ x: 1.12, gap: [.43,.32,.57,.38][(obstacleIndex-1)%4], counted: false });
  }
  const size = helicopterScale(viewport.width);
  const left = state.x*viewport.width-105*size, right = state.x*viewport.width+36*size;
  const top = state.y*viewport.height-44*size, bottom = state.y*viewport.height+42*size;
  for (const obstacle of state.obstacles) {
    obstacle.x -= dt * .105;
    const x = obstacle.x*viewport.width;
    if (right > x-17 && left < x+17 &&
      (top < (obstacle.gap-.25)*viewport.height || bottom > (obstacle.gap+.25)*viewport.height)) {
      crash(state, 'obstacle'); return;
    }
    if (!obstacle.counted && x+17 < left) { obstacle.counted = true; state.passed++; }
  }
  state.obstacles = state.obstacles.filter(o => o.x > -.12);
}
