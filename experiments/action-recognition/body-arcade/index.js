import {assertPoseFrame, sameSource} from '../../../contracts/index.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const visible = point => point && point.confidence !== null && point.confidence >= .6
  && point.x > .015 && point.x < .985 && point.y > .015 && point.y < .985;
const torsoNames = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'];

/** Optional app-local control observations; shared v1 semantics remain unchanged. */
export class BodyArcadeRecognizer {
  constructor({primary = true, aiming = false} = {}) { this.primary = primary; this.aiming = aiming; }
  reset(session) {
    this.session = session; this.lastSeq = -1; this.lastTMs = -1; this.count = 0;
    this.recalibrate();
  }
  recalibrate() {
    this.baseline = null; this.steady = null; this.horizontal = 0; this.release();
  }
  release() { this.armed = false; this.lowerSince = null; this.raiseSince = null; }
  update(frame) {
    assertPoseFrame(frame);
    if (!this.session || frame.sessionId !== this.session.sessionId || !sameSource(frame.source, this.session.source)
      || frame.seq <= this.lastSeq || frame.tMs <= this.lastTMs) return null;
    const gap = frame.tMs - this.lastTMs;
    this.lastSeq = frame.seq; this.lastTMs = frame.tMs;
    const result = {version: 1, sessionId: frame.sessionId, source: {...frame.source}, inputSeq: frame.seq, tMs: frame.tMs,
      recognizerId: 'body-arcade-v1', action: 'body-arcade', phase: 'missing', progress: 0,
      calibrationProgress: null, completion: null, cue: 'Keep shoulders and hips in view.',
      controls: {horizontal: 0, aim: null, leftRaised: false, leftLowered: false, rightRaised: false, missing: []}};
    const required = [...torsoNames, ...(this.primary ? ['leftWrist'] : []), ...(this.aiming ? ['rightWrist'] : [])];
    result.controls.missing = required.filter(name => !visible(frame.joints[name]));
    const missing = cue => { this.release(); this.steady = null; result.cue = cue; return result; };
    if (gap > 250) { this.release(); this.steady = null; }
    if (result.controls.missing.length) return missing('Show ' + result.controls.missing.join(', ') + '.');
    const j = frame.joints;
    const cx = torsoNames.reduce((sum, name) => sum + j[name].x, 0) / 4;
    const shoulderY = (j.leftShoulder.y + j.rightShoulder.y) / 2;
    const hipY = (j.leftHip.y + j.rightHip.y) / 2;
    const height = hipY - shoulderY;
    const width = Math.abs(j.leftShoulder.x - j.rightShoulder.x);
    if (height < .08 || width < .055 || Math.abs(j.leftShoulder.y - j.rightShoulder.y) > height * .65)
      return missing('Face the camera with your shoulders and hips visible.');
    const raised = side => visible(j[side + 'Wrist']) && j[side + 'Wrist'].y < j[side + 'Shoulder'].y - .08;
    const lowered = side => visible(j[side + 'Wrist']) && j[side + 'Wrist'].y > j[side + 'Shoulder'].y + .06;
    const left = raised('left'), right = raised('right');
    result.controls.leftLowered = lowered('left');
    result.controls.leftRaised = left; result.controls.rightRaised = right;
    if (!this.baseline) {
      result.phase = 'calibrating'; result.calibrationProgress = 0; result.cue = 'Stand still with your hands lowered.';
      if (left || right) { this.steady = null; return result; }
      if (!this.steady || Math.abs(cx - this.steady.cx) > .018 || Math.abs(shoulderY - this.steady.shoulderY) > .018
        || Math.abs(height / this.steady.height - 1) > .12) this.steady = {cx, shoulderY, height, width, since: frame.tMs};
      result.calibrationProgress = clamp((frame.tMs - this.steady.since) / 1000, 0, 1);
      if (result.calibrationProgress < 1) return result;
      this.baseline = {...this.steady}; this.release();
    }
    const base = this.baseline;
    if (height / base.height < .6 || height / base.height > 1.6) return missing('Return to your standing distance, or recalibrate.');
    const raw = -(cx - base.cx) * frame.image.width / (base.height * frame.image.height * .85);
    const target = Math.abs(raw) < .07 ? 0 : clamp(raw, -1, 1);
    this.horizontal += (target - this.horizontal) * (1 - Math.exp(-Math.min(gap, 100) / 75));
    result.phase = 'active'; result.calibrationProgress = null;
    result.controls.horizontal = clamp(this.horizontal, -1, 1);
    if (visible(j.rightWrist)) result.controls.aim = {
      x: clamp(.5 - (j.rightWrist.x - base.cx) / (base.width * 3), 0, 1),
      // Aim below shoulder height so reaching a high target cannot mean Pause.
      y: clamp((j.rightWrist.y - (base.shoulderY + .08)) / (base.height * 1.4), 0, 1),
    };
    result.cue = left ? 'Left hand raised' : this.aiming ? 'Aim with your right wrist; raise your left hand to shoot.' : 'Move left or right. Raise your left hand for one action.';
    if (left && right) { this.release(); result.cue = 'Both hands raised · hold to pause or resume.'; }
    else if (lowered('left')) {
      this.raiseSince = null; this.lowerSince ??= frame.tMs;
      if (frame.tMs - this.lowerSince >= 250) this.armed = true;
    } else {
      this.lowerSince = null;
      if (this.primary && left && this.armed) {
        this.raiseSince ??= frame.tMs;
        if (frame.tMs - this.raiseSince >= 150) {
          result.phase = 'completed'; result.completion = {id: `${frame.sessionId}:body:${++this.count}`, repIndex: this.count};
          this.release();
        }
      } else this.raiseSince = null;
    }
    return result;
  }
}
