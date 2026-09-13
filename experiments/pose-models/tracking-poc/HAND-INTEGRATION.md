# Hand recognition consolidation — 2026-09-13

## Result

The standalone hand POC's recognition visualization now belongs to Tracking Lab's
Hands mode. It uses the lab's existing camera session, MediaPipe Worker, verified
model assets, and `adaptResult` hand envelope. There is no second camera loop,
model loader or shared contract extension. The hand-specific renderer accepts only
named joints. Full-body and upper-body tracking continue through the body provider.

The unified page adds colored finger skeletons, a white palm outline, an estimated
palm-center ring, and per-hand side labels, visible-point counts and side scores.
The lab's pre-existing index-finger cursor and experimental movement cues remain.
Switching modes or losing hands clears the hand result rows. Hand array order and
left/right classifications are not persistent hand identities.

Use `experiments/pose-models/tracking-poc/` for subsequent tracking work. The earlier
`codex/hand-tracking-poc` branch is a historical standalone snapshot, not a second
integration target. Its generated local assets have been preserved outside source.

## Verification

Verified in an isolated worktree based on current `main`, Apple Silicon macOS,
Node.js 26.7.0, installed Chrome 152.0.7977.83, CPU/WASM:

```sh
npm --prefix experiments/pose-models/tracking-poc test
npm --prefix experiments/pose-models/tracking-poc run build
TRACKING_PORT=5187 npm --prefix experiments/pose-models/tracking-poc run test:browser
```

- Four unit tests passed: existing adapters/pinch geometry, plus palm center using
  named unmirrored joints and rejecting incomplete/unusable palm geometry.
- Production build passed; all twelve browser cases passed against that build.
- Actual model inference on public fixtures: `right_hands.jpg` → 42/42 points;
  `thumb_up.jpg` → 21/21; `pose.jpg` → 12/12 body points; top 58% crop → 6/6 upper points.
- Blank input cleared hand details and detection state. Mode switching, restart
  and page exit released owned camera tracks and Workers.
- Synthetic lifecycle checks covered late permission after cancellation,
  cancellation during initialization, initialization timeout, inference stall,
  Worker failure, and page hiding. Permission denial left a usable retry path.
- Browser inference requested only local-origin assets. Desktop and 390px narrow
  screenshots were inspected, including the hand overlays and details.
- Port 5187 isolated these checks from another task's existing port 5186 server.

Public fixtures came from `https://storage.googleapis.com/mediapipe-assets/` and
remain in ignored `.cache/`. Their injection at the camera boundary is fixture
playback, not a live human camera trial. Screenshots remain in ignored test output.

## Limits

This proves integration and public-fixture recognition, not human movement accuracy,
far-field finger recognition, side-label stability, occlusion recovery, phone
performance, or gesture suitability. No participant recording was collected.
No game scoring or new gesture recognition is included in this consolidation.
