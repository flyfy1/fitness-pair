import { helicopterHeight } from './projection.js';
export const MAX_FLIGHT_SPEED = 10;
export const DEFAULT_DIFFICULTY = Object.freeze({ opening:4, speed:1, acceleration:.4 });
const clamp = (value,min,max,fallback) => Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export function normalizeDifficulty(value={}) {
  return { opening:clamp(value.opening,2,6,4), speed:clamp(value.speed,.4,6,1),
    acceleration:clamp(value.acceleration,0,1.5,.4) };
}
/** The acceleration slider is speed-multiplier growth per minute of active flight. */
export function flightSpeed(state) {
  return Math.min(MAX_FLIGHT_SPEED,state.difficulty.speed+state.speedGain);
}
export function gateOpening(obstacle,difficulty,viewport={width:1280,height:720}) {
  const half=Math.min(.96,difficulty.opening*helicopterHeight(viewport.width)/viewport.height)/2;
  const center=Math.max(half+.02,Math.min(1-half-.02,obstacle.gap));
  return {top:center-half,bottom:center+half};
}
export function setDifficulty(state,value) {
  const next=normalizeDifficulty(value);
  if(next.speed!==state.difficulty.speed)state.speedGain=0;
  state.difficulty=next;
  // Changing the gate opening starts a fresh contact interval, never inherits an old hit.
  state.collisionSeconds=0;
}
