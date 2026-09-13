# Action recognition track

**Hypothesis:** a temporal rule or classifier can reduce a specified false-completion or missed-completion pattern relative to `packages/action-squat/` without changing the pose or game contracts.

Run `npm run explore:actions` from the repository root. Claim `experiments/action-recognition/<experiment-slug>/`. Consume `PoseFrame` and emit `ActionFrame`; use [the shared types](../../contracts/index.d.ts) rather than model-specific arrays.

**Deliverables:** a recognizer adapter, annotated or synthetic contract fixtures, comparison results, calibration assumptions, and explicit failure examples. Include incomplete movement, tracking loss, duplicate/stale input, and recalibration. Keep private landmark sequences under ignored `data/`, generated output under ignored `runs/`, and any downloaded weights under ignored `models/`.

**Acceptance:** only complete cycles emit completion IDs; IDs remain unique across recalibration within a session; missing tracking does not score; progress is not completion. Report event-level false and missed completions only when annotations permit them, with the matching window. Separate measured human evidence from synthetic invariant checks.

**Stop:** evaluate one proposed change against the baseline on the same fixtures and perform one review pass. Integrate only if the claimed improvement is supported and regressions are accounted for; otherwise document the result and stop.
