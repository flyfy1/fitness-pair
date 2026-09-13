const pixel = (c, x, y, w, h, color) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };

export function drawDino(c, x, ground, jump, time, dead = false) {
  c.save(); c.translate(Math.round(x), Math.round(ground - jump));
  const ink = dead ? '#8e7657' : '#3d5e3b';
  // Original pixel silhouette, built directly from rectangles.
  for (const [a,b,w,h] of [[18,-54,27,6],[14,-48,36,17],[14,-31,23,8],[8,-30,20,23],[2,-24,10,14],[-5,-29,8,14],[-10,-36,6,15],[25,-24,12,5],[34,-21,4,7],[8,-9,8,9],[23,-9,7,9]]) pixel(c,a,b,w,h,ink);
  pixel(c,36,-44,4,4,'#f1f5e5');
  pixel(c,34,-33,16,3,'#f1f5e5');
  if (dead) { pixel(c,34,-46,3,3,'#f1f5e5'); pixel(c,40,-40,3,3,'#f1f5e5'); }
  const stride = jump > 0 || dead ? 0 : Math.floor(time * 11) % 2;
  pixel(c,8,-3,14,stride ? 3 : 6,ink); pixel(c,23,-3,13,stride ? 6 : 3,ink);
  pixel(c,16,-25,7,12,dead ? '#ad9874' : '#8fa777');
  c.restore();
}

export class Renderer {
  constructor(canvas, runner) {
    this.canvas = canvas; this.runner = runner; this.ctx = canvas.getContext('2d');
    this.resize = this.resize.bind(this); this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas); this.resize();
  }
  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio);
    // Scale the world uniformly so fullscreen enlarges the character and jump too.
    this.scale = Math.max(.01, Math.min(width / 480, height / 360));
    this.runner.width = width / this.scale;
    this.height = height / this.scale; this.ratio = ratio;
    this.draw();
  }
  draw() {
    const c = this.ctx, g = this.runner, w = g.width, h = this.height, floor = h - 65;
    c.setTransform(this.ratio * this.scale, 0, 0, this.ratio * this.scale, 0, 0);
    c.fillStyle = '#f1f5e5'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8edce'; c.beginPath(); c.arc(w - 113, 72, 27, 0, Math.PI * 2); c.fill();
    const offset = g.distance * 20;
    for (let i = 0; i < 5; i++) {
      const x = ((i * 263 + 40 - offset * .065) % (w + 170) + w + 170) % (w + 170) - 80;
      const y = 63 + (i % 3) * 34;
      pixel(c,x,y,53,4,'#dce5cb'); pixel(c,x+12,y-5,25,5,'#dce5cb');
    }
    c.strokeStyle = '#dce4c8'; c.lineWidth = 1.4;
    for (let i = 0; i < 5; i++) {
      const x = ((i * 310 - offset * .12) % (w + 380) + w + 380) % (w + 380) - 180;
      c.beginPath(); c.moveTo(x, floor); c.lineTo(x+100,floor-63-(i%2)*26); c.lineTo(x+190,floor-13); c.lineTo(x+220,floor-30); c.lineTo(x+270,floor); c.stroke();
    }
    pixel(c,0,floor,w,2,'#a7b98c');
    pixel(c,0,floor+2,w,h-floor,'#ebf0dc');
    for(let i=0;i<40;i++) {
      const x = ((i * 73 - offset) % (w + 80) + w + 80) % (w + 80);
      pixel(c,x,floor+13+(i%4)*9,i%3===0?9:3,2,'#ccd7b8');
    }
    c.fillStyle='#d3ddbc'; c.beginPath(); c.ellipse(99,floor+5,25 - g.y*.08,4,0,0,Math.PI*2); c.fill();
    for (const o of g.obstacles) {
      const x = o.x, y = floor - o.h, color = '#758b56';
      pixel(c,x+o.w*.4,y,o.w*.25,o.h,color);
      pixel(c,x+o.w*.06,y+o.h*.32,o.w*.18,o.h*.38,color);
      pixel(c,x+o.w*.06,y+o.h*.59,o.w*.5,7,color);
      pixel(c,x+o.w*.78,y+o.h*.2,o.w*.18,o.h*.33,color);
      pixel(c,x+o.w*.57,y+o.h*.46,o.w*.39,7,color);
      pixel(c,x+o.w*.45,y+5,3,o.h-9,'#9bac7d');
    }
    drawDino(c,80,floor,g.y,g.status==='ready'?0:g.elapsed,g.status==='over');
  }
}
