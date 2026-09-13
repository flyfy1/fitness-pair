// Synthetic named joints only. No participant image or measured hand data.
export function ratingHand(value, { xOffset = 0, mirror = false, rotation = 0 } = {}) {
  const joints = { wrist: { x: .51, y: .78 }, thumbCmc: { x: .39, y: .72 },
    thumbMcp: { x: .35, y: .62 },
    thumbIp: value === 5 ? { x: .30, y: .57 } : { x: .40, y: .60 },
    thumbTip: value === 5 ? { x: .25, y: .52 } : { x: .45, y: .59 } };
  ['index', 'middle', 'ring', 'pinky'].forEach((finger, index) => {
    const x = .43 + index * .06, y = [.52, .49, .51, .55][index];
    joints[finger + 'Mcp'] = { x, y };
    joints[finger + 'Pip'] = { x, y: y - .10 };
    joints[finger + 'Dip'] = index < value ? { x, y: y - .18 } : { x: x + .012, y: y - .04 };
    joints[finger + 'Tip'] = index < value ? { x, y: y - .25 } : { x: x + .008, y: y + .035 };
  });
  for (const p of Object.values(joints)) {
    const dx = (p.x - .5) * (mirror ? -1 : 1), dy = (p.y - .5) * .75;
    p.x = .5 + dx * Math.cos(rotation) - dy * Math.sin(rotation) + xOffset;
    p.y = .5 + (dx * Math.sin(rotation) + dy * Math.cos(rotation)) / .75;
    p.confidence = null;
  }
  return { side: mirror ? 'Left' : 'Right', category: 'None', score: 0, joints };
}
