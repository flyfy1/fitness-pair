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
