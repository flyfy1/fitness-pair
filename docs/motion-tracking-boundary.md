# Motion tracking integration boundary

The source prototype is `second-brain/projects/260913-motion-quest`. Its extracted
pose and action packages can be used without the forest game's DOM or renderer.
Motion Quest remains the reference camera host. Camera controls for Dino Run are
a later integration step.

## Current package responsibilities

| Component | Public entry point | Responsibility |
| --- | --- | --- |
| Shared contracts | `@fitness-pair/contracts` | Named `PoseFrame` joints, `ActionFrame` completion semantics, validators, and provenance |
| Pose provider | `@fitness-pair/pose-mediapipe` | `fromMediaPipe(...)` adapts model output to a validated `PoseFrame` |
| Model worker | `@fitness-pair/pose-mediapipe/worker` | Runs the pinned MediaPipe model locally in a dedicated worker |
| Squat recognition | `@fitness-pair/action-squat` | `SquatRecognizer` calibrates standing posture and emits full squat completion events |
| Reference game rules | `@fitness-pair/game-forest` | `createGameState(...)` and `consumeAction(state, frame)` apply each completion once |
| Reference host | `apps/motion-quest/src/main.js` | Owns camera permission, input sampling, worker lifetime, preview drawing, and UI wiring |

The recognizer and game rules are plain JavaScript modules that run in Node tests
without a camera, browser DOM, canvas, or MediaPipe runtime. A game consumes
`ActionFrame`; it does not need to recognize poses or depend on the forest renderer.
The squat detector consumes named joints directly; it does not reconstruct a
MediaPipe landmark array or depend on that model's numeric joint indices.
The packages are private npm workspaces in this repository, not published SDKs.

## Reusing the action recognizer

```js
import { SquatRecognizer } from '@fitness-pair/action-squat';

const recognizer = new SquatRecognizer();
recognizer.reset({ sessionId, source });

function receivePose(poseFrame) {
  const actionFrame = recognizer.update(poseFrame);
  if (actionFrame === null) return; // Duplicate or stale input.
  receiveAction(actionFrame); // The consuming game's integration function.
}

// Within the same session, this preserves the completion-number sequence.
recognizer.recalibrate();
```

Supply validated, unmirrored named joints with their original input timestamp,
sequence number, session ID, image dimensions, and source. Unknown confidence is
not certainty. Start a new session when changing the camera, model, player, or
replay timeline, and reset the recognizer and game together.

An action completes only when `phase === 'completed'` and `completion` contains
its stable `id` and `repIndex`. A game must deduplicate that ID and reject foreign
sessions, provenance, and stale input. `progress` and `cue` are feedback; neither
awards a jump, attack, or score by itself. Recalibration must not make an old
completion ID reusable. See [the contract](../contracts/README.md) for exact rules.

For a future Dino Run adapter, first define which completed movement maps to a
game command and how movement timing interacts with obstacle spacing. Reusing a
squat recognizer does not establish that running-game difficulty is appropriate
for its cadence.

## Camera host responsibilities

The host prepares local model assets through
`apps/motion-quest/scripts/prepare-assets.mjs`. It owns `getUserMedia`, transfers
input bitmaps to the worker, adapts returned poses, and passes them to the
recognizer. Camera and worker orchestration intentionally remain host-owned.

The reference host bounds model initialization at 30 seconds and stalled
inference at 8 seconds. It stops owned media tracks and terminates its worker on
stop, failure, page exit, backgrounding, and round completion. A permission result
arriving after cancellation is also stopped. Preview mirroring belongs to the UI
and does not modify recognition coordinates. A second game integrating a camera
must preserve these lifecycle responsibilities.

## Evidence and remaining validation

The command below exercises the extracted contracts and squat logic without
starting a camera or preview server:

```sh
node --test tests/contracts.test.mjs tests/squat.test.mjs
```

On 2026-09-13, all 15 checks passed again after the detector was updated to consume
named joints directly. They cover five synthetic repetitions,
explicit completion-only scoring, duplicate and foreign events, recalibration
IDs, missing joints and unknown confidence, jitter, occlusion, input time gaps,
and aspect-corrected knee angles. This demonstrates the independent module path;
it does not measure human recognition accuracy or prove a camera-to-Dino Run
play session. The integration owner's browser checks provide separate evidence
for the reference host.
