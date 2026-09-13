# Shared contracts — v1

Read [index.d.ts](index.d.ts) for exact types and [index.js](index.js) for executable
validators. These interfaces are used by the integrated app, not just future plans.

```text
camera / recorded input
  → pose provider → PoseFrame
  → action recognizer → ActionFrame
  → game consumer → GameSnapshot
                         ↘ EvaluationResult for an explicitly measured experiment
```

| Contract | Producer → consumer | Responsibility |
| --- | --- | --- |
| `PoseFrame` | Pose/model track → action track | Named joints, image dimensions, input time and provenance |
| `ActionFrame` | Action track → game track | Phase, game charge, and explicit completed-action event |
| `GameSnapshot` | Game rules → renderer/test | Health, repetitions, completion status, deduplication state |
| `EvaluationResult` | Evaluation track → experiment report | Evidence type, counts, measured timing, missing values |

## Coordinates and confidence

- v1 is **single-person**, with 12 named joints: left/right shoulder, elbow, wrist,
  hip, knee, ankle. Left/right always means the person's own anatomical side.
- Use upright input images, origin at top left, x rightward, y downward. x/y are
  normalized independently by width/height. Correct aspect ratio before angles.
- Recognition input is **unmirrored**. Mirroring the camera preview is UI-only.
- Omit unknown joints; never substitute `(0,0)`. No detected person is `joints: {}`.
  Out-of-image finite coordinates may be preserved; recognizers reject unusable ones.
- Confidence is `[0,1]` or `null`; null is unknown, not certainty. Model confidence
  scores are not directly comparable. Provider documentation must identify the score.
- Do not put estimated 3D/world coordinates into these 2D fields. That needs a
  separately specified coordinate system, units, and versioned extension.

## Time, identity, and provenance

- `tMs` is the **input** sampling/media time, never inference completion time.
  Camera uses a monotonic sampling clock; replay uses the original media timestamps.
- `seq` and `tMs` increase strictly within one session. Drop duplicate/stale frames.
  Replay seeks/loops, switching models/cameras, or changing players starts a new session.
- `source.kind` is `camera`, `replay`, or `synthetic`; `source.id` is an opaque local
  identifier, never a hardware serial number. All downstream frames preserve it.
- A real recording played back is still `replay`, never a current camera workout.
- Missing detections still produce a frame. No input at all requires a host watchdog.
  Current host: 30s model initialization timeout, 8s stalled-inference timeout.

## Action semantics

- `progress` is game charge in `[0,1]`, not a repetition or whole-cycle percentage.
  It must be zero while missing/calibrating. `calibrationProgress` is separate.
- `cue` is optional-to-understand presentation vocabulary specific to a recognizer.
  A game must not score from a cue, an active phase, or `progress === 1`.
- A full movement produces `phase: completed` and `completion: {id, repIndex}`.
  Re-delivery retains the ID. Recalibration **does not reset** the repetition sequence.
- The recognizer API is `reset(session)`, `recalibrate()`, `update(PoseFrame)`.
  `update` returns `null` for duplicate/stale input. Session/model changes need reset.
- Current baseline action is `squat`. Other stable action IDs belong in experiments
  until their recognition semantics and consumer mapping are agreed.

## Game and evaluation semantics

- Bind the game to one session, source, and action. Ignore foreign, stale, duplicate,
  and already-consumed completion events. Camera and mock scores never mix.
- The baseline pure reducer is `createGameState(...)` + `consumeAction(state, frame)`
  in `packages/game-forest`. The canvas renderer consumes state; it does not recognize poses.
- Evaluation counts/timings without annotations or measurements are `null`, not zero.
  A total-count match does not prove zero missed or false events. Event metrics require
  declared one-to-one matching against annotated completion times and a fixed window.
- Label evidence `synthetic`, `public-fixture`, or `consented-human`. Never compare
  different devices, timing definitions, or datasets as if they were equivalent.

## Evolving the contract

`version: 1` is the wire/data version, independent of npm package versions. Compatible
optional additions keep v1; changed meaning, units, required fields, or phase rules
need a new version and migration agreement with affected owners. Put a short proposal
in `contracts/proposals/`, update types, validators, adapters, and fixtures together.

Run `npm run check:contracts`. The tracked [synthetic fixture](fixtures/squat-session.js)
and [example JSON files](examples/) let teams develop without a camera or model.
