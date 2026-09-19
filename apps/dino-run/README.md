# Dino Run — calibrated jump-height POC

The game fills the window by default: gameplay dominates the left, the camera is
upper right, and scores, instructions and current status are below it. The fullscreen
button enters browser fullscreen where supported; embedded browsers use an expanded
window view. Escape or the exit button restores the same game-first layout.

Jump in front of a fixed camera and Dino follows your relative height. A keyboard
and touch mode remains available separately. Camera mode is the default.

## POC boundary

- **Player / job:** a player controlling a runner with small and large physical jumps.
- **Assumption:** a fixed camera can estimate full-body jump height or upper-body movement with
  enough responsiveness to control this game. Human trials must validate that assumption.
- **Loop:** enable camera → stand still → one maximum comfortable jump and landing
  → one-hand confirmation → three-second countdown → proportional live Dino height
  → two-hand pause / resume → obstacles → retry.
- **Proof:** synthetic named-pose tests, actual browser calibration and height mapping
  with synthetic camera input, plus separate real-model inference on a public image.
- **Scope:** one player, one fixed camera, personal relative height, one runner.
  No centimeter measurement, exercise assessment, private recording, or multiplayer.
- **Time box:** this one playable POC; stop after the loop is runnable and verified.

## Run

From the repository root with Node.js 22.12+:

```sh
npm ci
npm run dev --workspace dino-run
```

Open <http://127.0.0.1:5180>. First run prepares the same local MediaPipe Lite model
and WASM already used by Motion Quest. Model download has a 60-second timeout and
an exact checksum check. Generated assets are ignored by Git. No runtime camera
frames are recorded or uploaded. Use localhost or HTTPS for camera access.

1. Choose **Camera mode**, then **Enable camera**.
2. Keep both shoulders and hips visible. Dino uses **UPPER BODY · TORSO MOVEMENT**
   even when your legs are visible, so ankle tracking cannot keep restarting calibration.
   Stand upright and still for about two seconds.
3. Make one comfortable maximum rise/jump, then return to your starting height.
   The measured range is retained while you wait; it no longer expires after 15 seconds.
   A too-small movement still needs another attempt. The screen explains whether it
   needs visible joints, a stable starting position, more rise, or a return to baseline.
4. At **Height captured — confirm it**, raise **your left hand above the shoulder for one
   second**, keeping the other hand below its shoulder. Or click **Use measured height**.
   Hands alone cannot invent a jump range. Lower both hands for the three-second countdown.
5. Jump at different heights. Half your calibrated torso displacement maps to half
   of Dino's maximum height; returning to baseline brings Dino down.
6. Raise **both hands above the shoulders for one second** to pause. Lower both hands
   for at least 0.4 seconds, then raise both again for one second to continue. Lower
   them for the countdown. A held gesture fires only once. Both wrists and shoulders
   must be visible for gestures; jump-height tracking itself only needs shoulders/hips.

**Recalibrate** pauses and repeats measurement. P / Escape and the pause button
also retain the camera so a gesture can resume without recalibration. **Turn camera
off**, leaving the window/tab, errors and game over release camera tracks and the
model worker. Gestures cannot enable a stopped camera; use the on-screen button once.
Brief missing/delayed tracking pauses gameplay; resume explicitly after returning.
Long torso loss or a changed position/scale still invalidates calibration. The range
is session-only and is not saved across reloads. Wrist loss does not rearm a gesture
or count as lowering the hands. Buttons remain available when hands cannot be seen.

Keyboard mode uses Space / Arrow Up / game taps / the Jump button for fixed-height
jumps, with P / Escape to pause. Its local best score is separate from camera mode.
Keyboard and external jump commands cannot override camera height.

## Height model and limits

`@fitness-pair/action-jump-height` receives named, unmirrored `PoseFrame` joints.
The standing baseline records the selected body geometry. Full-body displacement
is the minimum upward movement of the hips and both ankles. Upper-body displacement
is the minimum coherent rise of shoulders and hips. Both normalize by their own
captured maximum; the on-screen tracking label identifies the current mode. A short smoothing filter and grounded thresholds suppress jitter; requiring
both ankles and hip rise in full-body mode rejects ordinary squats and isolated
knee/foot lifts. Upper-body mode cannot confirm feet leaving the ground: it controls
the game using torso movement and records return-to-baseline cycles, not verified
physical jumps. Both shoulders and hips must remain visible; head-only framing is
not sufficient. Shrugging alone and torso bending do not provide coherent rise.

The shared recognizer still supports automatic full-body selection for other hosts.
Dino explicitly requests torso tracking and manual maximum confirmation. Calibration
needs multiple elevated samples above a noise floor and a steady return before it
can be accepted. It retains the largest captured displacement until confirmation;
recalibration, long torso loss or a changed camera/body position clears it.

