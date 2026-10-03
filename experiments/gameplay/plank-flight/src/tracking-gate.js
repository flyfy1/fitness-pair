export const FRAME_FRESH_MS = 400;
export const RECOVERY_MS = 200;
export const TRACKING_GRACE_MS = 1500;

/** Hold the last position on uncertainty; consecutive good input resumes following. */
export class TrackingGate {
  reset(now) { this.lastGoodAt=this.lastFollowingAt=now; this.held=false; this.recoverySince=null; }
  observe(valid,capturedAt,now=capturedAt) {
    // Check silence before accepting another input; gaps cannot count as recovery.
    this.status(now);
    valid = valid && Number.isFinite(capturedAt) && capturedAt <= now
      && now-capturedAt < FRAME_FRESH_MS && capturedAt >= this.lastGoodAt;
    if (!valid) { this.held=true;this.recoverySince=null; }
    else {
      this.lastGoodAt=capturedAt;
      if(this.held) {
        this.recoverySince ??= capturedAt;
        if(capturedAt-this.recoverySince>=RECOVERY_MS) {this.held=false;this.recoverySince=null;}
      }
      if(!this.held)this.lastFollowingAt=capturedAt;
    }
    return this.status(now);
  }
  status(now) {
    const age=now-this.lastGoodAt;
    if(!Number.isFinite(now)||age>=FRAME_FRESH_MS) {this.held=true;this.recoverySince=null;}
    return {held:this.held,expired:!Number.isFinite(now)||now-this.lastFollowingAt>=TRACKING_GRACE_MS};
  }
}
