// Synthesized game sound only. No microphone permission or external audio files.
export class QuestSound {
  constructor() {
    this.enabled = true; this.context = null; this.nodes = new Set(); this.charging = null;
    this.button = document.createElement('button');
    this.button.className = 'secondary'; this.button.id = 'quest-sound';
    this.button.textContent = 'Sound on'; this.button.setAttribute('aria-pressed', 'true');
    this.button.setAttribute('aria-label', 'Game sound');
    this.button.onclick = () => {
      this.enabled = !this.enabled; this.button.textContent = this.enabled ? 'Sound on' : 'Sound off';
      this.button.setAttribute('aria-pressed', String(this.enabled));
      if (this.enabled) this.enable();
      if (this.master) this.master.gain.setTargetAtTime(this.enabled ? .28 : 0, this.context.currentTime, .02);
    };
    document.querySelector('.secondary-actions')?.append(this.button);
  }
  enable() {
    try {
      if (!this.context) {
        this.context = new AudioContext(); const ctx = this.context;
        this.master = ctx.createGain(); this.master.gain.value = this.enabled ? .28 : 0;
        const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.ratio.value = 8;
        this.master.connect(limiter); limiter.connect(ctx.destination);
        this.destination = ctx.createMediaStreamDestination(); limiter.connect(this.destination);
      }
      this.context.resume().catch(() => {});
    } catch { this.button.disabled = true; this.button.textContent = 'Sound unavailable'; }
  }
  get stream() { return this.destination?.stream ?? null; }
  tone(frequency, endFrequency, duration, delay = 0, volume = .22, type = 'sine') {
    const ctx = this.context; if (!ctx || ctx.state !== 'running') return;
    const at = ctx.currentTime + delay, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, at); osc.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    osc.connect(gain); gain.connect(this.master); this.nodes.add(osc);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); this.nodes.delete(osc); };
    osc.start(at); osc.stop(at + duration + .02);
  }
  charge(power) {
    const ctx = this.context; if (!ctx || ctx.state !== 'running') return;
    if (power <= .02) { this.stopCharge(); return; }
    if (!this.charging) {
      const osc = ctx.createOscillator(), harmony = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'triangle'; harmony.type = 'sine'; gain.gain.value = 0;
      osc.connect(gain); harmony.connect(gain); gain.connect(this.master); osc.start(); harmony.start();
      this.charging = { osc, harmony, gain };
    }
    const { osc, harmony, gain } = this.charging, at = ctx.currentTime;
    osc.frequency.setTargetAtTime(100 + power * 250, at, .045);
    harmony.frequency.setTargetAtTime((100 + power * 250) * 1.5, at, .045);
    gain.gain.setTargetAtTime(.025 + power * .06, at, .04);
    if (power >= .95 && !this.wasCharged) { this.tone(880, 1320, .3, 0, .12); this.wasCharged = true; }
  }
  stopCharge() {
    if (this.charging) {
      const { osc, harmony, gain } = this.charging;
      gain.gain.setTargetAtTime(0, this.context.currentTime, .012);
      osc.stop(this.context.currentTime + .06); harmony.stop(this.context.currentTime + .06);
      osc.onended = () => { osc.disconnect(); harmony.disconnect(); gain.disconnect(); };
      this.charging = null;
    }
    this.wasCharged = false;
  }
  release(final) {
    this.stopCharge();
    this.tone(720, 130, .42, 0, .28, 'triangle');
    this.tone(1200, 380, .32, 0, .12);
    // Impact lands with the projectile at 460 ms, followed by a bright leaf chime.
    this.tone(150, 42, .32, .46, .6, 'triangle');
    this.tone(660, 440, .3, .46, .16);
    if (final) [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => this.tone(note, note, .55, .65 + i * .13, .18));
  }
  quiet() {
    this.stopCharge();
    for (const node of this.nodes) { try { node.stop(); } catch { /* Already ended. */ } }
    this.nodes.clear();
  }
  suspend() { this.quiet(); return this.context?.suspend().catch(() => {}); }
  close() { this.quiet(); this.destination?.stream.getTracks().forEach(track => track.stop()); return this.context?.close().catch(() => {}); }
}
