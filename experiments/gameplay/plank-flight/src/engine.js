import { assertActionFrame, sameSource } from '../../../../contracts/index.js';
import { projectHead, helicopterScale, helicopterWidth, validHeadControl } from './projection.js';
import { normalizeDifficulty, flightSpeed, gateOpening, MAX_FLIGHT_SPEED } from './difficulty.js';
import { FRAME_FRESH_MS } from './tracking-gate.js';
export const COUNTDOWN_SECONDS = 3;
export const GATE_INTERVAL_SECONDS = 3;
export const COLLISION_GRACE_SECONDS = .18;
export function createFlight(session, difficulty) {
  return { version: 1, sessionId: session.sessionId, source: { ...session.source }, action: 'head-flight',
    health: 1, maxHealth: 1, completedReps: 0, targetReps: 1, damagePerRep: 0,
    lastInputSeq: -1, lastTMs: -1, consumedCompletionIds: [], finished: false,
    difficulty: normalizeDifficulty(difficulty), trackingHeld: false, collisionSeconds: 0, speedGain: 0,
    status: 'waiting', countdownSeconds: 0, x: .35, y: .52, headControl: null, velocity: 0, flightSeconds: 0,
    crashSeconds: 0, passed: 0, spawned: 0, lastSpawnSeconds: 0, obstacles: [], reason: null, active: false };
}
export function consumeAction(state, action) {
  assertActionFrame(action);
  if (state.finished || state.status === 'crashing' || action.sessionId !== state.sessionId || !sameSource(action.source, state.source) ||
    action.action !== state.action || action.inputSeq <= state.lastInputSeq || action.tMs <= state.lastTMs) return false;
  if (action.headControl !== null && !validHeadControl(action.headControl)) return false;
  if (action.phase === 'active' && !action.headControl) return false;
  state.lastInputSeq = action.inputSeq; state.lastTMs = action.tMs;
  if (action.phase === 'missing') { state.trackingHeld = true; return true; }
  state.trackingHeld = false;
  state.headControl = action.headControl ? { ...action.headControl, image: { ...action.headControl.image } } : null;
  state.active = action.phase === 'active';
  if (state.status === 'waiting' && state.active) state.status = 'countdown';
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
  if (!['waiting','countdown','flying'].includes(state.status)) return;
  if (!state.trackingHeld && nowMs-state.lastTMs<=FRAME_FRESH_MS && state.headControl) {
    const position=projectHead(state.headControl,viewport.width,viewport.height);
    state.x=position.x;state.y=position.y;
  }
  if(state.status==='countdown') {
    state.countdownSeconds=Math.min(COUNTDOWN_SECONDS,state.countdownSeconds+dt);
    if(state.countdownSeconds>=COUNTDOWN_SECONDS-1e-9)state.status='flying';
    return;
  }
  if(state.status!=='flying')return;
  // Small world steps keep fast gates from crossing the collision envelope between frames.
  const steps=Math.ceil(dt/.005);
  for(let i=0;i<steps&&state.status==='flying';i++)advanceWorld(state,dt/steps,viewport);
}
function advanceWorld(state,dt,viewport) {
  // Lost tracking freezes only the helicopter position: time, speed and gates keep advancing.
  state.flightSeconds+=dt;
  state.speedGain=Math.min(MAX_FLIGHT_SPEED-state.difficulty.speed,state.speedGain+state.difficulty.acceleration*dt/60);
  // Keep edge-to-edge clearance independent of speed and the vertical gate opening.
  const separation = (34 + 2*helicopterWidth(viewport.width))/viewport.width;
  // A narrower viewport must not squeeze gates already in flight together.
  for(let i=1;i<state.obstacles.length;i++) {
    state.obstacles[i].x=Math.max(state.obstacles[i].x,state.obstacles[i-1].x+separation);
  }
  const spawnX=1+17/viewport.width, previous=state.obstacles.at(-1);
  if (state.flightSeconds-state.lastSpawnSeconds >= GATE_INTERVAL_SECONDS-1e-9 &&
      (!previous || spawnX-previous.x >= separation)) {
    state.spawned++;
    state.lastSpawnSeconds=state.flightSeconds;
    state.obstacles.push({ x: spawnX, gap: [.3,.7,.2,.8][(state.spawned-1)%4], counted: false });
  }
  const size = helicopterScale(viewport.width);
  const left = state.x*viewport.width-105*size, right = state.x*viewport.width+36*size;
  const top = state.y*viewport.height-44*size, bottom = state.y*viewport.height+42*size;
  // Preserve contact debounce at high speed without making an entire gate pass harmless.
  const crossingSeconds=(right-left+34)/(viewport.width*.105*flightSpeed(state));
  const grace=Math.min(COLLISION_GRACE_SECONDS,crossingSeconds*.5);
  let touching=false;
  for (const obstacle of state.obstacles) {
    obstacle.x -= dt * .105 * flightSpeed(state);
    const gap=gateOpening(obstacle,state.difficulty,viewport);
    const x = obstacle.x*viewport.width;
    if (right > x-17 && left < x+17 &&
      (top < gap.top*viewport.height || bottom > gap.bottom*viewport.height)) {
      touching=true;
    }
    if (!obstacle.counted && x+17 < left) { obstacle.counted = true; state.passed++; }
  }
  state.collisionSeconds=touching?state.collisionSeconds+dt:0;
  if(state.collisionSeconds>=grace)crash(state,'obstacle');
  state.obstacles = state.obstacles.filter(o => o.x > -.12);
}
