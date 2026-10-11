export const duelSlugs = ['breakout', 'stack', 'knife'];
export const DUEL_DURATION_MS = 60_000;
export const validAction = action => ['ready', 'active', 'completed'].includes(action?.phase);
// Knife's native score resets after a cleared target; a duel counts every hit.
export function duelScore(slug, state) {
  if (slug !== 'knife') return state.score;
  const stages = Math.max(0, Math.round((state.targets - 8) / 3));
  return state.score + stages * 8 + 3 * stages * (stages - 1) / 2;
}
export function duelResult(scores) {
  return scores[0] === scores[1] ? 'Draw' : scores[0] > scores[1] ? 'Left player wins' : 'Right player wins';
}
export function seededRandom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
