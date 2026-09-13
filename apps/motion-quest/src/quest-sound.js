// Original arcade synthesis plus the same bundled encouragement as Push-up Flight.
// Game-only output is shared with the recorder; the microphone is never requested.
const VOICES = ['start', 'nice', 'keep-going', 'finish'];
export class QuestSound {
  constructor() {
    this.enabled = true; this.context = null; this.nodes = new Set(); this.musicNodes = new Set(); this.charging = null;
    this.buffers = new Map(); this.playing = false; this.beat = 0; this.nextBeat = 0; this.generation = 0; this.hits = 0;
    this.button = document.createElement('button');
    this.button.className = 'secondary'; this.button.id = 'quest-sound';
    this.button.textContent = 'Sound on'; this.button.setAttribute('aria-pressed', 'true');
    this.button.setAttribute('aria-label', 'Game sound');
    this.button.onclick = () => {
      this.enabled = !this.enabled; this.button.textContent = this.enabled ? 'Sound on' : 'Sound off';
      this.button.setAttribute('aria-pressed', String(this.enabled));
      if (this.enabled) this.enable(); else this.quiet();
      if (this.master) this.master.gain.setTargetAtTime(this.enabled ? .65 : 0, this.context.currentTime, .02);
    };
    document.querySelector('.secondary-actions')?.append(this.button);
  }
  enable() {
    try {
      if (!this.context) {
        this.context = new AudioContext(); const ctx = this.context;
        this.master = ctx.createGain(); this.master.gain.value = this.enabled ? .65 : 0;
        this.music = ctx.createGain(); this.music.gain.value = .22; this.music.connect(this.master);
        this.noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .6), ctx.sampleRate);
        const noise = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
        this.voicesReady = Promise.all(VOICES.map(async name => {
          try {
            const response = await fetch(new URL(`audio/${name}.wav`, new URL(import.meta.env.BASE_URL, location.href)));
            if (response.ok) this.buffers.set(name, await ctx.decodeAudioData(await response.arrayBuffer()));
          } catch { /* Music and effects remain available if a voice cannot load. */ }
        }));
        const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.ratio.value = 8;
        this.master.connect(limiter); limiter.connect(ctx.destination);
        this.destination = ctx.createMediaStreamDestination(); limiter.connect(this.destination);
      }
      this.resuming = this.context.resume().catch(() => {});
    } catch { this.button.disabled = true; this.button.textContent = 'Sound unavailable'; }
  }
  get stream() { return this.destination?.stream ?? null; }
  tone(frequency, endFrequency, duration, delay = 0, volume = .22, type = 'sine', bus = this.master) {
    const ctx = this.context; if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const at = ctx.currentTime + delay, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, at); osc.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    osc.connect(gain); gain.connect(bus); this.nodes.add(osc); if (bus === this.music) this.musicNodes.add(osc);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); this.nodes.delete(osc); this.musicNodes.delete(osc); };
    osc.start(at); osc.stop(at + duration + .02);
  }
  noise(duration, delay, volume, from = 2500, to = 500, bus = this.master) {
    const ctx = this.context; if (!this.enabled || ctx?.state !== 'running') return;
    const at = ctx.currentTime + delay, source = ctx.createBufferSource(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    source.buffer = this.noiseBuffer; filter.type = 'bandpass'; filter.Q.value = .8;
    filter.frequency.setValueAtTime(from, at); filter.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(volume, at + .006); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter); filter.connect(gain); gain.connect(bus); this.nodes.add(source); if (bus === this.music) this.musicNodes.add(source);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.nodes.delete(source); this.musicNodes.delete(source); };
    source.start(at); source.stop(at + duration);
  }
  voice(name, delay = 0) {
    if (!this.enabled) return;
    const generation = this.generation;
    const expiresAt = performance.now() + 1500;
    const play = () => {
      if (generation !== this.generation || performance.now() > expiresAt || !this.enabled || this.context?.state !== 'running') return;
      const buffer = this.buffers.get(name); if (!buffer) return;
      const ctx = this.context, source = ctx.createBufferSource(), gain = ctx.createGain(), at = ctx.currentTime + delay;
      source.buffer = buffer; gain.gain.value = .85; source.connect(gain); gain.connect(this.master); this.nodes.add(source);
      source.onended = () => { source.disconnect(); gain.disconnect(); this.nodes.delete(source); }; source.start(at);
      this.music.gain.cancelScheduledValues(at); this.music.gain.setValueAtTime(.07, at);
      this.music.gain.setTargetAtTime(.22, at + buffer.duration, .12);
    };
    void Promise.all([this.resuming, this.voicesReady]).then(play);
  }
  setPlaying(playing) {
    if (this.playing === playing) return;
    this.playing = playing; this.clearMusic();
    if (playing) { this.hits = 0; this.voice('start'); }
  }
  clearMusic() {
    for (const node of this.musicNodes) { try { node.stop(); } catch { /* Already ended. */ } }
    this.musicNodes.clear(); this.nextBeat = 0; this.beat = 0;
  }
  backing(power) {
    if (!this.playing || !this.enabled || this.context?.state !== 'running') return;
    const now = this.context.currentTime; if (this.nextBeat < now) this.nextBeat = now;
    const interval = 60 / (136 + power * 20) / 4;
    while (this.nextBeat < now + .08) {
      const delay = this.nextBeat - now, step = this.beat++ % 16;
      if (step % 4 === 0) {
        this.tone(155, 42, .19, delay, .7, 'sine', this.music);
        const bass = [65.41, 65.41, 82.41, 98][step / 4];
        this.tone(bass, bass, .17, delay, .3, 'sawtooth', this.music);
      }
      if (step % 2 === 0) this.noise(.035, delay, .15, 7000, 4500, this.music);
      if (step === 4 || step === 12) this.noise(.12, delay, .32, 2200, 1300, this.music);
      if (step % 2 === 1) {
        const note = [261.63, 329.63, 392, 523.25, 392, 329.63, 587.33, 523.25][Math.floor(step / 2)];
        this.tone(note, note, .1, delay, .12, 'triangle', this.music);
      }
      this.nextBeat += interval;
    }
  }
  charge(power) {
    this.backing(power);
    const ctx = this.context; if (!this.enabled || !ctx || ctx.state !== 'running') return;
    if (power <= .02) { this.stopCharge(); return; }
    if (!this.charging) {
      const osc = ctx.createOscillator(), harmony = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sawtooth'; harmony.type = 'triangle'; gain.gain.value = 0;
      osc.connect(gain); harmony.connect(gain); gain.connect(this.master); osc.start(); harmony.start();
      this.charging = { osc, harmony, gain };
    }
    const { osc, harmony, gain } = this.charging, at = ctx.currentTime;
    osc.frequency.setTargetAtTime(100 + power * 380, at, .045);
    harmony.frequency.setTargetAtTime((100 + power * 380) * 1.5, at, .045);
    gain.gain.setTargetAtTime(.018 + power * .035, at, .04);
    if (power >= .95 && !this.wasCharged) { [523.25, 783.99, 1046.5].forEach((note, i) => this.tone(note, note * 1.25, .16, i * .055, .18, 'square')); this.wasCharged = true; }
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
    // A crisp launch, rushing trail and bass impact follow the visual spell timing.
    this.tone(300, 1600, .12, 0, .25, 'square');
    this.tone(950, 130, .43, .025, .22, 'sawtooth');
    this.noise(.4, .03, .3, 700, 4800);
    this.tone(175, 38, .35, .46, .72, 'sine');
    this.noise(.22, .46, .55, 2200, 180);
    [523.25, 659.25, 783.99].forEach((note, i) => this.tone(note, note, .19, .49 + i * .06, .19, 'triangle'));
    this.hits++;
    if (final) {
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((note, i) => this.tone(note, note, .4, .7 + i * .105, .19, 'triangle'));
      [130.81, 261.63, 329.63, 392].forEach(note => this.tone(note, note, 1.2, 1.15, .12, 'triangle'));
      this.voice('finish', .8);
    } else this.voice(this.hits % 2 ? 'nice' : 'keep-going', .65);
  }
  quiet() {
    this.generation++; this.clearMusic(); this.stopCharge();
    if (this.music) { this.music.gain.cancelScheduledValues(this.context.currentTime); this.music.gain.value = .22; }
    for (const node of this.nodes) { try { node.stop(); } catch { /* Already ended. */ } }
    this.nodes.clear();
  }
  suspend() { this.quiet(); return this.context?.suspend().catch(() => {}); }
  close() { this.quiet(); this.destination?.stream.getTracks().forEach(track => track.stop()); return this.context?.close().catch(() => {}); }
}
