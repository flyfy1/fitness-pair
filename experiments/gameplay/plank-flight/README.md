# Plank Flight — local video AR experiment

## MVP card

- **Target player:** one person in a side-on camera view, doing a forearm plank,
  high plank, or push-up movement.
- **Job:** turn time holding a support pose into a small, encouraging flight.
- **Riskiest assumption:** the existing local Lite pose model provides sufficiently
  stable side-view landmarks near the floor to recognize support and locate a head.
- **Loop:** enable camera → position full body sideways → hold support for 1.2 seconds
  → fly through obstacles over the live video → release to descend → after a short
  coast, crash softly → encouragement and an explicit fresh start.
- **Success proof:** deterministic named-pose checks and browser interaction,
  camera lifecycle and rendering checks; a real person's playability remains unverified.
- **No-gos:** uploads, recordings, face identification, exercise-quality assessment,
  repetition counting, multiplayer, new dependencies, or changes to other games.
- **Appetite:** one runnable experiment and one bounded review; no additional levels.

## Ownership and baseline

All changes belong to `experiments/gameplay/plank-flight/`. The baseline is Motion
Quest's local MediaPipe model and Dino Run's camera lifecycle. The host preserves
`PoseFrame → ActionFrame → GameSnapshot`; the experiment's provider adds an optional
`head` presentation hint outside the shared joint map, leaving shared v1 unchanged.
Raw model indices stay in `src/pose-provider.js`. The game consumes the experimental
`plank-hold` action: active time controls flight, and time is shown in seconds, never
as completed repetitions. There are no completion events or repetition scores.

Video remains the full background; the person is not removed. Graphics are overlaid
on that video and a local head crop appears in the cockpit when visible. This is
2D video AR, without body segmentation, world anchoring, or depth occlusion.

## Run

From the repository root, install the existing dependencies with `npm ci`, then:

```sh
cd experiments/gameplay/plank-flight
npm run dev
```

Open <http://127.0.0.1:5184>. Use localhost or HTTPS and a recent desktop Chrome.
Keep the camera fixed near your side, with head, shoulders, arms, hips, knees and
ankles visible. A front-facing or head-only view cannot validate this support pose.
Keep the device somewhere visible without changing your posture to watch it.
The English UI follows the repository's artifact-language policy.

## Evidence boundary

Synthetic tests validate geometry, timing, provenance, rendering and cleanup only.
Public-fixture inference validates model plumbing only. Neither proves human plank
or push-up accuracy, exercise quality, health outcomes, or emotional effect.
The experiment recognizes a horizontal supported pose during push-ups; it does not
count repetitions or certify technique. Prone lying and occlusion may be ambiguous
in 2D. If tracking disappears, gameplay pauses rather than treating it as fatigue.
A fresh explicit attempt is required after a tracking failure or camera stop.

The pose model's nose and ear indices follow the
[official MediaPipe landmark definitions](https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/vision/PoseLandmark).
Runtime files and model weights are generated locally and ignored. Camera pixels
and head crops stay in memory and are never saved or uploaded.

## Recognition and flight details

One fully visible side is enough; each required joint needs visibility ≥ 0.6. Pixel
aspect ratio is corrected before checking body angles. Shoulder-to-ankle span must
be at least 22% of image width, near-horizontal, with hip/knee angles ≥ 150°/145°,
and visible wrist/elbow support below the torso. These heuristic thresholds are
experimental, not personalized calibration or exercise-technique standards.
Continuous supported frames for 1.2 seconds unlock the round. A gap over 250 ms
resets this entry timer. The recognizer accepts high/forearm support and the lowered
push-up shape, without distinguishing them as separate exercises.

Support lifts, visible non-support descends, and 3 seconds of uninterrupted
non-support triggers a 1.6-second tumbling animation. A gate collision also triggers
the animation. Holding time and gates are separate counters; no rep events are
created. Head visibility is optional: its absence uses a generic pilot and does
not change recognition. Preview and head crop are mirrored only in the renderer.

Missing body geometry during flight, an inference result older than 250 ms, window
blur, hidden tab, or a camera failure stops the attempt and releases owned resources.
The camera helper bounds initialization at 30 seconds and stalled inference at
1 second. Cancellation also stops a late-arriving permission stream. Completion
releases tracks, worker, and the in-memory head crop. Stopped attempts require a
new start and fresh 1.2-second support calibration; keyboard never controls camera
sessions. The separate demo is explicitly synthetic.

## Verification

```sh
npm test
npm run build
npm run test:browser
```

Run these three commands from this experiment folder. Browser tests use a production
preview on isolated port 5185 and installed Chrome. Runtime preparation checks the
same SHA-256-pinned Lite model as the baseline app. The initial model download timed
out on this machine; verification reused the existing local model and checked its
checksum. No model bytes are committed.

2026-09-13 evidence: six synthetic unit checks cover support shapes, calibration,
provenance, stale frames, coast/recovery, collisions and optional head hints. Browser
checks cover the synthetic camera AR loop through retry, video/overlay alignment,
local head crop, tracking interruption, permission denial, late cancellation, mobile
pointer controls and layout. A separate public standing-image inference checks the
real local model and head output, with no external runtime requests. This standing
image is **not** evidence of real plank or push-up recognition. The root baseline's
38 tests also pass.

Decision: keep as an isolated playable POC for a live, non-recorded side-view trial.
The remaining question is whether actual near-floor tracking is stable and whether
the hold/rest flight cadence and encouragement feel good. No human accuracy or
emotional-impact claim has been established; stop implementation at this boundary.

## Full-window play

The game opens edge to edge at the current window size. Camera video, body overlay,
helicopter and gates share that stage; timer, instructions, encouragement and controls
are overlays. The video remains contained so resizing never crops the player's body
or changes recognition coordinates. Portrait and landscape layouts have no page scroll.

The bottom-right fullscreen button enters browser fullscreen when available. In an
embedded browser that denies fullscreen, the game continues filling its window and
explains the limitation. Exit fullscreen or Escape restores the same full-window
layout without restarting an active flight. Escape outside fullscreen still pauses.
Desktop, portrait and landscape geometry, native fullscreen, fallback, camera
continuity and exit controls are covered by browser checks using synthetic inputs.