This is **relative 2D image displacement, not physical height or a biomechanics
measurement**. Perspective, tracking confidence, tiptoe movement, camera movement,
changed distance, occlusion and body technique can affect it. The display uses
percentages, never centimeters. Detectable scale/position changes request a new
baseline; not every camera movement can be distinguished from body movement.
The physical cadence, latency and difficulty still need human playtesting.

The camera emits at most 30 input samples/sec with one inference in flight.
The host pauses gameplay after 250ms without a fresh result; the camera helper
terminates a stalled model after 1 second. Initialization is bounded at 330 seconds,
including permission/video readiness. These are implementation thresholds, not
measured end-to-end human motion latency.

## Module boundary

- `packages/pose-mediapipe`: existing local worker and named-joint adapter. Its new
  `prepare-assets.mjs` helper prepares runtime files for either host.
- `packages/action-jump-height`: camera-independent baseline, maximum measurement,
  continuous height and deduplicatable landing events.
- `src/camera.js`: permission, media, latest-frame transport and resource lifetime.
- `src/main.js`: calibration UI, countdown, loss/pause behavior and control selection.
- `../../packages/gameplay/body-gestures.js`: named-wrist/shoulder UI commands with hold and release gates; no scoring.
- `src/engine.js`: game state, continuous height consumption, keyboard physics,
  collision, scoring and per-session input validation.
- `src/render.js`: canvas rendering only.

The additive jump-height action is described in
[the contract note](../../contracts/proposals/jump-height-poc.md). Continuous height
positions Dino; it does not award points or completed jumps. Only unique landing
completion IDs increment the motion jump counter. Runner score remains distance,
with slower motion-mode obstacles and separate best-score storage.

The existing `window.dinoGame.getState()` exposes game state and a compact camera
status (`state`, `stage`, `calibrated`, `heightRatio`, `cue`, `trackingMode`, `awaitingStart`), without
video or raw landmarks. `window.dinoGame.command()` remains a host control boundary.
The legacy `fitness:action` jump event is accepted only in Keyboard mode.

## Verification

```sh
npm test
npm run test --workspace dino-run
npm run build
npm run build --workspace dino-run
npm run test:browser --workspace dino-run
```

Browser checks use the production build in installed Chrome on isolated port 5181,
so the user's development preview can remain on 5180. Test screenshots and runtime
assets are ignored. The gesture-control update is checked with 40 shared/recognizer
checks, 18 Dino engine/camera/gesture checks and 15 production Chrome checks. Browser checks cover default game-left/camera-right geometry, desktop and
mobile fullscreen, capture-time delay rejection, explicit torso calibration,
proportional height, torso-loss recalibration, held-hand confirmation/pause/resume, permission errors and
resource cleanup. A synthetic camera round clears an obstacle, collides, then
recalibrates and starts a new round.
Synthetic integration and public-image inference are distinct
from a real person's jump: **human camera-to-Dino responsiveness and calibration
accuracy are not yet verified**. No public deployment is configured.

## Gesture-control MVP follow-up

The player needs to finish calibration and pause/resume without returning to the
computer. The risk is that ordinary arm motion triggers a menu command, or strict
landing detection discards a usable range. This slice reuses the pose stream, adds
explicit confirmation and held/released body commands, and keeps button fallbacks.
Success evidence is synthetic range retention, no calibration bypass, one-shot
commands, delayed/missing-input rejection, and a complete browser confirmation →
run → gesture pause → gesture resume loop. No new model, recording, hand classifier,
backend or deployment is added. Human calibration reliability remains unverified.


## Arcade replay integration

When embedded in Hopmodo, the arcade host automatically composites and stores a local replay after game start. Camera sessions publish validated named-joint PoseFrames; the host stores their aligned sidecar with the replay. The standalone game does not create recordings or persist tracking. The host shows a notice before play; neither camera imagery nor tracking is uploaded automatically. A session UUID lets replays distinguish a restart from pause/resume without changing the runner's internal numeric round or movement-event semantics.

The shared `PoseCamera` accepts an optional `inferenceTimeoutMs` (1000–10000 ms).
Dino Run keeps the one-second default; camera-start game mode uses eight seconds
to tolerate temporary slow inference while its round waits. The watchdog still
releases owned tracks and the worker on a sustained stall.


## Integration boundaries

`engine.js` owns rules and physics, with `command()` for discrete input and
`setHeightRatio()` for continuous controls. It imports no pose or action schema.
`motion-input.js` optionally maps validated recognizer output onto this control
surface; timestamp/session/source guards and completion deduplication live in
`packages/gameplay/input.js`. `main.js` composes camera, recognizer, controller and
native UI. Its `window.gameplay` presentation API supplies the shared arcade host
with canvas, camera, round, phase and score, independently of the active input.
