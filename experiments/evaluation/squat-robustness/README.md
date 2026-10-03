# Squat robustness regression

Run `npm run evaluate:squat` from the repository root. The command outputs validated
`EvaluationResult` records and fails if any case has false or missed completions.
Root `npm test` runs the same matrix and checks geometry fallback, calibration
stability, completion identity and matching rules.

## Evidence and scoring

All ten fixtures are authored named-joint geometry, with `source: synthetic` and
model ID `authored-squat-geometry/2`. No camera, trained-model inference, human
landmarks or participant recordings are used. Each case includes the complete
standing-calibration prefix and retains input sequence, session and timestamps.

Labels mark the first input frame returning to the intended standing position.
Each label matches at most one completion in `[label, label + 650ms]`, in temporal
order. Early or unmatched events are false completions; unmatched labels are
missed completions. Event delay is measured against input timestamps, reported as
`synthetic_event_delay_ms`, and is null when no event matches. This is neither
inference speed nor end-to-end camera latency. The output identifies the Node
runtime, platform, architecture and recognizer version.

## Cases and comparison

| Case | Expected completions | Purpose |
| --- | ---: | --- |
| Valid 16, 10 and 6 FPS | 3 each | Temporal holds at different input intervals |
| Joint jitter | 3 | Small coordinate noise does not add or lose completions |
| Short occlusion | 1 | A short loss freezes confirmation |
| Long occlusion | 1 | A lost partial action is discarded; a fresh cycle works |
| Collapsed knee joints | 0 | Confident but unusable geometry cannot charge |
| Small standing shift | 1 | Recover a position outside the standing threshold |
| Repositioned standing | 1 | Recover a larger position change |
| Airborne return | 1 | Straight knees above the baseline cannot complete early |

The same ten fixtures were compared once against the recognizer at commit
`fce33be834fb` and version 2:

| Recognizer | False completions | Missed completions |
| --- | ---: | ---: |
| `squat-2d-hysteresis/1` | 2 | 3 |
| `squat-2d-hysteresis/2` | 0 | 0 |

The fixes reject collapsed segments, require a return within the standing band,
and recover a stable upright baseline after repositioning. Recovery discards a
partial cycle without reusing completed event IDs. Browser regression also drives
the recognizer through the actual Motion Quest host, start gate, five attacks,
local replay and camera/worker cleanup using synthetic Worker output.

## Limits and next evidence

This small deterministic matrix is a correctness regression, not a representative
motion dataset or a measurement of real-world accuracy. It does not establish
robustness across body proportions, mobility, clothing, lighting, camera viewpoints,
phones or exercise form. A long upright displacement deliberately cancels an
unfinished cycle. Meaningful human accuracy comparisons need consented trials
with event-level ground truth and separate reporting from these synthetic results.
