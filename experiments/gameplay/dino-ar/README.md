# Dino AR — gameplay mode 02 POC

A separate, camera-first alternative to [Dino Run](../../../apps/dino-run/README.md).
The mirrored video fills the window. The player stays in that video, with a virtual
runway, incoming cacti, a glowing collision marker, scores and calibration cues
drawn over the same scene. **Debug · show body skeleton** toggles named-joint bones
and points; it is off by default and never hides the person or stops recognition.
The original Dino app remains the baseline; this experiment is its separate second
gameplay experience, not a mode switch added to the original app.

## MVP card

- **Target user:** one player with a fixed local camera.
- **Job:** feel present inside the runner rather than control a separate dinosaur.
- **Riskiest assumption:** an anchored collision marker over the player makes the
  obstacle timing understandable in a full-window video view.
- **P1 loop:** enable camera → stand still → maximum comfortable jump and landing
  → three-second countdown → jump to clear cacti → collision → camera off → retry.
- **Success proof:** a browser round calibrates, changes marker height, clears a
  cactus, collides, releases resources and restarts; a human trial must separately
  establish that timing and body placement are understandable.
- **No-gos:** private recordings, uploads, new models/dependencies, physical-height
  claims, room mapping, body segmentation/occlusion, multiplayer or public deployment.
- **Appetite:** this one playable experiment and one bounded review; stop after
  validation, leaving real-person playtesting as the explicit learning boundary.

## Run

From the repository root, using Node.js 22.12+:

```sh
npm ci
npm --prefix experiments/gameplay/dino-ar run dev
```

Open <http://127.0.0.1:5196>. The experiment uses the existing repository Vite,
Playwright, MediaPipe provider, jump-height recognizer, camera lifecycle, fullscreen
helper and runner engine. It is intentionally outside the workspace package list:
no root package or lockfile change is needed. The first asset preparation downloads
the existing checksum-verified Lite model into ignored `public/runtime/`.
Runtime camera processing stays local; video and landmarks are not saved.

1. Keep the camera fixed, stand centered and leave room above your head. Select
   **Enable camera**, stand still, then make one maximum comfortable jump and land.
2. The runway anchors to the feet when full-body tracking is available. If only
   shoulders and hips are visible, the UI explicitly labels **upper body / torso
   movement**, and the marker anchors to the waist instead.
3. After the countdown, jump in place to lift the glowing marker over orange cacti.
   The marker's filled box is the player's collision area; each cactus's solid
   central trunk is its collision area. Arms and the glow are decorative.
4. Toggle **Debug · show body skeleton** to inspect tracking; recognition and
   gameplay continue whether the skeleton is visible or not. Use the fullscreen
   button for browser fullscreen, with the existing in-window fallback.
5. **Pause**, **Turn camera off**, leaving the page/window, errors and game over
   release tracks and workers. Restarting the camera requires new calibration.
   **Recalibrate** freezes the round, clears its anchor and repeats calibration.
   Short tracking loss/delay freezes the run and requires explicit **Resume run**.

## Geometry and rules

The existing `PoseFrame → jump-height ActionFrame → Runner snapshot` flow is reused
without changing shared contracts. Continuous height moves the player marker;
the runner counts jumps only from stable, deduplicated completion IDs. Score is
distance, and cleared cacti come from the existing collision engine. The session,
timestamps and camera provenance remain unchanged through recognition.

`scene.js` uses the same mirrored `object-fit: cover` projection as the video.
It never mirrors recognition inputs. On calibration completion, the grounded
foot/hip midpoint becomes a fixed runway anchor. The measured image displacement
scales the existing 165-unit maximum game height, so the marker's vertical travel
matches the calibrated movement on screen. Renderer collision boxes are the exact
affine transforms of the engine's collision boxes. A resize reprojects the same
anchor and adjusts the spawn boundary; it does not reset the session or score.

This is **2D video-overlay AR**, not world-tracked 3D AR. The camera view is center
cropped to fill the viewport, which can crop limbs near the edges; stay centered.
Sideways movement does not steer the lane, and significant position/scale drift
invalidates calibration. The recognizer may switch from full-body to upper-body
tracking and require recalibration when legs disappear. The marker is a game proxy,
not whole-body collision or a foot-contact/physical jump measurement. Upper-body
motion cannot establish that the feet left the floor. No enjoyment, physical
accuracy, exercise-quality, calorie or latency claim follows from synthetic tests.

## Validation and comparison

```sh
npm --prefix experiments/gameplay/dino-ar test
npm --prefix experiments/gameplay/dino-ar run build
npm --prefix experiments/gameplay/dino-ar run test:browser
```

Production Chrome checks use their own strict port 5197. They fail rather than
reuse another checkout's preview. Screenshots and runtime assets are ignored.
Tests label the generated video **synthetic camera**, replace only the camera/model
boundary, and run the real recognizer and game. A separate public still-image
check runs the real local model and checks that no runtime requests leave localhost.

2026-09-13 local verification on macOS, Node.js 26.7.0 and installed Chrome:
**3 scene tests, 6 production browser checks, 38 shared/recognizer checks and 15
existing Dino engine/camera checks passed**, along with the POC production build.
Browser evidence includes a complete clear/collision/retry loop, portrait full-body
and upper-body views, fullscreen, skeleton on/off, tracking-loss/recalibration,
permission denial, late-grant cancellation and track/worker cleanup. Visual review
confirmed the full-body HUD sits above the foot runway. The initial model download
timed out; verification reused the locally cached model and rechecked its SHA-256.
No human camera trial was performed.

For a future human comparison, use the same camera, player and calibration setup
for the original Dino app and this AR variation. Without recording, observe whether
the player can identify their collision marker, clear one cactus and explain why
the round ended. Record rule-comprehension errors and willingness to retry; do not
infer recognition accuracy from score. Participant recordings require prior consent.

**Decision:** retain as a runnable POC for human comparison, not as a replacement
for the baseline. Human timing, crop/framing comfort, body-to-marker registration
and enjoyment remain unverified. No public deployment is configured by this work.
