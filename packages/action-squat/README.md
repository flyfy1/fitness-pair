# Squat recognizer

Owns `PoseFrame → ActionFrame`. No DOM, camera, renderer, or model index arrays.
`SquatRecognizer` exposes `reset(session)`, `recalibrate()`, and `update(frame)`.
Stale/duplicate input returns null. A model/session change requires a reset.

The baseline uses named 2D joints, aspect-correct angles, standing calibration,
smoothing, hysteresis, and temporal confirmation. Short losses freeze confirmation;
gaps over 650ms restart stance calibration. Recalibration preserves completion IDs.

Its confidence threshold was inherited from MediaPipe visibility and needs validation
with other models. It is not exercise-form assessment. Run `npm test` or
`npm run explore:actions`; explore alternatives in `experiments/action-recognition/`.
