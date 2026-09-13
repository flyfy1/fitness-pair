export const RATINGS = [
  { id: 'Rating_1', icon: '1', name: '1 point', rating: 1, hint: 'Extend your index finger. Fold the other fingers and thumb.' },
  { id: 'Rating_2', icon: '2', name: '2 points', rating: 2, hint: 'Extend your index and middle fingers, like a V. Fold your thumb.' },
  { id: 'Rating_3', icon: '3', name: '3 points', rating: 3, hint: 'Extend your index, middle and ring fingers. Fold your pinky and thumb.' },
  { id: 'Rating_4', icon: '4', name: '4 points', rating: 4, hint: 'Extend all four fingers. Fold your thumb across your palm.' },
  { id: 'Rating_5', icon: '5', name: '5 points', rating: 5, hint: 'Spread all five fingers. Keep your hand still instead of waving.' },
];

const fingers = ['index', 'middle', 'ring', 'pinky'];
const names = ['wrist', 'thumbCmc', 'thumbMcp', 'thumbIp', 'thumbTip',
  ...fingers.flatMap(f => ['Mcp', 'Pip', 'Dip', 'Tip'].map(j => f + j))];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function angle(a, b, c) {
  const ab = distance(a, b), cb = distance(c, b);
  if (ab < .001 || cb < .001) return null;
  const dot = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y);
  return Math.acos(Math.max(-1, Math.min(1, dot / (ab * cb)))) * 180 / Math.PI;
}

/** Experimental 2D geometry, not the model's canned gesture classifier.
 * Rotation/reflection independent, aspect corrected, with an ambiguity band. */
export function readRating(hand, image) {
  if (!hand || !image || image.width <= 0 || image.height <= 0) return null;
  const joints = hand.joints;
  if (names.some(name => {
    const p = joints?.[name];
    return !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
      p.x < .01 || p.x > .99 || p.y < .01 || p.y > .99;
  })) return null;
  const j = Object.fromEntries(names.map(name => [name, { x: joints[name].x, y: joints[name].y * image.height / image.width }]));
  const palm = distance(j.indexMcp, j.pinkyMcp);
  if (palm < .045 || distance(j.wrist, j.middleMcp) < .04) return null;
  const states = fingers.map(f => {
    const a = angle(j[f + 'Mcp'], j[f + 'Pip'], j[f + 'Dip']);
    const b = angle(j[f + 'Pip'], j[f + 'Dip'], j[f + 'Tip']);
    const reach = distance(j.wrist, j[f + 'Tip']) / distance(j.wrist, j[f + 'Pip']);
    if (a === null || b === null || !Number.isFinite(reach)) return null;
    if (a >= 155 && b >= 150 && reach >= 1.12) return true;
    if (a <= 130 || reach <= 1.02) return false;
    return null;
  });
  if (states.includes(null)) return null;
  // Project along the palm's pinky-to-index axis: an open thumb points beyond
  // the index side; a folded thumb crosses inward over the palm. Distance alone
  // misclassifies a long folded thumb in the public V-sign fixture.
  const thumbOutward = ((j.thumbTip.x - j.indexMcp.x) * (j.indexMcp.x - j.pinkyMcp.x) +
    (j.thumbTip.y - j.indexMcp.y) * (j.indexMcp.y - j.pinkyMcp.y)) / (palm * palm);
  const thumbAngle = angle(j.thumbMcp, j.thumbIp, j.thumbTip);
  const thumb = thumbOutward > .35 && thumbAngle >= 150 ? true :
    thumbOutward < .15 && distance(j.thumbTip, j.middleMcp) < palm * 1.1 ? false : null;
  if (thumb === null) return null;
  const pattern = states.map(v => v ? '1' : '0').join('');
  if (thumb) return pattern === '1111' ? 5 : null; // A thumbs up is never 1.
  return { '1000': 1, '1100': 2, '1110': 3, '1111': 4 }[pattern] ?? null;
}
