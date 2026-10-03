# AR tracking recovery

## MVP card

- Target user: a player standing away from the screen in any of the six AR games.
- Job: continue the same round after stepping briefly out of camera view.
- Main risk: automatic recovery could advance physics early or treat a held hand
  as a primary action.
- P1 loop: tracking loss holds controls for a 1.5-second grace period → longer
  loss pauses the round → return with visible, lowered hands →
  500 ms of valid observations → a 1.5-second visible countdown → the same round
  resumes without a new camera, calibration or recording. Stay paused opts out.
- Proof: bounded input-time tests, all six real game adapters driven by synthetic
  camera observations, and an arcade replay retaining its original session.
- No-gos: automatic camera permission/restart, new models/dependencies, game-rule
  changes, scoring during recovery, or claims about human recognition accuracy.
- Appetite: one complete recovery loop, validated and deployed before another
  product slice. Audio and gesture breadth remain separate work.

## Behavior

Short tracking gaps keep physics running for up to 1.5 seconds from the last
valid capture timestamp. Position/aim retain their last valid values; missing or
stale observations cannot emit a primary action. Fresh tracking inside that
window continues the same round immediately, without a pause or countdown.
Longer loss pauses the world. Camera failure still releases its owned resources.

Only tracking-caused pauses recover automatically. Missing/stale/invalid torso
tracking or unobserved/raised hands restart the readiness hold and countdown.
Duplicate or foreign observations cannot advance it. Render time alone cannot
resume a game. Repeated loss during the countdown keeps physics frozen.

The existing pause control becomes Stay paused during automatic recovery. It
cancels recovery while retaining the camera and round; Resume or the deliberate
both-hands gesture remains available. Manual pauses never resume automatically.
Camera stop, failure, backgrounding, recalibration, finish and disposal cancel
pending recovery. Camera failure retains its existing explicit retry boundary.

The recognizer is released on paused observations and again before resuming.
The frame that resumes play is not sent to game input. A primary action requires
new observed lowering followed by a new stable raise during active play.
Existing source/session identities, calibration, event IDs and recording remain
unchanged. Generated fixtures prove software behavior, not physical-camera or
human recognition accuracy.

## Validation

- `npm test`: 138 deterministic tests, including capture-time grace boundaries,
  stable recovery, stale/foreign inputs, cancellation and session isolation.
- `npm run build`: all nine current playable game entries and retained aliases.
- Chrome: all 12 recovery scenarios across the six AR adapters, 18 existing
  gameplay/tutorial/camera regressions and seven arcade recording/mobile flows.
  The grace period advances Brick Pulse's serve timer and Orbit Knife's rotation;
  sustained loss freezes physics, while resumed hands need a fresh action cycle.
- Deployment/API checks: 35 existing Pi/GCP transport and gallery worker tests.
- Generated camera/pose fixtures are synthetic. The existing public-image model
  test verifies local inference plumbing, without establishing human accuracy.
