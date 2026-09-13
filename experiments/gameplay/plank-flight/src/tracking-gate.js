export const FRAME_FRESH_MS = 400;
export const RECOVERY_MS = 200;

/** Hold the last position on uncertainty; consecutive good input resumes following. */
export class TrackingGate {
  reset(now) { this.lastGoodAt=now; this.held=false; this.recoverySince=null; }
  observe(valid,now) {
    if (!valid) { this.held=true;this.recoverySince=null; }
    else {
      this.lastGoodAt=now;
      if(this.held) {
        this.recoverySince ??= now;
        if(now-this.recoverySince>=RECOVERY_MS) {this.held=false;this.recoverySince=null;}
      }
    }
    return this.status(now);
  }
  status(now) {
    if(now-this.lastGoodAt>FRAME_FRESH_MS) {this.held=true;this.recoverySince=null;}
    return {held:this.held};
  }
}
