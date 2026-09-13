import { usable } from './adapter.js';

// Presentation consumes the Tracking Lab's named hand joints, never model indices.
const fingers = [
  ['#fb923c', ['wrist', 'thumbCMC', 'thumbMCP', 'thumbIP', 'thumbTip']],
  ['#facc15', ['wrist', 'indexMCP', 'indexPIP', 'indexDIP', 'indexTip']],
  ['#4ade80', ['wrist', 'middleMCP', 'middlePIP', 'middleDIP', 'middleTip']],
  ['#38bdf8', ['wrist', 'ringMCP', 'ringPIP', 'ringDIP', 'ringTip']],
  ['#c084fc', ['wrist', 'pinkyMCP', 'pinkyPIP', 'pinkyDIP', 'pinkyTip']],
];
const palmNames = ['wrist', 'indexMCP', 'middleMCP', 'ringMCP', 'pinkyMCP'];

export function palmCenter(joints) {
  const points = palmNames.map(name => joints[name]);
  if (!points.every(usable)) return null;
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
}

export function drawHand(ctx, joints, image) {
  const x = point => point.x * image.width, y = point => point.y * image.height;
  ctx.lineWidth = Math.max(2, image.width / 280);
  function chain(names, color) {
    ctx.strokeStyle = ctx.fillStyle = color;
    for (let i = 1; i < names.length; i++) {
      const a = joints[names[i - 1]], b = joints[names[i]];
      if (!usable(a) || !usable(b)) continue;
      ctx.beginPath(); ctx.moveTo(x(a), y(a)); ctx.lineTo(x(b), y(b)); ctx.stroke();
    }
  }
  for (const [color, names] of fingers) {
    chain(names, color);
    for (const name of names) {
      const point = joints[name]; if (!usable(point)) continue;
      ctx.beginPath(); ctx.arc(x(point), y(point), image.width / 180, 0, Math.PI * 2); ctx.fill();
    }
  }
  chain([...palmNames, 'wrist'], '#ffffff');
  const center = palmCenter(joints);
  if (center) { ctx.beginPath(); ctx.arc(x(center), y(center), image.width / 90, 0, Math.PI * 2); ctx.stroke(); }
  if (usable(joints.indexTip)) {
    ctx.strokeStyle = '#facc15'; ctx.beginPath();
    ctx.arc(x(joints.indexTip), y(joints.indexTip), image.width / 45, 0, Math.PI * 2); ctx.stroke();
  }
}
