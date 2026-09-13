# Evaluation track

**Hypothesis:** a reproducible fixture and scoring protocol can distinguish the declared behavior of two implementations without mixing synthetic correctness, replay performance, and human usability evidence.

Run `npm run explore:evaluation` from the repository root. Claim `experiments/evaluation/<experiment-slug>/`. Produce `EvaluationResult` as defined in [contracts/index.d.ts](../../contracts/index.d.ts); consume existing contract frames rather than changing a model or game.

**Deliverables:** fixture provenance, annotation/scoring rules, an executable comparison, environment details, and a sanitized result summary. Define one-to-one event matching and its time window before counting false or missed completions. Keep authorized private recordings or landmarks in ignored `data/`, generated results in ignored `runs/`, and downloaded weights in ignored `models/`.

**Acceptance:** results validate against the shared schema and identify model, recognizer, device, fixture, and evidence category. Unknown counts and unavailable timings are `null`. Report inference time, event delay, and synthetic delay under their distinct metric names; do not present any of them as another. Repeated execution on the same deterministic fixture yields the same event counts. Public-fixture use includes a source and redistribution check.

**Stop:** validate the protocol on one known-success and one known-failure case, compare the selected implementations once, and complete one review pass. Report inconclusive results honestly; collect further human data only for a specific unresolved question and with recording consent where applicable.
