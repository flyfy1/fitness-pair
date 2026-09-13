# Pose model track

**Hypothesis:** a candidate local model or runtime can improve a declared latency, coverage, or deployment constraint relative to `packages/pose-mediapipe/` while preserving the `PoseFrame` contract.

Run `npm run explore:pose` from the repository root. Claim `experiments/pose-models/<experiment-slug>/`; keep model loading and landmark-index conversion inside this directory until integration review.

**Deliverables:** a named-joint adapter, reproducible device/runtime configuration, model source and license reference, and a comparison against the baseline on the same input. Record initialization time, inference timing, missing joints, and failures separately. Keep downloaded weights in ignored `models/` and private inputs/results in ignored `data/` or `runs/`.

**Acceptance:** contract-valid frames preserve input time and provenance; missing joints are explicit; coordinates remain unmirrored. The comparison includes successful and failed cases, resource cleanup, and a stated device. Claim an improvement only on the measured dimension; replay or synthetic evidence cannot prove live-camera reliability.

**Stop:** complete one candidate-versus-baseline comparison and one review pass. Recommend integrate, retain for later, or reject with reasons; do not add more models without a concrete unanswered question.
