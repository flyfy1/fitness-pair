# Dino AR — gameplay mode 02 POC

A separate, camera-first alternative to [Dino Run](../../../apps/dino-run/README.md).
The mirrored video fills the window. The player stays in that video, with a virtual
runway, incoming cacti, a glowing collision marker, scores and entry cues
drawn over the same scene. **Debug · show body skeleton** toggles named-joint bones
and points plus a compact tracking status (stage, visible shoulder count, rejection reason and input age);
it is off by default and never hides the person or stops recognition.
The original Dino app remains the baseline; this experiment is its separate second
gameplay experience, not a mode switch added to the original app.

## MVP card

- **Target user:** one player with a fixed local camera.
- **Job:** feel present inside the runner rather than control a separate dinosaur.
- **Riskiest assumption:** an anchored collision marker over the player makes the
  obstacle timing understandable in a full-window video view.
- **P1 loop:** enable camera → detect steady shoulders → automatically play → jump to clear cacti → collision → camera off → retry.
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
Playwright, MediaPipe provider, camera lifecycle, fullscreen helper and runner
engine. The experiment owns a small shoulder-motion recognizer in
`src/shoulder-motion.js` for cameras that do not show the waist. It is intentionally outside the workspace package list:
no root package or lockfile change is needed. The first asset preparation downloads
the existing checksum-verified Lite model into ignored `public/runtime/`.
Runtime camera processing stays local; video and landmarks are not saved.

1. Keep the camera fixed, stand centered and leave room above your head. Select
   **Enable camera**. After a short shoulder reference (200 ms, at least three
   samples), the run starts automatically. There is no entry jump, maximum-height
   calibration, confirmation button or countdown. The separate camera-start POC
   owns setup-flow experiments; this POC focuses on playing.
2. Detection requires only two visible shoulders. Missing or low-confidence hips,
   knees and ankles cannot block entry. The runway anchors to visible resting
   feet, then the waist, or an upper-chest marker when only shoulders are available.
3. Jump in place to lift the glowing marker over orange cacti. The large upper-center
   instruction changes to **Jump!** as a cactus approaches and **Cleared!** after
   passing it. The marker's filled box and the cactus's solid central trunk are
   their collision areas. Arms and glow are decorative.
4. **LIFT** shows current movement on the game's fixed body-proportion scale.
   **BEST LIFT** records the highest confirmed up/down cycle since the last position
   reset or camera session, without interrupting play. It can exceed 100%, though
   the playable height is capped at 100%. Neither number is centimeters or a
   percentage of a measured physical maximum. An incomplete or lost cycle does
   not update the best. This is passive in-game measurement, not an entry gate.
5. **Debug · show body skeleton** shows bones/points and the compact diagnostic
   line, including the number of usable shoulders (`0/2`, `1/2` or `2/2`). The
   fullscreen button supports browser fullscreen and an in-window fallback.
6. **Pause**, **Turn camera off**, leaving the page/window, errors and game over
   release tracks and workers. **Play again** starts a new round after detecting
   resting shoulders, without a trial jump. **Reset position** freezes the round,
   takes a new short reference and automatically resumes. Tracking loss/delay
   freezes the run and requires explicit **Resume run**; prolonged loss or position
   drift also rebuilds the reference. No jump is needed to recover tracking.

## Geometry and rules

The existing `PoseFrame → jump-height ActionFrame → Runner snapshot` flow is reused
without changing shared contracts. Continuous height moves the player marker;
the runner counts jumps only from stable, deduplicated completion IDs. Score is
distance, and cleared cacti come from the existing collision engine. The session,
timestamps and camera provenance remain unchanged through recognition.

`scene.js` uses the same mirrored `object-fit: cover` projection as the video.
It never mirrors recognition inputs. When the resting reference is ready, the
foot/hip midpoint becomes the fixed runway anchor. When neither is usable, the
anchor is the shoulder midpoint plus a visual chest offset of 0.08 image height.
This offset is game placement, not an inferred body joint. The standing shoulder
span, corrected for image aspect ratio and multiplied by 0.7 (minimum 0.04 image
height), scales the existing 165-unit game height. This keeps
the marker tied to image movement without measuring a personal maximum. Renderer collision boxes are the exact
affine transforms of the engine's collision boxes. A resize reprojects the same
anchor and adjusts the spawn boundary; it does not reset the session or score.

