// Experiment-local names; this is not the shared body PoseFrame contract.
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const NAMES = ['wrist', 'thumbCMC', 'thumbMCP', 'thumbIP', 'thumbTip',
  ...FINGERS.slice(1).flatMap(finger => ['MCP', 'PIP', 'DIP', 'Tip'].map(joint => finger + joint))];
export const CHAINS = FINGERS.map((finger, index) => ['wrist', ...NAMES.slice(1 + index * 4, 5 + index * 4)]);

export function toHandFrame(result, sessionId, image) {
  const hands = result.landmarks.slice(0, 2).flatMap((points, index) => {
    if (points.length !== 21 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return [];
    const joints = Object.fromEntries(NAMES.map((name, i) => [name, { x: points[i].x, y: points[i].y }]));
    const category = result.handedness[index]?.[0];
    const side = ['Left', 'Right'].includes(category?.categoryName) ? category.categoryName : 'Unknown';
    const bases = ['wrist', 'indexMCP', 'middleMCP', 'ringMCP', 'pinkyMCP'].map(name => joints[name]);
    return [{ side, handednessScore: Number.isFinite(category?.score) ? category.score : null, joints,
      palm: { x: bases.reduce((sum, p) => sum + p.x, 0) / 5, y: bases.reduce((sum, p) => sum + p.y, 0) / 5 } }];
  });
  return { sessionId, seq: result.seq, tMs: result.tMs, source: { kind: 'camera', id: sessionId },
    modelId: 'mediapipe-hand-f16-v1/tasks-vision-0.10.32',
    coordinateSpace: 'image-normalized-unmirrored', image, hands };
}

export function drawHands(canvas, frame) {
  const ctx = canvas.getContext('2d');
  canvas.width = frame.image.width; canvas.height = frame.image.height;
  const colors = ['#fb923c', '#facc15', '#4ade80', '#38bdf8', '#c084fc'];
  const x = p => p.x * canvas.width, y = p => p.y * canvas.height;
  ctx.lineWidth = Math.max(2, canvas.width / 240);
  for (const hand of frame.hands) {
    CHAINS.forEach((chain, finger) => {
      ctx.strokeStyle = ctx.fillStyle = colors[finger]; ctx.beginPath();
      chain.forEach((name, i) => { const p = hand.joints[name]; if (i) ctx.lineTo(x(p), y(p)); else ctx.moveTo(x(p), y(p)); });
      ctx.stroke();
      for (const name of chain) { const p = hand.joints[name]; ctx.beginPath(); ctx.arc(x(p), y(p), ctx.lineWidth * 1.5, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.strokeStyle = '#fff'; ctx.beginPath();
    for (const [i, name] of ['wrist', 'indexMCP', 'middleMCP', 'ringMCP', 'pinkyMCP', 'wrist'].entries()) {
      const p = hand.joints[name]; if (i) ctx.lineTo(x(p), y(p)); else ctx.moveTo(x(p), y(p));
    }
    ctx.stroke(); ctx.beginPath(); ctx.arc(x(hand.palm), y(hand.palm), ctx.lineWidth * 3, 0, Math.PI * 2); ctx.stroke();
  }
}
