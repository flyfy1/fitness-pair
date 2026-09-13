import { ForestGame } from '@fitness-pair/game-forest/renderer';
import { cameraPoint } from './camera-projection.js';

// Reuse the guardian artwork and game feedback; the camera provides the scenery.
export class ARGame extends ForestGame {
  setPose(points, videoWidth, videoHeight) {
    const joints = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'].map(name => points[name]);
    this.body = joints.every(p => p && p.confidence >= .6)
      ? { point: { x: joints.reduce((sum, p) => sum + p.x, 0) / 4, y: joints.reduce((sum, p) => sum + p.y, 0) / 4 }, videoWidth, videoHeight, at: performance.now() }
      : null;
  }
  reset() { super.reset(); this.body = null; this.attackOrigin = null; }
  origin(time) {
    if (this.body && time - this.body.at < 500) {
      const { point, videoWidth, videoHeight } = this.body;
      return cameraPoint(point, this.width, this.height, videoWidth, videoHeight, true);
    }
    return { x: this.width * .48, y: this.height * .54 };
  }
  attack(hp) { this.attackOrigin = this.origin(performance.now()); super.attack(hp); }
  draw(time) {
    const c = this.ctx, w = this.width, h = this.height;
    if (!w || !h) return;
    c.clearRect(0, 0, w, h);
    const scale = Math.min(w / 500, h / 620) * 1.15;
    const bossX = w * .79, ground = h * .56;
    const age = time - this.attackAt, hitAge = time - this.damageAt;
    const origin = this.origin(time), t = this.reducedMotion ? 0 : time / 1000;
    c.save();
    // A transparent summoning ring leaves the real room visible around the guardian.
    c.strokeStyle = '#d2f399aa'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(bossX, ground + 5, 65 * scale, 16 * scale, 0, 0, Math.PI * 2); c.stroke();
    this.boss(bossX + (!this.reducedMotion && hitAge > 0 && hitAge < 250 ? Math.sin(hitAge / 20) * 5 : 0), ground, scale, t, hitAge);
    if (this.charge > .02) {
      c.shadowColor = '#d2f399'; c.shadowBlur = 20;
      c.strokeStyle = '#e8ffc0'; c.lineWidth = 3;
      c.beginPath(); c.arc(origin.x, origin.y, 24 + this.charge * 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.charge); c.stroke();
      c.fillStyle = '#d2f39944'; c.beginPath(); c.arc(origin.x, origin.y, 8 + this.charge * 12, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;
    }
    if (age >= 0 && age < 500 && this.attackOrigin) {
      const p = this.reducedMotion ? 1 : Math.min(1, age / 350);
      const x = this.attackOrigin.x + (bossX - this.attackOrigin.x) * p;
      const y = this.attackOrigin.y + (ground - 65 * scale - this.attackOrigin.y) * p - Math.sin(p * Math.PI) * 40;
      c.shadowColor = '#d2f399'; c.shadowBlur = 24; c.fillStyle = '#eeffc9';
      c.beginPath(); c.arc(x, y, 10 + scale * 3, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    }
    if (hitAge >= 0 && hitAge < 850) {
      c.globalAlpha = 1 - hitAge / 850; c.fillStyle = '#eeffc9'; c.font = `bold ${Math.max(22, 26 * scale)}px system-ui`; c.textAlign = 'center';
      c.fillText('−20', bossX, ground - 145 * scale - (this.reducedMotion ? 0 : hitAge / 30));
    }
    c.restore();
  }
}
