# Relative jump height recognizer

An experimental, pure `PoseFrame → ActionFrame` recognizer for Dino Run. It uses
named hips and shoulders, plus knees and ankles when visible; model index arrays,
camera access and rendering remain outside this package. No frames or landmarks are stored to disk.

```js
import { JumpHeightRecognizer } from '@fitness-pair/action-jump-height';
const recognizer = new JumpHeightRecognizer();
recognizer.reset({ sessionId, source });
const action = recognizer.update(poseFrame); // null for duplicate/stale input
recognizer.recalibrate(); // preserves the session's completion sequence
```

## Calibration and motion

The AR experiment opts into `new JumpHeightRecognizer({ quickStart: true })`:
capture 250 ms of stable standing, then accept a coherent upward movement above
max(0.012 image height, 0.035 torso length), observed over at least two samples and
60 ms. It emits a calibrated active frame while airborne; no maximum jump,
landing confirmation or host countdown is required. The game scale is half the
standing torso length (minimum 0.04 image height), not the player's personal
maximum. The initial lift emits no completion; its eventual valid landing may
emit one. Existing loss, drift, source/session and completion-ID guards still
apply. Upper-body movement is still a proxy, not confirmed physical takeoff.
The AR host also selects `preferUpperBody: true` so leg confidence cannot block
entry. Quick torso mode ignores projected shoulder/hip-width jitter when holding
the reference and tracking, while torso length, vertical stability, upright pose,
confidence and sideways-position guards remain active. The default and
manual-maximum modes below remain unchanged.

1. Use a fixed, front-facing camera with room above the head. Keep both shoulders
   and both hips visible at minimum. Full-body tracking is preferred when knees
   and ankles are also visible; otherwise upper-body tracking is selected. Stand
   upright and still for 1.5 seconds. The selected mode locks once the standing
   baseline is established.
2. Make one maximum jump, land and remain grounded for 200 ms. Calibration accepts
   at least two elevated samples and a measurable rise, then sets that peak to 100%.
   A jump below the noise floor requests another attempt. An idle attempt expires
   after 15 seconds and returns to standing calibration.
3. In play, dinosaur displacement follows the rise **and fall** of the person's
   relative height, with a 35 ms smoothing time constant. Full-body mode uses the
   minimum upward displacement of the hip midpoint and each ankle. This prevents
   a squat, one raised foot or tucked feet alone from increasing height. Upper-body
   mode uses the minimum rise of the shoulder and hip midpoints, with torso-length,
   shoulder-width, hip-width and lateral-position guards. A shoulder shrug alone
   cannot increase height. Heights above the calibrated peak clamp to 100%.

Upper-body tracking estimates **relative torso movement**, not verified takeoff or
physical jump height: feet are unseen, and a coherent torso rise (including rising
onto toes) can control the game. A return to the standing reference is treated as
the end of a motion cycle. It cannot distinguish every bend, depth movement or
camera movement from a jump. Keep the camera fixed and use the same position and
framing during calibration and play.

The normal `ActionFrame` fields remain valid, with action `jump-height` and
recognizer ID `jump-height-2d/1`. This compatible experiment adds:

| Field | Meaning |
| --- | --- |
| `trackingMode` | `full-body`, `upper-body`, or `null` before usable geometry |
| `stage` | `standing`, `maximum`, or `ready` |
| `calibrated` | True only after an accepted maximum jump |
| `heightRatio` | Current relative rise in `[0,1]`; zero during calibration/loss |
| `peakRise` | Calibrated peak displacement in image-height units, or `null` |
| `quality` | `tracked`, `tracking-lost`, `unstable-stance`, `position-changed`, `insufficient-height`, or `calibration-timeout` |

Cues are `stand-still`, `jump-maximum`, `land-and-hold`,
`jump-higher-and-retry`, `move-back-into-frame`, `rebaseline`, `ready`, and
`jumping`. `calibrationProgress` spans 0–0.5 during standing, then 0.5/0.75
while waiting/jumping. It is null outside calibration. `progress` equals live
`heightRatio`; calibration never charges the game. A confirmed return to baseline
after a live rise emits one `completion` with a stable ID. In upper-body mode this
is a torso cycle, not evidence of feet landing. The maximum calibration never counts.

## Loss and host responsibilities

Missing, cropped or uncertain required joints immediately zero the output and
abort any in-flight completion. Short gaps retain calibration but remain in the
`missing` phase until a new baseline hold, so the host cannot resume mid-motion.
If full-body tracking loses knees/ankles while the visible torso is stable for
750 ms, it switches to upper-body and requires **new standing and maximum
calibration**. The old peak is never reused. An already calibrated upper-body
mode does not switch merely because the legs reappear. Explicit recalibration
automatically chooses from the currently usable geometry again.

