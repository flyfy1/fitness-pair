import { MOTION_MAX_HEIGHT } from '../../../../apps/dino-run/src/engine.js';

/** Same center-cropped, mirrored transform as the video; input stays unmirrored. */
export function videoProjection(image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale, h = image.height * scale;
  return { height: h, point: ({ x, y }) => ({ x: (width - w) / 2 + (1 - x) * w, y: (height - h) / 2 + y * h }) };
}

/** One uniform transform keeps visible hitboxes identical to the game rules.
 * Size depends on the viewport, never on a camera crop or shoulder span. */
export function sceneGeometry(width, height) {
  const portrait = width < 700 && height >= 600;
  const origin = { x: width * .22, y: height * (portrait ? .73 : .80) };
  const top = height < 600 ? 100 : height * .28;
  const scale = Math.min((origin.y - top) / (MOTION_MAX_HEIGHT + 47), width / 180);
  return { origin, sx: scale, sy: scale, worldWidth: 100 + (width - origin.x) / scale,
    player: rise => ({ x: origin.x - 16 * scale, y: origin.y - (rise + 47) * scale, w: 32 * scale, h: 44 * scale }),
    obstacle: o => ({ x: origin.x + (o.x + 4 - 100) * scale, y: origin.y + (-o.h + 4) * scale, w: (o.w - 8) * scale, h: (o.h - 4) * scale }) };
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

function drawDino(c, player, runner, debug) {
  const scale = player.h / 44;
  c.save(); c.translate(player.x, player.y); c.scale(scale, scale);
  c.fillStyle = runner.status === 'over' ? '#ffb788' : '#d8ff81';
  c.strokeStyle = '#173827'; c.lineWidth = 1.6; c.lineJoin = 'round';
  // Tail and cactus arms are decorative; debug exposes the rectangular hitboxes.
  c.beginPath(); c.moveTo(14,0); c.lineTo(32,0); c.lineTo(32,16);
  c.lineTo(22,16); c.lineTo(22,20); c.lineTo(27,20); c.lineTo(27,24);
  c.lineTo(19,24); c.lineTo(16,34); c.lineTo(4,34); c.lineTo(3,30);
  c.lineTo(-10,21); c.lineTo(-10,10); c.lineTo(3,21); c.lineTo(9,21);
  c.lineTo(9,15); c.lineTo(14,15); c.closePath(); c.fill(); c.stroke();
  const stride = runner.status === 'running' && runner.y === 0 ? Math.floor(runner.elapsed * 9) % 2 : 0;
  for (const [x, lift] of [[4,stride * 4],[13,(1-stride) * 4]]) {
    c.fillRect(x,31,5,11-lift); c.fillRect(x,39-lift,9,5); c.strokeRect(x,39-lift,9,5);
  }
  c.fillStyle = '#173827'; c.fillRect(25,4,3,4); c.fillRect(25,12,7,2);
  c.fillStyle = '#f6ffdf'; c.fillRect(16,3,5,2); c.fillRect(7,25,6,2);
  c.restore();
  if (debug) {
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.setLineDash([5,4]);
    c.strokeRect(player.x,player.y,player.w,player.h); c.setLineDash([]);
  }
}

export function drawWorld(canvas, runner, debug = false) {
  const { c, width, height } = context(canvas);
  const g = sceneGeometry(width, height);
  runner.width = g.worldWidth;
  const ground = c.createLinearGradient(0,g.origin.y,0,height);
  ground.addColorStop(0,'#10241ed9'); ground.addColorStop(1,'#10241ef5');
  c.fillStyle = ground; c.fillRect(0,g.origin.y,width,height-g.origin.y);
  c.strokeStyle = '#d8ff81'; c.lineWidth = Math.max(3,g.sx * 2);
  c.beginPath(); c.moveTo(0,g.origin.y); c.lineTo(width,g.origin.y); c.stroke();
  c.fillStyle = '#96b46c';
  const spacing = 60 * g.sx, offset = (runner.distance * 20 * g.sx) % spacing;
  for (let x = -offset; x < width; x += spacing) c.fillRect(x,g.origin.y+10*g.sy,18*g.sx,2*g.sy);
  for (const o of runner.obstacles) {
    const box = g.obstacle(o);
    c.fillStyle = '#ffb788'; c.strokeStyle = '#573322'; c.lineWidth = Math.max(2,g.sx);
    c.fillRect(box.x,box.y,box.w,box.h); c.strokeRect(box.x,box.y,box.w,box.h);
    c.strokeStyle = '#ffb788'; c.lineWidth = 4 * g.sx; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(box.x,box.y+box.h*.65); c.lineTo(box.x-7*g.sx,box.y+box.h*.65); c.lineTo(box.x-7*g.sx,box.y+box.h*.25);
    c.moveTo(box.x+box.w,box.y+box.h*.45); c.lineTo(box.x+box.w+7*g.sx,box.y+box.h*.45); c.lineTo(box.x+box.w+7*g.sx,box.y+box.h*.1); c.stroke();
    c.fillStyle = '#ffe6b9'; c.fillRect(box.x+box.w*.25,box.y+3*g.sy,Math.max(2,g.sx),box.h*.65);
    if (debug) { c.strokeStyle='#fff'; c.lineWidth=2; c.strokeRect(box.x,box.y,box.w,box.h); }
  }
  const player = g.player(runner.y);
  c.fillStyle = '#d8ff8130'; c.beginPath();
  c.ellipse(g.origin.x,g.origin.y-3*g.sy,player.w*.65,5*g.sy,0,0,Math.PI*2); c.fill();
  drawDino(c,player,runner,debug);
  return g;
}
