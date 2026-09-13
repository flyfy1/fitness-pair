import { MOTION_MAX_HEIGHT } from '../../../../apps/dino-run/src/engine.js';

/** Same center-cropped, mirrored transform as the video; input stays unmirrored. */
export function videoProjection(image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale, h = image.height * scale;
  return { height: h, point: ({ x, y }) => ({ x: (width - w) / 2 + (1 - x) * w, y: (height - h) / 2 + y * h }) };
}

export function anchorFromPose(frame, action) {
  const names = action.trackingMode === 'full-body' ? ['leftAnkle', 'rightAnkle'] : ['leftHip', 'rightHip'];
  const points = names.map(name => frame.joints[name]);
  if (points.some(p => !p || p.confidence === null || p.confidence < .6) || !(action.peakRise > 0)) return null;
  return { image: { ...frame.image }, x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2, peakRise: action.peakRise, mode: action.trackingMode };
}

export function sceneGeometry(anchor, width, height) {
  const projection = videoProjection(anchor.image, width, height);
  const origin = projection.point(anchor);
  const sx = Math.max(.65, Math.min(1.4, width / 900));
  const sy = anchor.peakRise * projection.height / MOTION_MAX_HEIGHT;
  return { origin, sx, sy, worldWidth: 100 + (width - origin.x) / sx,
    player: rise => ({ x: origin.x - 16 * sx, y: origin.y - (rise + 47) * sy, w: 32 * sx, h: 44 * sy }),
    obstacle: o => ({ x: origin.x + (o.x + 4 - 100) * sx, y: origin.y + (-o.h + 4) * sy, w: (o.w - 8) * sx, h: (o.h - 4) * sy }) };
}

const bones = [
  ['leftShoulder', 'rightShoulder'], ['leftHip', 'rightHip'],
  ...['left', 'right'].flatMap(s => [['Shoulder', 'Elbow'], ['Elbow', 'Wrist'], ['Shoulder', 'Hip'], ['Hip', 'Knee'], ['Knee', 'Ankle']].map(pair => pair.map(j => s + j))),
];

function context(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  }
  const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, width, height);
  return { c, width, height };
}

export function drawSkeleton(canvas, frame) {
  const { c, width, height } = context(canvas);
  if (!frame || canvas.hidden) return;
  const { point } = videoProjection(frame.image, width, height);
  const usable = p => p && p.confidence !== null && p.confidence >= .6;
  c.strokeStyle = '#d8ff81'; c.fillStyle = '#fff'; c.lineWidth = 3;
  for (const [a, b] of bones) {
    if (!usable(frame.joints[a]) || !usable(frame.joints[b])) continue;
    const from = point(frame.joints[a]), to = point(frame.joints[b]);
    c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(to.x, to.y); c.stroke();
  }
  for (const joint of Object.values(frame.joints)) if (usable(joint)) {
    const p = point(joint); c.beginPath(); c.arc(p.x, p.y, 4, 0, Math.PI * 2); c.fill();
  }
}

export function drawWorld(canvas, runner, anchor) {
  const { c, width, height } = context(canvas);
  if (!anchor) return null;
  const g = sceneGeometry(anchor, width, height);
  runner.width = g.worldWidth;
  c.strokeStyle = '#d8ff8180'; c.lineWidth = 2;
  c.setLineDash([6, 12]); c.beginPath(); c.moveTo(0, g.origin.y); c.lineTo(width, g.origin.y); c.stroke(); c.setLineDash([]);
  for (const o of runner.obstacles) {
    const box = g.obstacle(o);
    c.fillStyle = '#ffb788'; c.shadowColor = '#ff7b3e'; c.shadowBlur = 16;
    c.fillRect(box.x, box.y, box.w, box.h);
    // Cactus arms are decorative; the solid central trunk is the collision area.
    c.shadowBlur = 0; c.strokeStyle = '#ffd2a3'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(box.x, box.y + box.h * .6); c.lineTo(box.x - 7, box.y + box.h * .6); c.lineTo(box.x - 7, box.y + box.h * .25);
    c.moveTo(box.x + box.w, box.y + box.h * .4); c.lineTo(box.x + box.w + 7, box.y + box.h * .4); c.lineTo(box.x + box.w + 7, box.y); c.stroke();
  }
  const player = g.player(runner.y);
  c.fillStyle = runner.status === 'over' ? '#ffb78880' : '#d8ff8150';
  c.strokeStyle = runner.status === 'over' ? '#ffb788' : '#d8ff81'; c.lineWidth = 2;
  c.fillRect(player.x, player.y, player.w, player.h); c.strokeRect(player.x, player.y, player.w, player.h);
  c.shadowColor = '#d8ff81'; c.shadowBlur = 16;
  c.beginPath(); c.ellipse(g.origin.x, player.y + player.h, player.w * .8, 5, 0, 0, Math.PI * 2); c.stroke(); c.shadowBlur = 0;
  c.font = 'bold 11px system-ui'; c.textAlign = 'center'; c.fillStyle = '#f6ffef';
  c.fillText(anchor.mode === 'upper-body' ? 'YOU · TORSO MARKER' : 'YOU', g.origin.x, player.y - 12);
  return g;
}
