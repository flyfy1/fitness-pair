# Push-up Flight — head-following video AR

This isolated experiment now follows the player's head directly during push-up
play. The existing folder and port are retained so the local link keeps working.
The earlier plank-hold/full-body geometry gate has been removed.

## MVP card

- **Player / job:** one person doing push-ups with only their head and shoulder(s)
  visible, controlling a helicopter at their own pace.
- **Loop:** enable camera → show head and either shoulder for 0.8 seconds → automatic
  takeoff → lower/push up to move the helicopter with the head → avoid gates →
  collision or Finish & rest → tumbling animation and encouragement → retry.
- **Riskiest assumption:** the existing Lite pose model continues to find a nose or
  ear and one shoulder during a real person's close-up push-ups.
- **Proof:** synthetic head-and-one-shoulder fixtures, production-browser camera
  integration, camera/video projection checks, and separate public-image inference.
- **Boundary:** one player, local video AR, no recording or uploads, no new dependency,
  no push-up repetition count, exercise-quality assessment, or health outcome claims.
- **Stop:** one runnable loop. Human recognition stability and emotional effect still
  require live non-recorded playtesting; no additional levels or scoring platform.

## Run

Install the repository's existing dependencies with `npm ci`, then:

```sh
cd experiments/gameplay/plank-flight
npm run dev
```

Open <http://127.0.0.1:5184> in a recent Chrome on localhost or HTTPS. Set the camera
where your head and at least one shoulder are visible during push-ups. Hips, knees,
ankles and wrists are not required. The game starts automatically after 0.8 seconds
of continuous reliable head/shoulder detection; no extra gesture, plank hold, or
standing calibration is required. Moving during this countdown does not reset it.

Your helicopter's cockpit is anchored to your head in the mirrored video. Moving
lower makes it descend; pushing up makes it rise; sideways movement follows too.
Staying still leaves the helicopter in place instead of adding lift. The entire
video remains visible, including its letterboxing; viewport rotation/resizing and
fullscreen use the same projection for the overlay and collisions.

The timer shows **flight time**, not detected exercise time. Gates are game obstacles,
not repetition events. Head tracking can also respond to seated or standing motion;
this is intentional game control, not verification that a push-up happened.

**Finish & rest** stops the owned camera/worker immediately and plays the 1.6-second
crash/encouragement sequence. Gate collisions play that sequence and release the
camera when it finishes. Before takeoff, **Stop camera** simply cancels setup.
The separate **Try a demo** mode follows pointer/touch position or arrow keys and
is labeled synthetic. Demo input cannot override a camera session.

## Pipeline and ownership

All changes belong to `experiments/gameplay/plank-flight/`. The shared v1 contracts
and other games are unchanged. The pipeline remains:

```text
local model → PoseFrame + optional head → ActionFrame + headControl → GameSnapshot → renderer
```

- `src/pose-provider.js`: existing MediaPipe named-body adapter plus an experimental
  `head: {x, y, confidence, sizePx}` extension. It prefers the nose, falls back to
  visible ears, and sizes the local crop from head/shoulder geometry. No hips or legs
  are used. Raw model indices stay here.
- `src/recognizer.js`: `HeadFlightController` accepts a visible head and either
  shoulder with confidence ≥ 0.6. It emits the experimental `head-flight` action,
  preserving timestamps, session, sequence and provenance. A gap over 250 ms resets
  the takeoff timer. Missing head/shoulder input explains what is needed.
- `headControl: {x, y, image: {width, height}} | null` is an experiment-only optional
  ActionFrame extension in unmirrored, normalized image coordinates. Calibration
  may position the helicopter but has zero progress and never earns flight time.
  Completion remains null: there are no fabricated push-up events or rep scores.
- `src/projection.js`: one mirrored, aspect-preserving contain projection. The engine
  derives viewport position and collision geometry from this projection; the renderer
  anchors the cockpit there. Recognition coordinates are never mirrored.
- `src/engine.js`: rejects stale, foreign or invalid head input, advances flight time
  only on fresh active control, and handles gates, collisions and crash completion.
- `src/camera.js`: existing Dino camera lifecycle copied into this experiment, with
  bounded initialization and inference, cancellation and owned-resource cleanup.
- `src/main.js`: UI, head crop, automatic start, pointer-only demo, pause and retry.
  The legacy read-only `window.plankFlight.getState()` handle remains for existing
  diagnostics; it exposes projected game position, not raw landmarks or camera pixels.

## Tracking and privacy

The initial model download uses the baseline's pinned SHA-256. Model/runtime files
are ignored and processed locally. The optional head crop stays in memory and is
cleared on stop, failure or completion. No camera pixels or participant recordings
are saved, uploaded, or committed.

Model initialization is bounded at 30 seconds, stalled inference at 1 second.
Camera frames older than 250 ms cannot start/control a round. Missing head/shoulder
tracking during a flight, window blur, hidden tab or camera failure pauses and releases
resources; this is not interpreted as fatigue or workout failure. Starting again
creates a fresh session. Late-arriving permission streams are stopped after cancellation.

## Full-window play

The game fills the current window. Video, body overlay, helicopter and gates share
one stage; the timer, instructions and controls are overlays. Portrait and landscape
layouts have no page scroll. The bottom-right button enters browser fullscreen when
available. Embedded browsers that reject fullscreen keep the full-window layout.
Exit fullscreen or Escape restores that same layout without restarting the flight;
Escape outside fullscreen pauses. Camera permission and background-tab policies still apply.

## Verification

From this experiment folder:

```sh
npm test
npm run build
npm run test:browser
```

Browser tests use production preview port 5185 and installed Chrome. The live developer
preview stays on 5184. Generated screenshots, runtime files and model weights are ignored.

2026-09-13 updated evidence:

- Seven synthetic unit checks: close-up automatic takeoff, missing/low-confidence
  input, stale and foreign frames, down/up/sideways following, no hold-based lift,
  aspect/mirror projection, collision/finalization and head extraction without hips.
- Browser checks: one synthetic shoulder and nose start the camera round; head
  positions map within one CSS pixel through descent/ascent, sideways movement,
  portrait/landscape and fullscreen; collision, encouragement, retry, pointer demo,
  permission denial, late cancellation, tracking loss and resource cleanup.
- Separate real local inference on a public static image checks head output, automatic
  takeoff and no external runtime requests. It does not establish push-up accuracy.
- The user's observed shoulder/head-only framing exposed the old full-body startup
  gate. No participant video or landmarks were collected or stored for this change.

Human close-up push-up tracking and enjoyment remain unverified. The official model's
head indices are documented in the
[MediaPipe landmark definitions](https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/vision/PoseLandmark).
