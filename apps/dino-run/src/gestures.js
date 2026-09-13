import { sameSource } from '@fitness-pair/contracts';

const HOLD_MS = 1000, RELEASE_MS = 400, GAP_MS = 250;
const visible = p => p && p.confidence >= .6 && p.x > .015 && p.x < .985 && p.y > .015 && p.y < .985;

/** UI commands from named pose joints, independent of jump calibration and score. */
export class BodyGestures {
  constructor({ oneHandSide = null } = {}) {
    this.oneHandSide = oneHandSide;
  }
  reset(session) {
    this.session = session; this.lastSeq = -1; this.lastTMs = -1;
    this.kind = null; this.since = null; this.releaseSince = null; this.latched = false;
  }
  update(frame) {
    if (!this.session || frame.sessionId !== this.session.sessionId || !sameSource(frame.source, this.session.source)
      || frame.seq <= this.lastSeq || frame.tMs <= this.lastTMs) return null;
    if (frame.tMs - this.lastTMs >= GAP_MS) { this.since = null; this.releaseSince = null; }
    this.lastSeq = frame.seq; this.lastTMs = frame.tMs;
    const j = frame.joints;
    const tracked = ['leftShoulder', 'rightShoulder', 'leftWrist', 'rightWrist'].every(n => visible(j[n]));
    if (!tracked) {
      this.kind = null; this.since = null; this.releaseSince = null;
      return { kind: null, progress: 0, event: null, tracked: false, latched: this.latched };
    }
    const raised = side => j[`${side}Wrist`].y < j[`${side}Shoulder`].y - .10;
    const lowered = side => j[`${side}Wrist`].y > j[`${side}Shoulder`].y + .04;
    const left = raised('left'), right = raised('right');
    const oneHand = (this.oneHandSide !== 'right' && left && lowered('right'))
      || (this.oneHandSide !== 'left' && right && lowered('left'));
    const kind = left && right ? 'both-hands' : oneHand ? 'one-hand' : null;
    let event = null, progress = 0;
    if (lowered('left') && lowered('right')) {
      this.releaseSince ??= frame.tMs;
      if (frame.tMs - this.releaseSince >= RELEASE_MS) this.latched = false;
    } else this.releaseSince = null;
    if (!kind || this.latched) { this.kind = null; this.since = null; }
    else {
      if (kind !== this.kind || this.since === null) { this.kind = kind; this.since = frame.tMs; }
      progress = Math.min(1, (frame.tMs - this.since) / HOLD_MS);
      if (progress === 1) {
        event = { id: `${frame.sessionId}:gesture:${frame.seq}`, kind, tMs: frame.tMs, inputSeq: frame.seq, source: { ...frame.source } };
        this.latched = true;
      }
    }
    return { kind, progress, event, tracked: true, latched: this.latched, neutral: lowered('left') && lowered('right') };
  }
}
