import {translateText} from '../../../packages/gameplay/i18n.js';
import { ForestGame } from '@fitness-pair/game-forest/renderer';
import { cameraPoint } from './camera-projection.js';
import { QuestSound } from './quest-sound.js';
import {GuardianWave} from './guardian-wave.js';
import {drawCharacter} from './character-art.js';

const TAU = Math.PI * 2;
const easeOut = p => 1 - Math.pow(1 - p, 3);
export const SPELL_FLIGHT_MS = 460;
export const SPELL_SETTLE_MS = 1800;

// Every spell layer lives on this transparent canvas, including in saved replays.
export class ARGame extends ForestGame {
  constructor(canvas) { super(canvas); this.sound = new QuestSound(); this.wave = new GuardianWave(); }
  setPose(points, videoWidth, videoHeight) {
    const joints = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'].map(name => points[name]);
    this.body = joints.every(p => p && p.confidence >= .6)
      ? { point: { x: joints.reduce((sum, p) => sum + p.x, 0) / 4, y: joints.reduce((sum, p) => sum + p.y, 0) / 4 }, videoWidth, videoHeight, at: performance.now() }
      : null;
  }
  reset() { super.reset(); this.wave?.reset(); this.body = null; this.attackOrigin = null; this.struck = null; this.sound?.quiet(); this.canvas.dataset.effectPhase = 'idle'; }
  layout() {
    const scale = Math.min(this.width / 500, this.height / 620) * 1.15;
    return {scale, heroX: this.width * (this.height < 550 ? .56 : .22),
      ground: this.height * (this.height < 550 ? .87 : .70), frontline: this.height < 550 ? .78 : .50};
  }
  origin(time) {
    if (this.body && time - this.body.at < 500) {
      const { point, videoWidth, videoHeight } = this.body;
      return cameraPoint(point, this.width, this.height, videoWidth, videoHeight, true);
    }
    return { x: this.width * .48, y: this.height * .54 };
  }
  attack(hp) {
    const {scale, heroX, ground, frontline} = this.layout();
    this.struck = {x: this.width * this.wave.position(Math.round((100 - this.hp) / 20), frontline), ground};
    this.attackOrigin = {x: heroX + 52 * scale, y: ground - 80 * scale}; super.attack(hp);
    this.damageAt = this.attackAt + SPELL_FLIGHT_MS;
    this.sound.release(hp === 0);
  }
  effectsFinished(time = performance.now()) { return time >= this.attackAt + SPELL_SETTLE_MS; }
  getAudioStream() { return this.sound.stream; }
  draw(time,{playing=false}={}) {
    const c = this.ctx, w = this.width, h = this.height;
    if (!w || !h) return;
    c.clearRect(0, 0, w, h);
    const {scale, heroX, ground, frontline} = this.layout();
    const defeated = Math.round((100 - this.hp) / 20);
    this.wave.update(time, playing, defeated);
    const bossX = this.struck?.x ?? w * this.wave.position(defeated, frontline), targetY = ground - 65 * scale;
    const age = time - this.attackAt, hitAge = time - this.damageAt;
    const origin = this.origin(time), t = this.reducedMotion ? 0 : time / 1000;
    const striking = age >= 0 && age < SPELL_SETTLE_MS;
    const phase = striking ? age < SPELL_FLIGHT_MS ? 'projectile' : 'impact' : this.charge > .02 ? 'charge' : 'idle';
    if (this.canvas.dataset.effectPhase !== phase) this.canvas.dataset.effectPhase = phase;
    this.sound.charge(this.charge);
    c.save();
    // Only transparent characters and local spells: no floor, rim or scenery.
    this.drawMage(heroX, ground, scale, t, age);
    for (let i = 4; i >= defeated; i--) {
      const x = w * this.wave.position(i, frontline);
      if (x > w + 90 * scale) continue;
      const walking = playing && !this.reducedMotion;
      const step = Math.floor(this.wave.elapsed / 320 + i) % 2;
      const bob = walking ? Math.sin(this.wave.elapsed / 102 + i * 2) * 2.5 * scale : 0;
      c.save(); c.translate(x, ground + bob); c.rotate(walking ? Math.sin(this.wave.elapsed / 204 + i) * .025 : 0);
      if (!drawCharacter(c, walking && step ? 'stepB' : 'stepA', 0, 0, 145 * scale)) this.boss(0, 0, scale, t, -1);
      c.restore();
    }
    this.canvas.dataset.frontX = String(w * this.wave.position(defeated, frontline));
    this.canvas.dataset.guardiansRemaining = String(5 - defeated);
    const impact = hitAge >= 0 && hitAge < 1000 ? Math.exp(-hitAge / 260) : 0;
    const defeat = hitAge > 0 ? Math.min(1, hitAge / 1000) : 0;
    if (striking && this.struck) {
      c.save(); c.translate(bossX, ground);
      if (!this.reducedMotion) {
        c.translate(impact * 26 * scale, -Math.sin(Math.min(1, Math.max(0, hitAge) / 650) * Math.PI) * impact * 13 * scale);
        c.rotate(impact * .18 + defeat * .2);
        c.scale(1 + impact * .13, 1 - impact * .15 - defeat * .3);
      }
      c.globalAlpha = 1 - defeat;
      if (!drawCharacter(c, hitAge >= 0 ? 'hit' : 'stepA', 0, 0, 145 * scale)) this.boss(0, 0, scale, t, hitAge);
      c.restore();
    }
    if (this.charge > .02) this.drawCharge(origin, this.charge, t, scale);
    if (age >= 0 && age < SPELL_FLIGHT_MS && this.attackOrigin) {
      const p = this.reducedMotion ? 1 : Math.min(1, age / SPELL_FLIGHT_MS);
      const point = q => ({ x: this.attackOrigin.x + (bossX - this.attackOrigin.x) * q,
        y: this.attackOrigin.y + (targetY - this.attackOrigin.y) * q - Math.sin(q * Math.PI) * 45 * scale });
      this.drawProjectile(point, p, scale, time);
    }
    if (hitAge >= 0 && hitAge < 1340) this.drawImpact(bossX, targetY, scale, hitAge, this.hp === 0);
    c.restore();
  }
  drawMage(x, ground, scale, time, age) {
    const c = this.ctx, casting = age >= 0 && age < 750;
    const pose = casting ? 'cast' : this.charge > .12 ? 'charge' : 'idle';
    this.canvas.dataset.heroPose = pose;
    c.save(); c.translate(x, ground);
    if (!this.reducedMotion) {
      const recoil = casting ? Math.sin(Math.min(1, age / 750) * Math.PI) : 0;
      c.translate(recoil * 10 * scale, -Math.sin(time * 2) * 1.5 * scale);
      c.rotate(casting ? -recoil * .035 : Math.sin(time * 1.8) * .012);
    }
    if (!drawCharacter(c, pose, 0, 0, 137 * scale)) this.hero(0, 0, scale * .9, time);
    c.restore();
  }
  glow(x, y, radius, alpha = 1) {
    const c = this.ctx, glow = c.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(241,255,219,${alpha})`);
    glow.addColorStop(.25, `rgba(120,244,215,${alpha * .65})`);
    glow.addColorStop(1, 'rgba(55,195,186,0)');
    c.fillStyle = glow; c.beginPath(); c.arc(x, y, radius, 0, TAU); c.fill();
  }
  drawProjectile(point, progress, scale, time) {
    const c = this.ctx, at = point(progress);
    c.save(); c.lineCap = 'round';
    if (!this.reducedMotion) {
      // Curved comet ribbons and a bounded lightning filament follow the bolt.
      for (let ribbon = 0; ribbon < 3; ribbon++) {
        c.strokeStyle = ['#5adfd5aa', '#d2f399cc', '#fffbdfff'][ribbon]; c.lineWidth = (10 - ribbon * 3) * scale;
        c.beginPath();
        for (let i = 0; i <= 20; i++) {
          const q = Math.max(0, progress - .42 + i / 20 * .42), pos = point(q);
          const curl = Math.sin(q * 24 - time / 70 + ribbon * 2) * 9 * scale * (1 - i / 20);
          if (!i) c.moveTo(pos.x, pos.y + curl); else c.lineTo(pos.x, pos.y + curl);
        } c.stroke();
      }
      c.strokeStyle = '#b2ffec'; c.lineWidth = 1.5 * scale; c.beginPath();
      for (let i = 0; i <= 12; i++) {
        const q = Math.max(0, progress - .32 + i / 12 * .32), pos = point(q), jitter = i % 2 ? 10 * scale : -7 * scale;
        if (!i) c.moveTo(pos.x, pos.y); else c.lineTo(pos.x, pos.y + jitter * (1 - i / 12));
      } c.stroke();
    }
    this.glow(at.x, at.y, 48 * scale, .75);
    c.save(); c.translate(at.x, at.y); c.rotate(this.reducedMotion ? 0 : time / 130);
    c.fillStyle = '#fffce3'; c.beginPath(); c.moveTo(0, -18 * scale); c.lineTo(11 * scale, 0); c.lineTo(0, 18 * scale); c.lineTo(-11 * scale, 0); c.closePath(); c.fill();
    c.strokeStyle = '#88ffdf'; c.lineWidth = 2.5 * scale; c.beginPath(); c.ellipse(0, 0, 27 * scale, 14 * scale, .4, 0, TAU); c.stroke(); c.restore();
    c.restore();
  }
  drawCharge(origin, power, time, scale) {
    const c = this.ctx, r = (28 + power * 43) * scale;
    c.save(); c.translate(origin.x, origin.y);
    this.glow(0, 0, r * 1.35, power * .28);
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
    c.strokeStyle = '#80ebd8'; c.lineWidth = 2 * scale;
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * TAU + (this.reducedMotion ? 0 : time * .35);
      c.save(); c.rotate(angle); c.translate(r * 1.04, 0);
      c.beginPath(); c.moveTo(-5 * scale, 0); c.lineTo(0, -7 * scale); c.lineTo(5 * scale, 0); c.lineTo(0, 7 * scale); c.closePath(); c.stroke(); c.restore();
    }
    c.restore();
  }
  drawImpact(x, y, scale, age, final) {
    const c = this.ctx, p = Math.min(1, age / 1340), radius = (24 + easeOut(p) * (final ? 145 : 94)) * scale;
    c.save(); c.translate(x, y); c.globalAlpha = 1 - p;
    this.glow(0, 0, (final ? 100 : 70) * scale, .7 * (1 - p));
    c.strokeStyle = '#f5ffce'; c.lineWidth = (1 - p) * 6 * scale;
    c.beginPath(); c.arc(0, 0, this.reducedMotion ? 70 * scale : radius, 0, TAU); c.stroke();
    c.strokeStyle = '#7ff9de'; c.lineWidth = (1 - p) * 3 * scale;
    c.beginPath(); c.ellipse(0, 0, this.reducedMotion ? 50 * scale : radius * .8, this.reducedMotion ? 30 * scale : radius * .42, -.4, 0, TAU); c.stroke();
    if (!this.reducedMotion) for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU, length = radius * (i % 2 ? .95 : 1.25);
      c.save(); c.rotate(a); c.strokeStyle = i % 2 ? '#fff7cf' : '#83ffe5'; c.lineWidth = 2 * scale;
      c.beginPath(); c.moveTo(20 * scale, 0); c.lineTo(length * .48, 5 * scale); c.lineTo(length * .63, -5 * scale); c.lineTo(length, 0); c.stroke(); c.restore();
    }
    if (!this.reducedMotion) for (let i = 0; i < (final ? 30 : 18); i++) {
      const a = i * 2.39996, d = radius * (.6 + (i % 4) * .16);
      c.fillStyle = i % 3 ? '#d2f399' : '#ffe499';
      c.beginPath(); c.ellipse(Math.cos(a) * d, Math.sin(a) * d + p * p * 65 * scale, (7 - p * 4) * scale, 3 * scale, a + p, 0, TAU); c.fill();
    }
    c.fillStyle = '#fffde5'; c.font = `800 ${Math.max(28, 32 * scale)}px system-ui`; c.textAlign = 'center';
    const label = translateText(final ? 'WAVE CLEARED!' : 'REPELLED!'), half = c.measureText(label).width / 2;
    const labelX = Math.max(half + 12 - x, Math.min(0, this.width - x - half - 12));
    c.fillText(label, labelX, -85 * scale - (this.reducedMotion ? 0 : easeOut(p) * 32 * scale));
    c.restore();
  }
}
