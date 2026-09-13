# Shared tracking cache verification — 2026-09-13

Evidence is automated local Chrome testing, using generated blank camera input
and the existing public MediaPipe pose image. No participant footage was used.

- Cold homepage: zero camera requests, four content-addressed asset requests:
  bundle, pinned 5,777,746-byte model, selected SIMD loader and WASM. The selected
  set totals 17,573,503 decoded bytes. Progress comes from response stream chunks
  and manifest byte lengths, with no estimated percentages.
- All five mounted game workers initialize from that saved set with zero further
  asset downloads. Motion Quest additionally runs actual inference through its
  native UI, stops the generated camera and releases its worker.
- Warm homepage navigation and a new tab after closing the old tab perform zero
  content-addressed asset requests. The manifest and small worker/helper scripts
  can still be requested. This is Cache Storage reuse, not a claim of zero network.
- Two simultaneous homepage tabs make only four asset requests in total, using
  origin-wide Web Locks. No service worker or new dependency was added.
- Denied Cache Storage still permits the actual model to initialize; the homepage
  explicitly says that game starts may download again. Unit checks also cover
  quota rejection, corrupt/missing cached responses, changed content versions,
  corrupt downloads, explicit cancellation and the bounded download timeout.
- A held model request plus a simulated 25-second page clock shows the slow
  connection explanation, measured progress and a working Cancel download action.
  The playground stays interactive and Retry download completes successfully.
  This is an injected stalled-network test, not a measured mobile-network trial.
- Motion Quest loading tests cover a 45-second delay, readiness, the 330-second
  overall cap, resource release, ignored late readiness, and determinate versus
  indeterminate progress. The asset loader has its own 300-second download bound.
- Desktop 1440×1000 and mobile 390×844 homepage screenshots were inspected;
  download information fits and the native full-window Motion Quest shell passes.
  The Impeccable detector found only existing font/charge-animation warnings;
  accepted branding and the existing gameplay styling were preserved.

Commands: `npm test` (60 passed), `node --test apps/dino-run/tests/camera.test.js`
(9 passed), `npm run build`, arcade Playwright cache/shell checks (5 passed), and
Motion Quest production-browser tests. Integration repeats relevant checks on the
latest main in a clean worktree; the coordinating task reports final results.

Limits: device storage may be denied, quota-limited or evicted. Without Web Locks,
concurrent contexts can download separately. Browsers still need page/code and
manifest access. Public hosting is deployed and verified by the parent task.
Human recognition accuracy, slow physical devices and real-world connection
performance remain unverified.
