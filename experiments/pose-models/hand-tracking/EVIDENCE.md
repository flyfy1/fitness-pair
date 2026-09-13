# Hand tracking POC evidence — 2026-09-13

## Environment and result

- Checkout: task branch `codex/hand-tracking-poc`, independent worktree.
- Apple Silicon macOS, arm64; Node.js 26.7.0; Google Chrome 152.0.7977.83.
- MediaPipe Tasks Vision 0.10.32, Hand Landmarker float16 v1, CPU/WASM Worker.
- Production Vite build passed. All eight browser cases passed across the initial
  run and targeted rerun; the first public-fixture attempt stopped on a network
  timeout downloading `thumb_up.jpg`, before inference. Downloading the same public
  assets into the ignored cache and rerunning that case passed.
- Desktop and 390px layout screenshots were visually inspected. No horizontal
  overflow; colored skeletons align with both hands in the mirrored public fixture.

## Public-fixture evidence

The real local model processed public images through a canvas stream substituted
for the camera. This is public-fixture playback, not a human camera trial. The
production app only accepts camera input; tests explicitly substitute its source.

| Input | Observed behavior |
| --- | --- |
| `thumb_up.jpg` | One hand, 21 finite named joints, visible overlay, inference timing |
| `right_hands.jpg` | Two hands, 42 named joints, two result rows, aligned skeletons |
| Blank canvas after hands | Zero hands, empty results and cleared overlay |
| Stop and restart | Owned tracks ended and Worker terminated; recognition restarted |
| Page exit event | Owned tracks ended and Worker terminated |

Browser requests during recognition stayed on the local origin. Public asset
downloads happened in the test runner before opening the page. No camera frames,
inferred landmarks, model weights or downloaded fixtures were added to Git.

Fixture sources: Google MediaPipe's
[hand landmarker tests](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/python/test/vision/hand_landmarker_test.py),
with images at `https://storage.googleapis.com/mediapipe-assets/`.

SHA-256:

```text
thumb_up.jpg     5d673c081ab13b8a1812269ff57047066f9c33c07db5f4178089e8cb3fdc0291
right_hands.jpg  4b5134daa4cb60465535239535f9f74c2842aba3aa5fd30bf04ef5678f93d87f
hand model      fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1
```

## Synthetic lifecycle checks

Permission denial, cancellation while permission is pending (including a late
stream), cancellation during initialization, initialization timeout, stalled
inference timeout, Worker failure, and page hiding all released owned resources
and left an enabled retry button. Timeout tests advance the browser clock and use
a mock Worker; they are lifecycle evidence, not model performance evidence.

## Limits and decision

The recognition-only POC is ready for local human testing. No claim is made about
live motion accuracy, occlusion recovery, crossed-hand identity, anatomical-side
accuracy, phone performance, full-body camera distances, or depth precision.
Displayed milliseconds measure a single model call, not an end-to-end benchmark.

The body baseline remains unchanged. This experiment adds hand/finger coverage,
with no speed or accuracy comparison claimed. Keep it independent until human
testing justifies a shared hand contract or a gesture interaction.
