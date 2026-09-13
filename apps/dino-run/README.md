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
2. Keep the camera fixed, with both shoulders and hips in view. Full-body tracking
   is preferred when knees and ankles are also visible; otherwise upper-body tracking
   is selected automatically. Leave space above your head for the jump. Stand upright and still for about two seconds.
3. Check the **FULL BODY** or **UPPER BODY** label. At **Jump once to set your maximum**, perform one maximum comfortable jump,
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
The standing baseline records the selected body geometry. Full-body displacement
is the minimum upward movement of the hips and both ankles. Upper-body displacement
is the minimum coherent rise of shoulders and hips. Both normalize by their own
captured maximum; the on-screen tracking label identifies the current mode. A short smoothing filter and grounded thresholds suppress jitter; requiring
both ankles and hip rise in full-body mode rejects ordinary squats and isolated
knee/foot lifts. Upper-body mode cannot confirm feet leaving the ground: it controls
the game using torso movement and records return-to-baseline cycles, not verified
physical jumps. Both shoulders and hips must remain visible; head-only framing is
not sufficient. Shrugging alone and torso bending do not provide coherent rise.

After a full-body baseline, short leg occlusions pause. If the legs remain unseen
and the torso is stable for about 750 ms, the recognizer switches to upper-body
tracking and requires a new standing and maximum calibration. Reappearing legs do
not change a calibrated upper-body session. Choose Recalibrate to select again.

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
assets are ignored. The 2026-09-13 fullscreen and upper-body update passed 38
shared/recognizer checks, 15 Dino engine/camera checks and 13 production Chrome
checks. Browser checks cover default game-left/camera-right geometry, desktop and
mobile fullscreen, capture-time delay rejection, full- and upper-body calibration,
proportional height, mode-switch recalibration, loss pause, permission errors and
resource cleanup. A synthetic camera round clears an obstacle, collides, then
recalibrates and starts a new round.
Synthetic integration and public-image inference are distinct
from a real person's jump: **human camera-to-Dino responsiveness and calibration
accuracy are not yet verified**. No public deployment is configured.
