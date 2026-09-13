# Hand tracking POC

## MVP card

- Target user: a developer trying local camera hand recognition.
- Job: see whether the camera can locate a palm and all five fingers.
- Riskiest assumption: usable hand landmarks at the user's actual camera distance.
- P1 loop: enable camera, show up to two hands with 21 landmarks each, remove hands,
  then stop and release camera/model resources.
- Success proof: real local model inference on public hand images through the browser
  camera path, visible landmark overlays, missing-hand state, and resource cleanup.
  A live human trial is still required to evaluate motion accuracy.
- No-gos: gestures, games, recordings, uploads, 3D reconstruction, shared contract changes.
- Appetite: one model, one recognition-only page, one bounded validation/review pass.

## Ownership and hypothesis

Owned path: `experiments/pose-models/hand-tracking/` only.
Hypothesis: MediaPipe Hand Landmarker can add finger-level visualization using the
existing local CPU/WASM + classic Worker approach. The baseline body provider exposes
12 body joints, without finger joints. This experiment tests added coverage, not a
speed or accuracy improvement against the body model.

The experiment-local `HandFrame` uses named wrist/finger joints, unmirrored normalized
2D coordinates, input timestamps, sequence, session ID, and camera provenance. It is
not a v1 `PoseFrame`: hand geometry needs a separately reviewed contract before integration.
Left/right and its score are the model's handedness classification; the score is
not per-joint confidence. Palm position is approximated from wrist and finger bases.

## Run

From the repository root, with Node.js 22.12+ and desktop Chrome/Edge:

```sh
npm ci
npm --prefix experiments/pose-models/hand-tracking run dev
```

Open <http://127.0.0.1:5182>. Select **Enable camera**, bring one or two hands into view,
and compare each finger with its colored skeleton. The preview is mirrored; recognition
coordinates remain unmirrored. **Stop camera** also works during permission/model loading.
The page stops when hidden or left. Re-enable it explicitly after returning.

```sh
npm --prefix experiments/pose-models/hand-tracking run build
npm --prefix experiments/pose-models/hand-tracking run test:browser
```

Tests start their own production preview on port 5182 and refuse to reuse another server.
They require installed Google Chrome. Downloaded public test images stay in ignored
`data/`; generated browser results stay in ignored `test-results/`.

## Model and boundaries

- Runtime: existing `@mediapipe/tasks-vision@0.10.32`, CPU/WASM in a classic Worker.
- Model: [Hand Landmarker float16 v1](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task).
- [Official documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js).
- [MediaPipe Apache-2.0 license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE).
- Preparation downloads the model once and verifies its pinned SHA-256. Model assets,
  WASM and runtime code are served from this local site; frames are never uploaded.
- No recording, landmark persistence, audio capture, or background tracking.
- At most two hands; one inference in flight; sampling no faster than once per 60ms.
  UI timing is model-call duration, not end-to-end latency or guaranteed FPS.
- Model initialization: 30s timeout. Camera startup and stalled inference: 8s timeout.
- Hand crossing, occlusion, blur, handedness stability, far-field fingers, phone
  performance and estimated depth are not validated. No stable person/hand identity.

Stop after this recognition loop and its checks. Gesture recognition and body/hand
integration require a separate task. See `EVIDENCE.md` for completed checks and limits.
