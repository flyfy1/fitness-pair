# Body arcade input experiment

Consumes named `PoseFrame` joints and emits v1-compatible `ActionFrame`s with an
app-local `controls` extension. It adds calibrated horizontal torso position,
right-wrist aim and a deliberate left-hand raise to the six Integ AR games.

Standing calibration needs one second of fresh, steady shoulders and hips.
Primary actions require an observed lowered left wrist, a 150 ms stable raise,
and a 250 ms lowering before rearming. Holding a hand never repeats. Both raised
hands are reserved for the existing one-second pause/resume recognizer. Missing
required joints, stale input or scale drift suppress controls; reacquisition
requires neutral hands. Recalibration preserves the action sequence.

This is geometry over the existing local pose model, not new pretrained actions.
Tests are synthetic, not human accuracy or exercise-quality evidence. See
`docs/movement-game-mapping.md` for the scope and complete source catalog.