This is **2D video-overlay AR**, not world-tracked 3D AR. The camera view is center
cropped to fill the viewport, which can crop limbs near the edges; stay centered.
Sideways movement does not steer the lane, and significant position/scale drift
invalidates the standing reference. The AR host keeps shoulder detection selected regardless of waist/leg visibility.
A new position reset selects the visible-foot, waist or shoulder anchor again. The marker is a game proxy,
not whole-body collision or a foot-contact/physical jump measurement. Upper-body
motion cannot establish that the feet left the floor. A two-shoulder shrug,
standing taller or moving the camera can also trigger this deliberately permissive
mode. The UI labels it **shoulder movement mode**. Completion events count
confirmed up/down control cycles, not verified physical jumps. No enjoyment, physical
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

The direct-play browser check keeps the synthetic player stationary and asserts
that the round starts with zero jumps. It then verifies proportional movement,
passive best-lift measurement, an approaching-cactus cue, clear/collision/retry,
large centered instructions, full/partial-body layouts and resource cleanup.
Unit checks reject jitter, one-sided shoulder lifts, single-frame spikes and
missing shoulders, and preserve input identity, timestamps and completion IDs.
These checks are synthetic evidence, not human detection-accuracy measurements.

For a future human comparison, use the same camera, player and starting position
for the original Dino app and this AR variation. Without recording, observe whether
the player can identify their collision marker, clear one cactus and explain why
the round ended. Record rule-comprehension errors and willingness to retry; do not
infer recognition accuracy from score. Participant recordings require prior consent.

**Decision:** retain as a runnable POC for human comparison, not as a replacement
for the baseline. Human timing, crop/framing comfort, body-to-marker registration
and enjoyment remain unverified. No public deployment is configured by this work.

### Earlier cropped-camera regression (2026-09-13)

After the torso-based correction, the reported framing still did not clearly show
the waist. Live DOM inspection showed `Stage: standing · tracking-lost · Input age:
33 ms`: fresh model input was failing the joint-availability gate before any jump
could be considered. No private video or landmarks were recorded.

The cropped-camera correction introduced `ShoulderMotionRecognizer` instead of the shared hip-dependent
recognizer. Both shoulders need confidence >= 0.5 and valid image coordinates.
After a short reference, a coherent rise above max(0.008 image height, 0.04 of the
aspect-corrected shoulder span), on at least two samples over 60 ms, confirms motion.
Originally that motion also gated entry; the direct-play revision removes that gate.
The body movement is smoothed over 35 ms; return to reference for 150 ms emits a
single stable completion ID. Missing shoulders cancel a partial cycle; recovery
requires the starting height, and loss over 750 ms resets the reference. Camera
freshness and worker watchdogs remain owned by the existing host/camera helper.

**7 local unit checks and 8 production Chrome checks passed**, plus the POC build.
New browser coverage removes all waist/leg landmarks, then repeats with low-
confidence, out-of-frame hips: both cases enter the real runner, move its marker,
render the chest anchor, and release camera resources. Existing clear/collision/
retry, full/partial-body layouts and local public-image inference checks pass.
These are synthetic/public-fixture results; a real-person retry remains necessary
for this exact camera framing. The shared recognizer and original Dino app are
unchanged by this shoulder-only correction.

### Direct-play revision (2026-09-13)

The user confirmed that entry was working and moved setup-flow work to a separate
POC. This experiment now enters the runner at rest and measures best lift during
play. Shared recognizers, contracts, the original Dino app and camera-start remain
unchanged. Validation: 7 local unit checks, the POC production build, and 8 Chrome
checks, including the local model on a public image. Human obstacle timing and
recognition accuracy remain unverified; no participant recording was collected.
