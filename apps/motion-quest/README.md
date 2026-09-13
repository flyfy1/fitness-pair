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

Only video permission is requested. The standalone game does not record or upload
camera data. Hopmodo’s arcade host creates local replays as described below. Model, WASM, and code load from this site. Inference
runs with CPU/WASM (XNNPACK) in a classic Worker compatible with the unmodified
MediaPipe loader. Initialization is bounded to 330 seconds, including a five-minute download bound; a
loading reminder appears after 20 seconds, measured download progress is shown, and cancellation remains available; stalled inference stops
after 8 seconds. One frame at a time is processed, scheduled at most about 16 times
per second; actual performance depends on the device.

Stopping, hiding/leaving the page, errors, and victory stop media tracks and terminate
the Worker. The standalone waiting page has no loaded model. The arcade homepage can preload tracking files without a camera or detector. A remote camera page needs HTTPS;
ordinary LAN HTTP is insufficient. No public deployment or long-lived service is
configured here.

## Tests and limits

Use the root test/build commands. Browser checks distinguish real model inference
on a public image from synthetic landmarks and button preview. Live movement accuracy,
viewpoint robustness, phone performance, exercise quality, and calorie expenditure
have not been validated. The next experiment is human playtesting.

## Assets

`scripts/prepare-assets.mjs` delegates to the shared asset preparation, copies the provider
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

## Camera AR presentation

The camera now fills the entire browser viewport. The mirrored video uses centered
`object-fit: cover`; the transparent game layer adds a guardian, summoning ring,
body-linked charge and magic projectiles. There is no opaque forest or separate
camera preview. Compact controls and round statistics float over the live scene.
The skeleton and magic use the same cover crop; only presentation is mirrored,
while recognition continues to receive the original named coordinates.

### MVP card

- Target user: one player using their camera as the game screen.
- Job: see themselves charge and attack the guardian with five squats.
- Riskiest assumption: the full-viewport camera and floating controls leave enough
  movement visible for understandable feedback, especially on narrow screens.
- Loop: enable camera → stand to calibrate → squat to charge → stand to attack →
  five hits → victory with camera/worker released → retry.
- Proof: cover/mirror projection tests, public-image local inference, synthetic
  full detector-to-victory flow, desktop/portrait/landscape browser checks.
- No-gos: room scanning, WebXR world anchors, depth/occlusion, recordings, uploads,
  new recognition semantics or multiplayer.
- Appetite: one camera-overlay AR loop using the current model and game rules.

This is camera-overlay AR with a screen-positioned guardian, not world-tracked AR.
The charge ring follows the latest confident torso position; attacks retain their
launch position. The video may crop its edges to fill a differently shaped window.
Keep shoulders through ankles near the center and move farther back when needed.
The unrecorded live camera stops on victory, cancellation, failure or leaving the
page; the result screen uses a neutral background. Preview mode uses a neutral
background and explicitly synthetic controls, without activating a camera.

Verification for this change: 17 app/shared checks and 7 production Chrome checks
passed. Browser checks include public-image local inference with no external
requests, full-viewport transparent layers at 1440×1080 and 390×844, a 844×390
landscape control check, synthetic five-repetition victory, permission denial,
late-permission cancellation and resource cleanup. Screenshots use only the
public fixture or synthetic preview. These checks do not establish human movement
accuracy or whether the floating controls obscure a particular player's stance.

Run `npm run test --workspace @fitness-pair/motion-quest` and, after building,
`CI=1 PREVIEW=1 npm run test:browser`. Browser checks now start an isolated server
on port 5179 (override with `MOTION_PORT`) and never reuse another checkout's
preview. The interactive game remains on port 5178.

### Status cues for standing away from the screen

The camera AR HUD now puts the immediate action in large centered text, following
Dino AR's separation of phase, action cue and detailed help. Desktop headlines
scale to 112px (108px at 1440px width); portrait headlines remain at least 44px.
High-contrast shadows preserve legibility over the live camera, while the compact
controls keep longer explanations. The headline is pointer-transparent and
moves into the free right-hand area on short landscape screens.

Live cues include `Stand tall`, `Hold still`, `Squat down`, `Keep lowering`,
`Stand to attack`, `Hit! N / 5`, and `Step into view`. Calibration/charge percentages
and hit counts appear beneath the headline. Permission errors and the final result
also use the large presentation. Preview commands are explicitly marked simulated.
A single polite live region announces headline changes; repeated inference frames
do not rewrite the same announcement. Recognition thresholds and game rules stay
unchanged. Browser checks exercise phase transitions, missing tracking, hits,
victory and desktop/portrait text size. Actual distance readability needs a player
trial with their screen and camera placement.


## Arcade replay integration

When embedded in Hopmodo, the arcade host automatically composites and stores a local replay after standing calibration first reaches ready, before the first squat. Initial permission, model loading and calibration are excluded. A read-only `window.motionQuest.getReplayState()` and synchronous `motionquest:replay-state` event expose the round and presentation phase without changing scoring contracts. The final repetition stops the camera and worker immediately; the renderer finishes its 1.8-second projectile/impact/victory sequence before signaling completion. The recorder holds the last valid camera image during this sequence and then adds its branded ending. Synthesized game audio is included when available, with no microphone permission; muting game sound also mutes its replay bus. The standalone game does not create recordings. The host shows a notice before play; enabled camera imagery stays device-local until the player chooses to share. A round identifier lets replays distinguish a restart from pause/resume without changing movement-event semantics.

## Arcade soundtrack

Motion Quest now uses a 136–156 BPM electronic backing beat during calibrated
gameplay, with kick, snare, bass and a rising melody as the squat charges. Full
charge plays a bright cue; firing adds a sweeping rush, and impact lands with a
bass hit at 460 ms. Each hit earns alternating spoken encouragement, with a
victory fanfare and closing praise after the fifth hit. The speech reuses the
local generated WAV assets from Push-up Flight; no audio service is contacted.
Music lowers underneath speech. Game sound toggles every layer, and cancellation,
backgrounding and page exit stop scheduled sound. Setup has no backing music.
The same mixed game audio feeds local replays, without microphone access.
