export const DEFAULT_DIFFICULTY = Object.freeze({ opening:.5, speed:1, acceleration:.4 });
const clamp = (value,min,max,fallback) => Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export function normalizeDifficulty(value={}) {
  return { opening:clamp(value.opening,.3,.7,.5), speed:clamp(value.speed,.4,1.8,1),
    acceleration:clamp(value.acceleration,0,1.5,.4) };
}
/** The acceleration slider is speed-multiplier growth per minute of active flight. */
export function flightSpeed(state) {
  return Math.min(3,state.difficulty.speed+state.speedGain);
}
export function gateOpening(obstacle,difficulty) {
  const half=difficulty.opening/2;
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
