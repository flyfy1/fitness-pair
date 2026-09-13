# Tracking POC

## MVP card

- Target user: a developer trying local camera controls before game integration.
- Job: see hands, full body, or upper body follow movement in a browser.
- Riskiest assumption: the existing local MediaPipe runtime provides usable tracking at a desk as well as standing farther away.
- P1 loop: choose mode → enable camera → inspect named landmarks and timing → switch mode → stop.
- Success proof: actual model inference on declared public fixtures, browser lifecycle checks, then an unrecorded live trial by the user.
- No-gos: uploads, recordings, health claims, game scoring, shared contract changes, persistent person identity.
- Stop condition: three modes run in one isolated observation page; report remaining recognition limits.
- Owned paths: only `experiments/pose-models/tracking-poc/`.

## Run

From an installed Fitness Pair checkout:

```sh
cd experiments/pose-models/tracking-poc
npm run dev
# http://127.0.0.1:5186
npm test
npm run build
npm run test:browser
```

Reuses the repository's pinned MediaPipe 0.10.32, Vite, Playwright, CPU/WASM
classic-worker approach, Pose Lite model, and `fromMediaPipe` named-joint adapter.
No new library is required. Asset preparation copies the installed runtime and
downloads official model files with checksum validation; all generated assets are ignored.
The first preparation needs internet. Browser inference and assets are same-origin.

The isolated `codex/tracking-poc` branch is based on the repository baseline. Its
changes contain only this experiment, ready for the user's later combined merge.
No other agent's files are included. Browser tests use installed Google Chrome.

## What the modes mean

- **Hands:** up to two hands, 21 named points each. A live index-finger cursor and
  thumb–index distance relative to palm width make motion visible. The pinch cue is
  an experimental geometric threshold, not a trained gesture classifier.
- **Full body:** the existing 12-joint `PoseFrame` covering shoulders through ankles.
- **Upper body:** the same Pose Lite model and valid `PoseFrame`, filtered for six
  shoulder/elbow/wrist joints. Legs are not required by the UI. This is not a new
  upper-body model or a claim that cropped-body detection is reliable.

Body output preserves v1 session, time, source, and unmirrored coordinate semantics.
Hands use an experiment-local envelope with named joints, unknown per-joint confidence,
and a separate model handedness label/score. It is not a shared `PoseFrame` extension.
Hand array positions and model side labels are not stable identity across crossings.
Mirroring changes only the preview. No body/hand simultaneous mode is included.

## Privacy and lifecycle

Explicit start requests video only. No storage, recording, upload, or audio capture.
Stop, mode switch, hidden page, page exit, disconnected tracks, initialization failure,
and stalled inference release owned tracks and terminate the model worker. Switching
mode stops the old session; start again when ready. Late camera grants are also released.
Model/camera startup is bounded to 30 seconds and stalled input/inference to 8 seconds.
One frame is in flight, capped around 15 Hz. Displayed milliseconds measure inference,
not camera-to-screen latency. Use localhost or HTTPS in a recent Chrome/Edge browser.

## Sources and baseline

- Existing repository: `docs/research.md`, `packages/pose-mediapipe/`, and
  `apps/motion-quest/` lifecycle and asset preparation.
- [Official hand Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).
- [Official pose Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js).
- [Hand model](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task).
- [Pose Lite model](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task).
- [MediaPipe Apache-2.0 license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE).

## Evidence

Verified on 2026-09-13, Apple Silicon macOS, installed desktop Chrome, CPU/WASM:

- Three synthetic adapter tests pass: shared body contract, source/time preservation,
  named hand joints with unknown confidence, and aspect-correct pinch geometry.
- The existing 15 repository tests pass; the experiment production build passes.
- Seven browser tests pass: desktop/narrow controls, denied permission, real model
  inference in all three modes, loss of detection on blank input, stop, mode switch,
  restart/page exit, late camera grant, and an 8-second stalled-worker watchdog.
- Public-fixture replay: `right_hands.jpg` → 42/42 hand points; `pose.jpg` → 12/12
  body joints; the top 58% of that pose image → 6/6 upper-body joints. Single displayed
  inference samples were 34/26/20 ms respectively, not a statistical benchmark.
- Browser requests stayed on localhost; all owned tracks/workers were released.
- Visual checks covered 1360px desktop and 390px narrow layouts and skeleton overlay.

Fixtures are fetched from `https://storage.googleapis.com/mediapipe-assets/` into
ignored `.cache/`; screenshots remain in ignored `test-results/`. Tests inject public
images at the camera boundary, so the app's camera badge is not evidence of a human
trial. A missing bundled Playwright browser was resolved by using installed Chrome.

Decision: retain as an isolated integration candidate using the already selected
model family. Upper-body cropping worked for one public image; seated users, changing
lighting, hands crossing, fast movement, occlusions, and pinch threshold stability
remain unvalidated. No human trial or private recording was collected. Try the three
modes live without recording before adopting gesture thresholds for game scoring.
