import { FlightAudio } from '../../../experiments/gameplay/plank-flight/src/audio.js';

/** Reuse local speech, synthesis and cleanup; give Dino its own arcade soundtrack. */
export class DinoAudio extends FlightAudio {
  constructor(onCue = () => {}) {
    super(); this.onCue = onCue; this.activated = false; this.countdownId = null; this.tail = null;
  }
  activate() { this.activated = true; this.unlock(); }
  setMuted(value) {
    this.muted = value;
    this.stop();
    if (!value && this.activated && ['running', 'countdown'].includes(this.phase)) this.unlock();
  }
  clearNodes() { clearTimeout(this.tail); this.tail = null; super.clearNodes(); }
  stop() {
    this.clearNodes();
    // Queue suspension even if a previous user gesture is still resuming audio.
    if (this.context && this.context.state !== 'closed') void this.context.suspend().catch(() => {});
  }
  play(name, delay = 0) {
    if (!this.activated || this.muted || !this.context || document.hidden) return;
    const generation = this.generation;
    const emit = () => {
      if (generation !== this.generation || this.muted || document.hidden) return;
      this.cue(name, delay); this.onCue(name);
    };
    // Queue after any phase-transition suspension; cancellation invalidates emit.
    void this.context.resume().then(emit).catch(() => { this.unavailable = true; });
  }
  effect(name, delay = 0) { if (this.phase === 'running') this.play(name, delay); }
  cue(name, delay = 0) {
    if (!['jump', 'land', 'resume', 'clear'].includes(name)) return super.cue(name);
    this.lastCue = name;
    if (this.muted || this.context?.state !== 'running') return;
    const t = this.context.currentTime + delay;
    if (name === 'jump') {
      this.tone(180, t, .18, .12, 'square', 850, this.master);
      this.tone(360, t + .045, .14, .06, 'triangle', 1200, this.master);
    }
    if (name === 'land') this.tone(115, t, .09, .14, 'sine', 38, this.master);
    if (name === 'resume') [392, 523].forEach((f,i) => this.tone(f,t+i*.07,.15,.12,'triangle',f,this.master));
    if (name === 'clear') [523,659,784,1047].forEach((f,i) => this.tone(f,t+i*.06,.17,.13,'triangle',f,this.master));
  }
  update({ phase, count, countdownId, passed = 0, speed = 180, crashed = false }) {
    if (phase !== this.phase) {
      const previous = this.phase;
      this.stop(); this.phase = phase;
      if (phase === 'running') {
        this.play(previous === 'countdown' ? 'start' : 'resume');
        this.passed = passed; this.beat = 0;
      }
      if (phase === 'finished') {
        this.play(crashed ? 'crash' : 'finish');
        const duration = crashed ? 1500 : Math.max(1600, (this.buffers.get('finish')?.duration ?? 2.5) * 1000 + 200);
        this.tail = setTimeout(() => this.stop(), duration);
      }
      if (phase === 'countdown' && this.activated) this.unlock();
    }
    if (countdownId !== this.countdownId) { this.countdownId = countdownId; this.count = null; }
    if (phase === 'countdown' && count !== this.count) {
      this.count = count; this.clearNodes();
      this.play(({3:'three',2:'two',1:'one'})[count]);
    }
    if (phase === 'running' && passed > this.passed) {
      this.passed = passed; this.play(passed % 3 === 0 ? 'keep-going' : 'clear');
    }
    if (phase !== 'running' || this.muted || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    if (this.nextBeat < now) this.nextBeat = now;
    const interval = 60 / Math.min(156, 128 + Math.max(0, speed - 180) * .4) / 4;
    while (this.nextBeat < now + .08) {
      const t = this.nextBeat, n = this.beat++ % 16;
      if (n % 4 === 0) {
        this.tone(140, t, .16, .55, 'sine', 42);
        this.tone([130.81,130.81,164.81,196][n/4], t, .14, .14, 'triangle');
      }
      if (n % 2 === 0) this.hiss(t, .035, .06);
      if (n === 4 || n === 12) this.hiss(t, .075, .13);
      if (n % 2 === 1) this.tone([523.25,659.25,783.99,659.25,587.33,783.99,1046.5,783.99][Math.floor(n/2)], t, .095, .055, 'square');
      this.nextBeat += interval;
    }
  }
  snapshot() { return {...super.snapshot(), activeNodes:this.nodes.size, phase:this.phase, beat:this.beat}; }
}
