const TAU = Math.PI * 2;
const rounded = (ctx, x, y, w, h, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };

export class ForestGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.charge = 0; this.hp = 100; this.attackAt = -10000; this.damageAt = -10000;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const box = this.canvas.getBoundingClientRect();
    this.width = box.width; this.height = box.height;
    this.canvas.width = box.width * dpr; this.canvas.height = box.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  reset() { this.hp = 100; this.charge = 0; this.attackAt = -10000; this.damageAt = -10000; }
  attack(hp) { this.hp = hp; this.attackAt = performance.now(); this.damageAt = this.attackAt + 350; }
  draw(time) {
    const c = this.ctx, w = this.width, h = this.height;
    if (!w || !h) return;
    const t = this.reducedMotion ? 0 : time / 1000;
    c.clearRect(0, 0, w, h);
    const bg = c.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#1b322b'); bg.addColorStop(.6, '#4a6544'); bg.addColorStop(1, '#1d3729');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.save();
    const glow = c.createRadialGradient(w * .52, h * .39, 0, w * .52, h * .39, w * .6);
    glow.addColorStop(0, '#b4d7792c'); glow.addColorStop(1, '#a5cb7900'); c.fillStyle = glow; c.fillRect(0, 0, w, h);
    // Layered trunks and angular canopies, drawn directly in canvas.
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 9; i++) {
        const x = (i / 8) * w + Math.sin(i * 17 + layer) * 25;
        const thick = 13 + layer * 7; const base = h * (.68 + layer * .085);
        const top = -30 + Math.cos(i * 23) * 35;
        c.fillStyle = ['#26453677', '#1c382bc0', '#193125'][layer];
        c.beginPath(); c.moveTo(x, base); c.lineTo(x + thick, base); c.lineTo(x + thick * .4, top); c.lineTo(x - thick * .4, top); c.fill();
        for (let j = 0; j < 3; j++) {
          const cy = top + j * h * .15; const spread = 65 + layer * 19;
          c.beginPath(); c.moveTo(x, cy - 50); c.lineTo(x - spread, cy + 78); c.quadraticCurveTo(x, cy + 56, x + spread, cy + 78); c.closePath(); c.fill();
        }
      }
    }
    // Light shafts.
    c.fillStyle = '#e1ecad08'; c.beginPath(); c.moveTo(w * .48, 0); c.lineTo(w * .63, 0); c.lineTo(w * .40, h); c.lineTo(w * .05, h); c.fill();
    c.beginPath(); c.moveTo(w * .72, 0); c.lineTo(w * .76, 0); c.lineTo(w * .72, h); c.lineTo(w * .49, h); c.fill();
    c.fillStyle = '#294832'; c.beginPath(); c.ellipse(w * .5, h * .94, w * .78, h * .21, -.02, 0, TAU); c.fill();
    c.fillStyle = '#426044'; c.beginPath(); c.ellipse(w * .50, h * .81, w * .37, h * .083, 0, 0, TAU); c.fill();
    c.fillStyle = '#536b48'; c.beginPath(); c.ellipse(w * .5, h * .8, w * .31, h * .052, 0, 0, TAU); c.fill();
    for (let i = 0; i < 34; i++) {
      const x = ((i * 137.23) % w), y = h * .77 + (Math.sin(i * 43) + 1) * h * .10;
      c.strokeStyle = i % 2 ? '#69864b' : '#7b935540'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 2, y - 8, x - 6, y - 9); c.moveTo(x, y); c.lineTo(x + 3, y - 12); c.stroke();
    }
    const scale = Math.min(w / 760, h / 520);
    const heroX = w * .29, bossX = w * .71, ground = h * .785;
    const attackAge = time - this.attackAt;
    const hitAge = time - this.damageAt;
    const shake = hitAge > 0 && hitAge < 300 ? Math.sin(hitAge / 20) * 6 : 0;
    this.hero(heroX + (attackAge >= 0 && attackAge < 400 ? Math.sin(attackAge / 400 * Math.PI) * 17 : 0), ground, scale, t);
    this.boss(bossX + shake, ground, scale, t, hitAge);
    if (attackAge >= 0 && attackAge < 500) {
      const progress = Math.min(1, attackAge / 350); const x = heroX + 28 * scale + (bossX - heroX - 45 * scale) * progress;
      const y = ground - 65 * scale - Math.sin(progress * Math.PI) * 30;
      c.shadowBlur = 25; c.shadowColor = '#d2fb82'; c.fillStyle = '#e8ffa6'; c.beginPath(); c.arc(x, y, 10 * scale, 0, TAU); c.fill();
      c.globalAlpha = .35; c.fillStyle = '#cded81'; c.beginPath(); c.ellipse(x - 23 * scale, y, 34 * scale, 7 * scale, 0, 0, TAU); c.fill(); c.globalAlpha = 1; c.shadowBlur = 0;
    }
    if (hitAge >= 0 && hitAge < 850) {
      c.globalAlpha = 1 - hitAge / 850; c.fillStyle = '#ebffa6'; c.font = `bold ${26 * scale}px sans-serif`; c.textAlign = 'center'; c.fillText('−20', bossX, ground - 122 * scale - hitAge / 22); c.globalAlpha = 1;
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; c.fillStyle = i % 2 ? '#ebce89' : '#d1f891'; c.beginPath(); c.arc(bossX + Math.cos(a) * hitAge * .13, ground - 55 * scale + Math.sin(a) * hitAge * .1, 3 * scale, 0, TAU); c.fill(); }
    }
    for (let i = 0; i < 16; i++) {
      const x = (i * 89.7 + Math.sin(t * .4 + i) * 13) % w; const y = h * .42 + ((i * 49.7) % (h * .40)) + Math.cos(t * .6 + i) * 8;
      c.globalAlpha = .25 + (Math.sin(t * 1.8 + i) + 1) * .2; c.fillStyle = '#d0e790'; c.beginPath(); c.arc(x, y, i % 3 ? 1.4 : 2, 0, TAU); c.fill();
    }
    c.restore();
  }
  hero(x, y, scale, t) {
    const c = this.ctx; const crouch = this.charge * 15;
    c.save(); c.translate(x, y); c.scale(scale, scale);
    c.fillStyle = '#10281966'; c.beginPath(); c.ellipse(0, 3, 39, 9, 0, 0, TAU); c.fill();
    if (this.charge > .05) {
      c.strokeStyle = '#d2f590'; c.globalAlpha = this.charge; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 1, 44 + this.charge * 13, 12, 0, 0, TAU); c.stroke(); c.globalAlpha = 1;
    }
    c.translate(0, crouch + Math.sin(t * 2.4) * 1.3);
    rounded(c, -19, -25 - crouch, 14, 27, 5, '#283a28'); rounded(c, 7, -25 - crouch, 14, 27, 5, '#283a28');
    rounded(c, -24, -65, 49, 49 - crouch, [17, 17, 9, 9], '#bfcb88');
    c.fillStyle = '#7f9a58'; c.beginPath(); c.moveTo(-27, -62); c.lineTo(-35, -15); c.lineTo(8, -25); c.lineTo(7, -71); c.fill();
    rounded(c, -21, -104, 45, 44, 17, '#e4d3a0');
    c.fillStyle = '#a8cc75'; c.beginPath(); c.moveTo(-29, -81); c.quadraticCurveTo(-31, -126, 4, -122); c.quadraticCurveTo(30, -116, 28, -87); c.quadraticCurveTo(8, -105, -29, -81); c.fill();
    c.fillStyle = '#34492b'; c.beginPath(); c.ellipse(9, -84, 2.7, 3.5, 0, 0, TAU); c.ellipse(21, -84, 2.7, 3.5, 0, 0, TAU); c.fill();
    c.strokeStyle = '#bb9562'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(35, -13); c.lineTo(40, -97); c.stroke();
    rounded(c, 20, -58, 17, 12, 6, '#e4d3a0');
    c.shadowColor = '#d6fb9c'; c.shadowBlur = 10 + this.charge * 22; c.fillStyle = '#dcf89e'; c.beginPath(); c.moveTo(40, -115); c.lineTo(48, -101); c.lineTo(40, -88); c.lineTo(32, -101); c.closePath(); c.fill(); c.restore();
  }
  boss(x, y, scale, t, hitAge) {
    const c = this.ctx; c.save(); c.translate(x, y); c.scale(scale, scale);
    c.fillStyle = '#10281966'; c.beginPath(); c.ellipse(0, 3, 53, 12, 0, 0, TAU); c.fill();
    c.translate(0, Math.sin(t * 1.8) * 3);
    rounded(c, -36, -25, 24, 28, 8, '#777966'); rounded(c, 13, -25, 24, 28, 8, '#777966');
    rounded(c, -56, -72, 25, 45, 12, '#838978'); rounded(c, 32, -72, 25, 45, 12, '#707d67');
    rounded(c, -40, -98, 82, 82, [27, 30, 18, 18], hitAge >= 0 && hitAge < 150 ? '#ced99b' : '#97a084');
    c.fillStyle = '#687c52'; c.beginPath(); c.moveTo(-44, -74); c.quadraticCurveTo(-40, -111, -13, -108); c.quadraticCurveTo(5, -131, 23, -110); c.quadraticCurveTo(46, -109, 43, -74); c.lineTo(28, -83); c.lineTo(14, -72); c.lineTo(-2, -88); c.lineTo(-17, -75); c.closePath(); c.fill();
    c.strokeStyle = '#9db36c'; c.lineWidth = 3; c.beginPath(); c.moveTo(-9, -105); c.lineTo(-19, -124); c.moveTo(-16, -117); c.lineTo(-28, -120); c.moveTo(16, -110); c.lineTo(20, -131); c.stroke();
    c.fillStyle = '#c8d38b'; c.beginPath(); c.ellipse(-28, -122, 10, 4, .3, 0, TAU); c.ellipse(27, -128, 11, 4, -.5, 0, TAU); c.fill();
    c.fillStyle = '#263e2c'; c.beginPath(); c.ellipse(-16, -66, 5, 7, .15, 0, TAU); c.ellipse(14, -66, 5, 7, -.15, 0, TAU); c.fill();
    c.fillStyle = '#e3daa0'; c.beginPath(); c.arc(-16, -67, 2, 0, TAU); c.arc(14, -67, 2, 0, TAU); c.fill();
    c.strokeStyle = '#596e4d'; c.lineWidth = 3; c.beginPath(); c.moveTo(-9, -40); c.quadraticCurveTo(0, -43, 8, -40); c.stroke();
    c.strokeStyle = '#76896b'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(26, -52); c.lineTo(19, -41); c.lineTo(25, -34); c.moveTo(-29, -40); c.lineTo(-22, -31); c.stroke(); c.restore();
  }
}
