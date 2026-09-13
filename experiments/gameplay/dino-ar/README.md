# Dino AR — gameplay mode 02 POC

A separate, camera-first alternative to [Dino Run](../../../apps/dino-run/README.md).
The mirrored video fills the window. The player stays in that video, with a virtual
runway, incoming cacti, a glowing collision marker, scores and entry cues
drawn over the same scene. **Debug · show body skeleton** toggles named-joint bones
and points; it is off by default and never hides the person or stops recognition.
The original Dino app remains the baseline; this experiment is its separate second
gameplay experience, not a mode switch added to the original app.

## MVP card

- **Target user:** one player with a fixed local camera.
- **Job:** feel present inside the runner rather than control a separate dinosaur.
- **Riskiest assumption:** an anchored collision marker over the player makes the
  obstacle timing understandable in a full-window video view.
- **P1 loop:** enable camera → jump once → immediately play → jump to clear cacti → collision → camera off → retry.
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
   **Enable camera**, then **jump once to start**. The host automatically captures
   a short standing reference (250 ms); a clear upward movement starts play while
   you are still airborne. There is no maximum-height measurement, landing wait,
   confirmation button or countdown.
2. The runway anchors to the pre-jump foot position with full-body tracking. With
   only shoulders and hips visible, the UI labels **upper body / torso movement**
   and the marker anchors to the pre-jump waist position instead.
3. Jump in place to lift the glowing marker over orange cacti. Its filled box is
   the player's collision area; each cactus's solid central trunk is its collision
   area. Arms and glow are decorative. Movement level uses a body-proportion scale,
   not a percentage of your personal maximum.
4. **Debug · show body skeleton** controls only the bones/points overlay. Use the
   fullscreen button for browser fullscreen, with the existing in-window fallback.
5. **Pause**, **Turn camera off**, leaving the page/window, errors and game over
   release tracks and workers. Restarting the camera requires just another jump.
   **Reset position** freezes the round and repeats the short reference and jump.
   Tracking loss/delay freezes the run and requires explicit **Resume run**;
   prolonged loss or position drift also requires another reference and jump.

## Geometry and rules

The existing `PoseFrame → jump-height ActionFrame → Runner snapshot` flow is reused
without changing shared contracts. Continuous height moves the player marker;
the runner counts jumps only from stable, deduplicated completion IDs. Score is
distance, and cleared cacti come from the existing collision engine. The session,
timestamps and camera provenance remain unchanged through recognition.

`scene.js` uses the same mirrored `object-fit: cover` projection as the video.
It never mirrors recognition inputs. When the first lift is detected, the cached pre-jump
foot/hip midpoint becomes the fixed runway anchor. Half the standing torso length
(minimum 0.04 image height) scales the existing 165-unit game height. This keeps
the marker tied to image movement without measuring a personal maximum. Renderer collision boxes are the exact
affine transforms of the engine's collision boxes. A resize reprojects the same
anchor and adjusts the spawn boundary; it does not reset the session or score.

This is **2D video-overlay AR**, not world-tracked 3D AR. The camera view is center
cropped to fill the viewport, which can crop limbs near the edges; stay centered.
Sideways movement does not steer the lane, and significant position/scale drift
invalidates the standing reference. The recognizer may switch from full-body to upper-body
tracking and require a fresh reference and jump when legs disappear. The marker is a game proxy,
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

The quick-start browser check uses a synthetic lift of 0.02 image height, below
our previous maximum-calibration threshold. It asserts that the round is running
before the fixture lands, then verifies proportional movement, clear/collision,
retry, full-body/upper-body layouts, debug toggling and resource cleanup. Unit
checks reject jitter, isolated foot lifts, single-frame spikes and missing poses;
existing default/manual calibration behavior remains covered separately. This is
synthetic evidence, not a human detection-accuracy or responsiveness measurement.

For a future human comparison, use the same camera, player and starting position
for the original Dino app and this AR variation. Without recording, observe whether
the player can identify their collision marker, clear one cactus and explain why
the round ended. Record rule-comprehension errors and willingness to retry; do not
infer recognition accuracy from score. Participant recordings require prior consent.

**Decision:** retain as a runnable POC for human comparison, not as a replacement
for the baseline. Human timing, crop/framing comfort, body-to-marker registration
and enjoyment remain unverified. No public deployment is configured by this work.
