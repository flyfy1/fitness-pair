# MediaPipe pose provider

Owns the classic model Worker and `fromMediaPipe(...)` adapter to `PoseFrame`.
Raw landmark indices stay here. The host owns permissions, frame scheduling,
cancellation, and Worker lifetime. The host's asset script copies the Worker locally.

Confidence is MediaPipe visibility, not a cross-model calibrated probability.
Missing points are omitted; unknown confidence is null. Preview mirroring must not
alter recognition coordinates. Preserve input timestamps rather than inference time.
The raw Worker message protocol is internal to this provider/host integration.

Run `npm run explore:pose` for adapter checks, and browser tests for actual inference.
Model alternatives belong in `experiments/pose-models/<slug>/`.

## Download and device cache

`prepare-assets.mjs` emits `asset-cache.js` and a manifest containing byte lengths
and SHA-256 hashes for the pinned model, bundle and both WASM variants. Generated
assets remain ignored. Motion Quest and the other hosts use this same preparation.

The worker accepts `preload` as well as `init`. Preload downloads the bundle, model
and the device's selected WASM variant, validates every byte sequence, and stores
complete responses in Cache Storage (`hopmodo-tracking-v1`). It does not construct
a detector or request a camera. `init` consumes the same verified model buffer and
blob-backed WASM, avoiding a second MediaPipe model download. Arcade game aliases
normalize to `/runtime/`. Content hashes version the keys; a changed manifest picks
new bytes. Invalid cached entries are discarded. Origin-wide Web Locks serialize
per-file downloads between supported tabs/workers. Without Web Locks concurrent
contexts can download separately. Interrupted files are never cached; completed
files remain available for retry.

`progress` messages distinguish checking, waiting, downloading, completion and
initialization. `loaded` and `total` count decoded asset bytes (including validated
cache hits), not estimated time or on-wire compressed transfer size. Before the
WASM variant is selected, the total is unknown and the UI is indeterminate. The
manifest is revalidated on each attempt. Network work has a five-minute abort
bound; hosts also bound overall initialization and terminate their workers.

Denied/unavailable storage and quota failures fall back to verified in-memory
bytes for the active worker. Browsers may evict saved responses, and persistence
is not guaranteed. A camera-free preload cannot retain in-memory bytes after its
worker/page closes if storage was denied, so a game may download again. Old
content-addressed entries remain eligible for normal browser eviction. This is
an asset cache, not offline installation: page/code and manifest access are still
required. No camera frames enter this cache.
