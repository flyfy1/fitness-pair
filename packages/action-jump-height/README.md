# Relative jump height recognizer

An experimental, pure `PoseFrame → ActionFrame` recognizer for Dino Run. It uses
named hips, shoulders, knees and ankles; model index arrays, camera access and
rendering remain outside this package. No frames or landmarks are stored to disk.

```js
import { JumpHeightRecognizer } from '@fitness-pair/action-jump-height';
const recognizer = new JumpHeightRecognizer();
recognizer.reset({ sessionId, source });
const action = recognizer.update(poseFrame); // null for duplicate/stale input
recognizer.recalibrate(); // preserves the session's completion sequence
```

## Calibration and motion

1. Use a fixed, front-facing camera with both shoulders through both ankles in
   frame and room above the head. Stand upright and still for 1.5 seconds.
2. Make one maximum jump, land and remain grounded for 200 ms. Calibration accepts
   at least two airborne samples and a measurable rise, then sets that peak to 100%.
   A jump below the noise floor requests another attempt. An idle attempt expires
   after 15 seconds and returns to standing calibration.
3. In play, dinosaur displacement follows the rise **and fall** of the person's
   relative height. The estimate is the minimum upward displacement of the hip
   midpoint and each ankle, with a 35 ms smoothing time constant. This prevents
   a squat, one raised foot or tucked feet alone from increasing height. Heights
   above the calibrated peak clamp to 100%.

The normal `ActionFrame` fields remain valid, with action `jump-height` and
recognizer ID `jump-height-2d/1`. This compatible experiment adds:

| Field | Meaning |
| --- | --- |
| `stage` | `standing`, `maximum`, or `ready` |
| `calibrated` | True only after an accepted maximum jump |
| `heightRatio` | Current relative rise in `[0,1]`; zero during calibration/loss |
| `peakRise` | Calibrated peak displacement in image-height units, or `null` |
| `quality` | `tracked`, `tracking-lost`, `unstable-stance`, `position-changed`, `insufficient-height`, or `calibration-timeout` |

Cues are `stand-still`, `jump-maximum`, `land-and-hold`,
`jump-higher-and-retry`, `move-back-into-frame`, `rebaseline`, `ready`, and
`jumping`. `calibrationProgress` spans 0–0.5 during standing, then 0.5/0.75
while waiting/jumping. It is null outside calibration. `progress` equals live
`heightRatio`; calibration never charges the game. A confirmed live landing emits
one `completion` with a stable ID. The maximum calibration jump never counts.

## Loss and host responsibilities

Missing, cropped or uncertain required joints immediately zero the output and
abort any in-flight completion. Short gaps retain calibration but remain in the
`missing` phase until a new grounded hold, so the host cannot resume midair.
Gaps over 750 ms, including time without input,
invalidate calibration. Sustained scale/position changes, image dimension changes
and flight longer than 2.5 seconds also require standing calibration again.

The host must pause gameplay on missing tracking or loss of calibration, handle
camera initialization and stalled-input watchdogs, and stop owned camera/model
resources on cancellation. `reset` binds session and source; changing either or
the model requires an explicit reset. Input time, sequence and provenance are
preserved. Recalibration does not reuse completion IDs.

## Evidence and limits

```sh
node --test packages/action-jump-height/tests/*.test.js
```

Tests use labeled **synthetic** named-joint geometry to exercise proportional
heights, rise/fall, calibration retry, loss, drift, identity and grounded rejection.
They do not establish human recognition accuracy. No participant trials or private
recordings are included. Camera perspective, pose noise, clothing, low frame rates,
occlusion, walking in depth and camera movement can affect this estimate. It is
relative image displacement, not centimeters, physical jump height or exercise
assessment. The confidence threshold is a MediaPipe-oriented POC heuristic.
