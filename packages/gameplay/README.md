# Optional action input

`createActionController` is the boundary between recognition and game controls.
It accepts the existing `ActionFrame` contract, preserves its source/session/time,
rejects stale or foreign frames, and deduplicates completion IDs. Each integration
supplies an `accept` predicate and a mapping to the game's own semantic controls.
It does not acquire a camera, select a model, own rendering, or award points.

Example: `apps/dino-run/src/motion-input.js` maps calibrated jump height to
`Runner.setHeightRatio()`. Keyboard controls instead call `Runner.command()`.
The Runner engine imports neither this controller nor any recognition contract.
A different recognizer can feed the controller without changing game physics.
Reset the controller with each recognition session; dispose it on teardown.

The existing `PoseFrame → ActionFrame → GameSnapshot` contract is unchanged.
Presentation and recording are independently hosted by
`apps/arcade/src/gameplay`; see its README and typed presentation interface.

## Camera start gesture

`HandsStartGate` consumes named PoseFrames using the existing BodyGestures
recognizer. Hosts choose a setup boundary for this gate. Motion Quest uses it before squat
calibration, keeping hand commands separate from movement recognition; other
hosts can finish calibration/practice first. Both wrists
must be visible above the shoulders for one second, followed by 400 ms with both
hands down. A missing/stale frame or loss of readiness resets the attempt. Reset
the gate for every camera session; hide its view on teardown. It emits permission
to begin, never a scoring ActionFrame. Camera permission still requires a button.

`createHandsStart` provides the shared large instruction overlay for all eleven
camera routes, with transparent text and no panel or progress bar. Pointer and keyboard previews keep their existing controls.
Flight needs both shoulders and wrists in view for this initial confirmation;
afterwards its existing head/one-shoulder framing remains sufficient.

## Language preference

`locale.js` stores a shared `hopmodo.language` preference (`en` or `zh`) on this
origin. Without an explicitly saved choice, every browser starts in English. Unavailable storage does not prevent an in-page change.
The helper owns no game state or UI. Push-up Flight is the first integration;
other games can independently resolve their own text/audio resources from it.
