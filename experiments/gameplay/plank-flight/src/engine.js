import { assertActionFrame, sameSource } from '../../../../contracts/index.js';
import { projectHead, helicopterScale, validHeadControl } from './projection.js';
import { normalizeDifficulty, flightSpeed, gateOpening } from './difficulty.js';
import { FRAME_FRESH_MS } from './tracking-gate.js';
export const COLLISION_GRACE_SECONDS = .18;
export function createFlight(session, difficulty) {
  return { version: 1, sessionId: session.sessionId, source: { ...session.source }, action: 'head-flight',
    health: 1, maxHealth: 1, completedReps: 0, targetReps: 1, damagePerRep: 0,
    lastInputSeq: -1, lastTMs: -1, consumedCompletionIds: [], finished: false,
    difficulty: normalizeDifficulty(difficulty), trackingHeld: false, collisionSeconds: 0, speedGain: 0,
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
  if (!['waiting','flying'].includes(state.status)) return;
  if (!state.trackingHeld && nowMs-state.lastTMs<=FRAME_FRESH_MS && state.headControl) {
    const position=projectHead(state.headControl,viewport.width,viewport.height);
    state.x=position.x;state.y=position.y;
  }
  if(state.status!=='flying')return;
  // Lost tracking freezes only the helicopter position: time, speed and gates keep advancing.
  state.flightSeconds+=dt;
  state.speedGain=Math.min(2.6,state.speedGain+state.difficulty.acceleration*dt/60);
  const obstacleIndex = Math.floor(state.flightSeconds / 6);
  if (obstacleIndex > state.spawned) {
    state.spawned = obstacleIndex;
    state.obstacles.push({ x: 1.12, gap: [.3,.7,.2,.8][(obstacleIndex-1)%4], counted: false });
  }
  const size = helicopterScale(viewport.width);
  const left = state.x*viewport.width-105*size, right = state.x*viewport.width+36*size;
  const top = state.y*viewport.height-44*size, bottom = state.y*viewport.height+42*size;
  let touching=false;
  for (const obstacle of state.obstacles) {
    obstacle.x -= dt * .105 * flightSpeed(state);
    const gap=gateOpening(obstacle,state.difficulty);
    const x = obstacle.x*viewport.width;
    if (right > x-17 && left < x+17 &&
      (top < gap.top*viewport.height || bottom > gap.bottom*viewport.height)) {
      touching=true;
    }
    if (!obstacle.counted && x+17 < left) { obstacle.counted = true; state.passed++; }
  }
  state.collisionSeconds=touching?state.collisionSeconds+dt:0;
  if(state.collisionSeconds>=COLLISION_GRACE_SECONDS)crash(state,'obstacle');
  state.obstacles = state.obstacles.filter(o => o.x > -.12);
}
