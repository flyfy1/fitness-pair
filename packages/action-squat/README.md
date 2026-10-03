# Squat recognizer

Owns `PoseFrame → ActionFrame`. No DOM, camera, renderer, or model index arrays.
`SquatRecognizer` exposes `reset(session)`, `recalibrate()`, and `update(frame)`.
Stale/duplicate input returns null. A model/session change requires a reset.

The baseline uses named 2D joints, aspect-correct angles, standing calibration,
smoothing, hysteresis, and temporal confirmation. Short losses freeze confirmation;
gaps over 650ms restart stance calibration. Recalibration preserves completion IDs.

Version `squat-2d-hysteresis/2` rejects collapsed thigh/shin geometry even when
joint confidence is high; a usable side can still supply the features. A stable
upright pose outside the calibrated position or scale recalibrates after 1.5
seconds without scoring a partial action or resetting the round's event IDs.
Initial and recovery calibration both require stable torso size. A brief rise
above the standing baseline must return before the standing confirmation can
complete a squat.

Its confidence threshold was inherited from MediaPipe visibility and needs validation
with other models. It is not exercise-form assessment. Run `npm test` or
`npm run explore:actions`; explore alternatives in `experiments/action-recognition/`.

Run `npm run evaluate:squat` for event-level false/missed completion and synthetic
delay results on ten authored cases. See the
[fixture protocol and limits](../../experiments/evaluation/squat-robustness/README.md).
These checks establish deterministic behavior, not human recognition accuracy.
