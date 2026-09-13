import {scheduleGameMusic} from '../../../packages/gameplay/soundtrack.js';
import { FlightAudio } from '../../../experiments/gameplay/plank-flight/src/audio.js';

/** Reuse local speech, synthesis and cleanup; use the shared Push-up Flight soundtrack. */
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
    scheduleGameMusic(this);
  }

  snapshot() { return {...super.snapshot(), activeNodes:this.nodes.size, phase:this.phase, beat:this.beat}; }
}
