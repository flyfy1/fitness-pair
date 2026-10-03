// Presentation-only wave. Completed actions remain owned by the game reducer.
export class GuardianWave {
  constructor() { this.reset(); }
  reset() { this.elapsed = 0; this.shift = 0; this.defeated = 0; this.lastTime = null; }
  update(time, playing, defeated) {
    const dt = this.lastTime === null ? 0 : Math.max(0, Math.min(100, time - this.lastTime));
    this.lastTime = time;
    this.defeated = Math.min(5, Math.max(0, defeated));
    if (playing) this.elapsed += dt;
    this.shift += (this.defeated - this.shift) * (1 - Math.exp(-dt / 420));
  }
  position(index, frontline = .50) {
    const rank = Math.max(0, index - this.defeated);
    return Math.max(frontline + rank * .18, .84 + index * .18 - this.shift * .18 - this.elapsed / 1000 * .022);
  }
}
