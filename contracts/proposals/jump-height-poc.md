# Compatible action extension: calibrated jump-height POC

The current POC explicitly adds continuous jump-height control to Dino Run. The
existing v1 PoseFrame, ActionFrame and forest GameSnapshot retain their fields and
semantics. No forest consumer is changed. The new action identifier is `jump-height`.

`@fitness-pair/action-jump-height` returns an ActionFrame with these extra fields:

| Field | Meaning |
| --- | --- |
| `stage` | `standing`, `maximum`, or `ready` calibration stage |
| `calibrated` | True only after a valid maximum jump and confirmed landing |
| `heightRatio` | Current relative rise in `[0,1]`, zero during calibration/missing |
| `peakRise` | Captured maximum displacement in normalized image y units, or null |
| `quality` | Recognizer-specific tracking/calibration diagnostic |
| `trackingMode` | `full-body`, `upper-body`, or null before usable framing |

During calibration, `phase=calibrating`, `progress=0`, and completion is null.
The standing and maximum phases have their own `calibrationProgress`. During live
tracking, `progress=heightRatio` is a continuous control magnitude, never a score or
repetition. Phase is ready/active, with completed emitted once on a confirmed live
landing. A calibration landing does not complete an action for game scoring.
Missing or recovery frames carry zero height and no completion. Stage may remain
ready across a short loss, so consumers must check phase in addition to calibrated.

The recognizer preserves PoseFrame session, source, sequence and sampling time.
Changing session/source/model requires reset; recalibration preserves completion
numbering. The game binds one session/source/action, drops stale/duplicate frames,
and deduplicates completed landing IDs. It directly positions the sprite using
heightRatio × 165 logical pixels, bypassing keyboard gravity. Height values alone
never increment the jump count. Distance and obstacle scoring remain game mechanics.

Dino's existing runner snapshot remains game-specific rather than pretending to
implement the forest's health/target-repetition snapshot. Keyboard and camera modes
have separate best scores and cannot supply controls simultaneously.

The user-requested POC owns this compatible producer/consumer pair. If other games
adopt it, promote the subtype into shared TypeScript definitions after confirming
its units and interpretation. Do not reinterpret the baseline forest fields or
use relative camera displacement as physical height.

Upper-body mode uses coherent shoulder/hip displacement when legs are unavailable.
Its completed event denotes a return-to-baseline movement cycle, not proof that
feet left the ground. Tracking mode is locked after baseline calibration; switching
from full body after sustained leg loss invalidates both baseline and maximum.
Consumers must retain the existing missing/calibration gates during that transition.