Gaps over 750 ms, including time without input, invalidate calibration. A moving
torso cannot bypass the stable hold needed for automatic full-to-upper fallback.
Sustained scale/position changes, image dimension changes and elevation longer
than 2.5 seconds also require standing calibration again. Missing or uncertain
shoulders/hips stop tracking in both modes; no hidden joints are invented.

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
heights, rise/fall, calibration retry, loss, drift, identity, grounded rejection,
upper-body framing, mode locking and automatic fallback without phantom completion.
They do not establish human recognition accuracy. No participant trials or private
recordings are included. Camera perspective, pose noise, clothing, low frame rates,
occlusion, walking in depth and camera movement can affect this estimate. It is
relative image displacement, not centimeters, physical jump height or exercise
assessment. The confidence threshold is a MediaPipe-oriented POC heuristic.

## Explicit maximum confirmation (Dino host)

`new JumpHeightRecognizer({ manualMaximum: true, preferUpperBody: true })` keeps the
existing default API available while opting into torso tracking and manual acceptance.
`measuredRise` exposes the largest candidate rise; `canConfirmMaximum` is true only
for a measurable candidate after a steady return to baseline. `confirmMaximum()`
returns false until those requirements hold. The host must also check capture-time
freshness before calling it. Neither measurement nor confirmation emits completion.

Manual candidates require at least two elevated samples over 60 ms and a rise of
at least max(0.015 image height, 0.06 torso length). They survive the 15-second idle
and 2.5-second maximum-flight timeouts; long joint loss, position/scale drift and
explicit recalibration still discard them. Live motion keeps the existing timeout
and completion rules. `confirm-maximum` is an additive cue. Dino uses this option
because missed feet/landing and automatic timeout resets made calibration hard to finish.

## Countermovement before a jump

After the upright standing reference is captured, a visible preparatory crouch
may shorten or tilt the torso. When the shoulder/hip anchors stay at or below
that reference, joint widths remain stable and the person stays in position,
the recognizer retains the original baseline and emits `prepare-jump` with zero
height. Unfolding back through the reference does not disarm the next jump.
A crouch followed only by standing never calibrates or completes a jump; both
tracked signals still have to rise above the original standing height.

The same rule preserves calibrated live controls and quick-start entry. A crouched
landing may end a tracked flight, but manual height confirmation requires a return
to upright baseline. Missing joints, significant sideways/depth changes and initial
crouched calibration retain their existing rejection rules. These are bounded 2D
heuristics verified with synthetic sequences; human crouch/jump accuracy is unverified.


## Debounced tracking in Camera Start

The separate Camera Start POC enables `robustTracking: true` alongside manual
maximum confirmation and upper-body preference. Other callers retain the default
recognition behavior. This opt-in policy:

- Preserves the standing reference, captured maximum and pending motion during
  up to 350 ms of missing or rejected geometry. Rejected frames still emit
  `phase: missing`, zero height and no completion; `quality: tracking-grace` and
  `trackingReason` identify the temporary rejection. No joints are synthesized.
- Excludes missing time from standing stability and clears landing/confirmation
  holds immediately. Recovery requires a fresh observed landing hold. Longer
  gaps cancel pending motion; sustained rejection beyond 750 ms recalibrates.
- Applies a three-observed-sample median before exponential height smoothing.
  Isolated coherent height spikes cannot establish a maximum. This adds about
  one input frame of response latency to typical rise/fall sequences.
- Uses torso length, anchor positions and upright geometry rather than narrow
  projected shoulder/hip widths as the upper-body distance checks. Significant
  torso-scale and lateral drift remain rejected.

The host holds the current large instruction for 350 ms during a brief dropout,
freezes its countdown, and hides confirmation controls until current tracking is
valid. Competing jump/confirm instructions must persist for 180 ms before display.
These are synthetic-tested thresholds, not measured guarantees of human accuracy.


## Selected range instead of maximum measurement

Manual-confirmation hosts can call `setJumpRange(torsoRatio)` with a finite number
from 0.1 to 0.8. It stores a user setting, not a measured movement. After fresh
standing calibration and the usual upright return hold, `confirmMaximum()` can
accept that selected range without a jump. The resulting peak is baseline torso
length times the chosen ratio. Missing tracking and pre-baseline confirmation
remain blocked. Invalid values throw; non-manual hosts and already confirmed
ranges reject changes. The setting survives recalibration, but the baseline does
not. Callers that never set a range retain maximum-jump calibration unchanged.

Configured outputs add `rangeSource: slider` and `previewHeightRatio` (0–1) for a
host's live response meter. Preview is zero on missing tracking; during calibration
it never changes contract `progress` or emits a completion. Camera Start opts into
this path; the standalone Dino host keeps its own start policy.

### Retained game calibration

`retainCalibration: true` opts a game into keeping a confirmed standing reference
and response scale across tracking rejection, silent gaps and flight timeouts.
Use it with `robustTracking` for noisy live input. Lost motion is discarded; an
observed grounded hold re-arms recognition before a new rise can count. Returning
to the original position is required. Explicit `reset` / `recalibrate`, changed
image dimensions and a tracking-mode change still acquire a fresh reference.
The default is false, preserving calibration behavior in other hosts.
