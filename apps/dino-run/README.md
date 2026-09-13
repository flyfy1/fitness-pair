# Dino Run — calibrated jump-height POC

Jump in front of a fixed camera and Dino follows your relative height. A keyboard
and touch mode remains available separately. Camera mode is the default.

## POC boundary

- **Player / job:** a player controlling a runner with small and large physical jumps.
- **Assumption:** a fixed, full-body camera can estimate relative jump height with
  enough responsiveness to control this game. Human trials must validate that assumption.
- **Loop:** enable camera → stand still → one maximum comfortable jump and landing
  → three-second countdown → proportional live Dino height → obstacles → retry.
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
2. Keep the camera fixed, with shoulders, hips, knees and ankles in view. Leave
   space above your head for the jump. Stand upright and still for about two seconds.
3. At **Jump once to set your maximum**, perform one maximum comfortable jump,
   land in the same spot and stand steady. An unclear/too-small jump asks for a retry.
4. After calibration, remain grounded for the three-second countdown. The run
   starts automatically so you do not have to return to the keyboard.
5. Jump at different heights. Half your calibrated image displacement maps to
   half of Dino's maximum height; descent follows your descent and landing returns
   Dino to the ground. Larger-than-calibrated jumps clamp at 100%.

**Recalibrate** pauses the game and repeats standing plus maximum-jump measurement.
P / Escape pauses. Manual pause, leaving the window/tab, stop, error, and game over
release camera tracks and the model worker. Starting the camera again recalibrates.
Brief missing/delayed tracking pauses gameplay; return in view and choose **Resume
run** for an explicit countdown. Long loss or position/scale drift invalidates the
calibration. Camera calibration is session-only and is not saved across reloads.

Keyboard mode uses Space / Arrow Up / game taps / the Jump button for fixed-height
jumps, with P / Escape to pause. Its local best score is separate from camera mode.
Keyboard and external jump commands cannot override camera height.

## Height model and limits

`@fitness-pair/action-jump-height` receives named, unmirrored `PoseFrame` joints.
The standing baseline records hip and ankle positions. Live displacement is the
minimum upward movement of the hips and both ankles, normalized by the captured
maximum. A short smoothing filter and grounded thresholds suppress jitter; requiring
both ankles and hip rise rejects ordinary squats and isolated knee/foot lifts.

This is **relative 2D image displacement, not physical height or a biomechanics
measurement**. Perspective, tracking confidence, tiptoe movement, camera movement,
changed distance, occlusion and body technique can affect it. The display uses
percentages, never centimeters. Detectable scale/position changes request a new
baseline; not every camera movement can be distinguished from body movement.
The physical cadence, latency and difficulty still need human playtesting.

The camera emits at most 30 input samples/sec with one inference in flight.
The host pauses gameplay after 250ms without a fresh result; the camera helper
terminates a stalled model after 1 second. Initialization is bounded at 30 seconds,
including permission/video readiness. These are implementation thresholds, not
measured end-to-end human motion latency.

## Module boundary

- `packages/pose-mediapipe`: existing local worker and named-joint adapter. Its new
  `prepare-assets.mjs` helper prepares runtime files for either host.
- `packages/action-jump-height`: camera-independent baseline, maximum measurement,
  continuous height and deduplicatable landing events.
- `src/camera.js`: permission, media, latest-frame transport and resource lifetime.
- `src/main.js`: calibration UI, countdown, loss/pause behavior and control selection.
- `src/engine.js`: game state, continuous height consumption, keyboard physics,
  collision, scoring and per-session input validation.
- `src/render.js`: canvas rendering only.

The additive jump-height action is described in
[the contract note](../../contracts/proposals/jump-height-poc.md). Continuous height
positions Dino; it does not award points or completed jumps. Only unique landing
completion IDs increment the motion jump counter. Runner score remains distance,
with slower motion-mode obstacles and separate best-score storage.

The existing `window.dinoGame.getState()` exposes game state and a compact camera
status (`state`, `stage`, `calibrated`, `heightRatio`, `cue`, `awaitingStart`), without
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
assets are ignored. On 2026-09-13, 30 shared/recognizer checks, 15 Dino engine/camera
checks and 8 production Chrome checks passed, with both app builds successful.
Browser checks include capture-time delay rejection as well as calibration,
proportional height, loss pause, mobile, permission errors and resource cleanup.
Synthetic integration and public-image inference are distinct
from a real person's jump: **human camera-to-Dino responsiveness and calibration
accuracy are not yet verified**. No public deployment is configured.
