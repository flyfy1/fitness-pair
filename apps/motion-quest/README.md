# Motion Quest

The integrated single-player baseline: stand to calibrate, squat to charge, stand
to attack, and complete five repetitions to defeat the forest guardian.

From the repository root run `npm ci` and `npm run dev`, then open
<http://127.0.0.1:5178>. Use a recent desktop Chrome/Edge browser. Keep shoulders
through ankles visible and turn slightly sideways; stand upright for about two
seconds to calibrate. In preview mode, hold the button or Space for 0.65 seconds,
then release. Preview input is synthetic, not evidence of real recognition.

## Ownership

The host owns camera permissions, scheduling, timeouts, cancellation, UI, and audio.
The shared pose provider owns model execution and adapts raw output to named joints.
The action recognizer consumes PoseFrame and emits ActionFrame. The game reducer
consumes completion events with deduplication; the canvas renderer is separate.
Both real and preview paths use the same game rules.

## Local data and lifecycle

Only video permission is requested. No audio capture, recording, persisted camera
data, or upload is implemented. Model, WASM, and code load from this site. Inference
runs with CPU/WASM (XNNPACK) in a classic Worker compatible with the unmodified
MediaPipe loader. Initialization is bounded to 30 seconds; stalled inference stops
after 8 seconds. One frame at a time is processed, scheduled at most about 16 times
per second; actual performance depends on the device.

Stopping, hiding/leaving the page, errors, and victory stop media tracks and terminate
the Worker. The waiting page has no loaded model. A remote camera page needs HTTPS;
ordinary LAN HTTP is insufficient. No public deployment or long-lived service is
configured here.

## Tests and limits

Use the root test/build commands. Browser checks distinguish real model inference
on a public image from synthetic landmarks and button preview. Live movement accuracy,
viewpoint robustness, phone performance, exercise quality, and calorie expenditure
have not been validated. The next experiment is human playtesting.

## Assets

`scripts/prepare-assets.mjs` resolves workspace dependencies, copies the provider
Worker and WASM files, and downloads the official Lite model once. Downloads have
60-second timeouts and a pinned SHA-256 check. Rebuild after editing the classic
Worker. Dependencies and generated assets are ignored by Git.

- Runtime: `@mediapipe/tasks-vision@0.10.32`
- [Web documentation](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Lite float16 v1 model](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task)
- SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`
- [GHUM model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf)
- [MediaPipe Apache-2.0 license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE)

See [research notes](../../docs/research.md) for alternatives and evidence boundaries.
