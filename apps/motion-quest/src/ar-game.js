import { ForestGame } from '@fitness-pair/game-forest/renderer';
import { cameraPoint } from './camera-projection.js';
import { QuestSound } from './quest-sound.js';

const TAU = Math.PI * 2;
const easeOut = p => 1 - Math.pow(1 - p, 3);
export const SPELL_FLIGHT_MS = 460;
export const SPELL_SETTLE_MS = 1800;

// Every spell layer lives on this transparent canvas, including in saved replays.
export class ARGame extends ForestGame {
  constructor(canvas) { super(canvas); this.sound = new QuestSound(); }
  setPose(points, videoWidth, videoHeight) {
    const joints = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'].map(name => points[name]);
    this.body = joints.every(p => p && p.confidence >= .6)
      ? { point: { x: joints.reduce((sum, p) => sum + p.x, 0) / 4, y: joints.reduce((sum, p) => sum + p.y, 0) / 4 }, videoWidth, videoHeight, at: performance.now() }
      : null;
  }
  reset() { super.reset(); this.body = null; this.attackOrigin = null; this.sound?.quiet(); this.canvas.dataset.effectPhase = 'idle'; }
  origin(time) {
    if (this.body && time - this.body.at < 500) {
      const { point, videoWidth, videoHeight } = this.body;
      return cameraPoint(point, this.width, this.height, videoWidth, videoHeight, true);
    }
    return { x: this.width * .48, y: this.height * .54 };
  }
  attack(hp) {
    this.attackOrigin = this.origin(performance.now()); super.attack(hp);
    this.damageAt = this.attackAt + SPELL_FLIGHT_MS;
    this.sound.release(hp === 0);
  }
  effectsFinished(time = performance.now()) { return time >= this.attackAt + SPELL_SETTLE_MS; }
  getAudioStream() { return this.sound.stream; }
  draw(time) {
    const c = this.ctx, w = this.width, h = this.height;
    if (!w || !h) return;
    c.clearRect(0, 0, w, h);
    const scale = Math.min(w / 500, h / 620) * 1.15;
    const bossX = w * .79, ground = h * .56, targetY = ground - 65 * scale;
    const age = time - this.attackAt, hitAge = time - this.damageAt;
    const origin = this.origin(time), t = this.reducedMotion ? 0 : time / 1000;
    const striking = age >= 0 && age < SPELL_SETTLE_MS;
    const phase = striking ? age < SPELL_FLIGHT_MS ? 'projectile' : 'impact' : this.charge > .02 ? 'charge' : 'idle';
    if (this.canvas.dataset.effectPhase !== phase) this.canvas.dataset.effectPhase = phase;
    this.sound.charge(this.charge);
    c.save();
    c.strokeStyle = '#d2f399aa'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(bossX, ground + 5, 65 * scale, 16 * scale, 0, 0, TAU); c.stroke();
    const impact = hitAge >= 0 && hitAge < 1000 ? Math.exp(-hitAge / 260) : 0;
    const defeat = this.hp === 0 && hitAge > 0 ? Math.min(1, hitAge / 1300) : 0;
    c.save(); c.translate(bossX, ground);
    if (!this.reducedMotion) {
      c.translate(impact * 26 * scale, -Math.sin(Math.min(1, Math.max(0, hitAge) / 650) * Math.PI) * impact * 13 * scale);
      c.rotate(impact * .18 + defeat * .2);
      c.scale(1 + impact * .13, 1 - impact * .15 - defeat * .3);
    }
    c.globalAlpha = 1 - defeat * .72;
    this.boss(0, 0, scale, t, hitAge);
    // Cracks accumulate with the actual remaining health; no extra scoring.
    c.strokeStyle = '#e7ffd0'; c.lineWidth = Math.max(1.5, scale * 1.6);
    for (let i = 0; i < Math.round((100 - this.hp) / 20); i++) {
      const x = (i % 2 ? 17 : -24) * scale, y = (-82 + i * 10) * scale;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6 * scale, y + 9 * scale); c.lineTo(x - 2 * scale, y + 17 * scale); c.stroke();
    }
    c.restore();
    if (this.charge > .02) this.drawCharge(origin, this.charge, t, scale);
    if (age >= 0 && age < SPELL_FLIGHT_MS && this.attackOrigin) {
      const p = this.reducedMotion ? 1 : Math.min(1, age / SPELL_FLIGHT_MS);
      const point = q => ({ x: this.attackOrigin.x + (bossX - this.attackOrigin.x) * q,
        y: this.attackOrigin.y + (targetY - this.attackOrigin.y) * q - Math.sin(q * Math.PI) * 45 * scale });
      if (!this.reducedMotion) for (let i = 12; i >= 0; i--) {
        const q = Math.max(0, p - i * .025), at = point(q);
        c.globalAlpha = (1 - i / 13) * .75; c.fillStyle = i % 2 ? '#c1f979' : '#faffbd';
        c.beginPath(); c.arc(at.x, at.y, (5 + (1 - i / 13) * 14) * scale, 0, TAU); c.fill();
      }
      c.globalAlpha = 1; const at = point(p);
      c.fillStyle = '#fffde5'; c.beginPath(); c.arc(at.x, at.y, 16 * scale, 0, TAU); c.fill();
      c.strokeStyle = '#d2f399'; c.lineWidth = 4 * scale; c.beginPath(); c.arc(at.x, at.y, 23 * scale, 0, TAU); c.stroke();
    }
    if (hitAge >= 0 && hitAge < 1340) this.drawImpact(bossX, targetY, scale, hitAge, this.hp === 0);
    c.restore();
  }
  drawCharge(origin, power, time, scale) {
    const c = this.ctx, r = (28 + power * 43) * scale;
    c.save(); c.translate(origin.x, origin.y);
    // Two ribbons gather inward as the squat deepens; the room stays visible.
    c.lineWidth = Math.max(2, 3 * scale); c.strokeStyle = '#d9ff9b';
    for (let ring = 0; ring < 2; ring++) {
      c.save(); c.rotate((ring ? -1 : 1) * time * 1.6);
      c.beginPath(); c.ellipse(0, 0, r * (ring ? 1.18 : 1), r * .38, ring ? -.7 : .7, 0, TAU * Math.max(.15, power)); c.stroke(); c.restore();
    }
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * TAU + time * .7;
      const flow = this.reducedMotion ? .4 : (time * .8 + i * .137) % 1;
      const distance = r + (1 - flow) * (25 + 50 * power) * scale;
      c.globalAlpha = power * (.25 + flow * .75); c.fillStyle = i % 3 ? '#d9ff9b' : '#fff8b3';
      const x = Math.cos(a) * distance, y = Math.sin(a) * distance;
      c.beginPath(); c.ellipse(x, y, (2 + power * 3) * scale, 2 * scale, a, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    c.fillStyle = '#d2f39933'; c.beginPath(); c.arc(0, 0, r * .58, 0, TAU); c.fill();
    c.fillStyle = power >= .95 ? '#fffde5' : '#dcffb0';
    c.beginPath(); c.moveTo(0, -r * .44); c.lineTo(r * .3, 0); c.lineTo(0, r * .44); c.lineTo(-r * .3, 0); c.closePath(); c.fill();
    c.strokeStyle = '#fffde5'; c.lineWidth = 3 * scale;
    c.beginPath(); c.arc(0, 0, r * .75, -Math.PI / 2, -Math.PI / 2 + TAU * power); c.stroke();
    c.restore();
  }
  drawImpact(x, y, scale, age, final) {
    const c = this.ctx, p = Math.min(1, age / 1340), radius = (24 + easeOut(p) * (final ? 145 : 94)) * scale;
    c.save(); c.translate(x, y); c.globalAlpha = 1 - p;
    c.strokeStyle = '#f5ffce'; c.lineWidth = (1 - p) * 6 * scale;
    c.beginPath(); c.arc(0, 0, this.reducedMotion ? 70 * scale : radius, 0, TAU); c.stroke();
    if (!this.reducedMotion) for (let i = 0; i < (final ? 30 : 18); i++) {
      const a = i * 2.39996, d = radius * (.6 + (i % 4) * .16);
      c.fillStyle = i % 3 ? '#d2f399' : '#ffe499';
      c.beginPath(); c.ellipse(Math.cos(a) * d, Math.sin(a) * d + p * p * 65 * scale, (7 - p * 4) * scale, 3 * scale, a + p, 0, TAU); c.fill();
    }
    c.fillStyle = '#fffde5'; c.font = `800 ${Math.max(28, 32 * scale)}px system-ui`; c.textAlign = 'center';
    c.fillText(final ? 'QUEST COMPLETE!' : '−20', 0, -85 * scale - (this.reducedMotion ? 0 : easeOut(p) * 32 * scale));
    c.restore();
  }
}
