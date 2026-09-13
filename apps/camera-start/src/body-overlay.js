// Named-joint overlay. Mirroring and cover cropping match the video only;
// recognition coordinates stay unchanged and no pose is recorded.
const links = [
  ['leftShoulder', 'rightShoulder'], ['leftHip', 'rightHip'],
  ...['left', 'right'].flatMap(side => [
    [side + 'Shoulder', side + 'Hip'], [side + 'Shoulder', side + 'Elbow'],
    [side + 'Elbow', side + 'Wrist'], [side + 'Hip', side + 'Knee'],
    [side + 'Knee', side + 'Ankle'],
  ]),
];
export function drawBody(canvas, frame) {
  const { width, height } = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
    canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio);
  }
  const ctx = canvas.getContext('2d'); ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!frame || canvas.hidden) return;
  const scale = Math.max(width / frame.image.width, height / frame.image.height);
  const points = Object.fromEntries(Object.entries(frame.joints)
    .filter(([, p]) => p.confidence !== null && p.confidence >= .6)
    .map(([name, p]) => [name, { x: p.x * frame.image.width * scale + (width - frame.image.width * scale) / 2,
      y: p.y * frame.image.height * scale + (height - frame.image.height * scale) / 2 }]));
  ctx.strokeStyle = '#80ffdf'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (const [a, b] of links) {
    if (!points[a] || !points[b]) continue;
    ctx.beginPath(); ctx.moveTo(points[a].x, points[a].y); ctx.lineTo(points[b].x, points[b].y); ctx.stroke();
  }
  for (const p of Object.values(points)) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#17604c'; ctx.lineWidth = 2; ctx.stroke();
  }
}
