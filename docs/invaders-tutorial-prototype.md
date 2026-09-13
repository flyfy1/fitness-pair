# Pixel Defense AR tutorial prototype

- Target user: a first-time camera player entering Pixel Defense AR.
- Job: understand and physically confirm basic controls before enemies begin.
- Riskiest assumption: a player can follow a large camera-overlay instruction and deliberately steer both directions, fire, and lower the hand to rearm.
- P1 loop: enter full-screen instruction → explicitly enable camera → calibrate standing → confirm left/right torso movement → confirm left-hand fire and lowering → choose Play → fresh countdown → original game and local replay.
- Skip: available before permission and throughout practice. Skipping dismisses the tutorial, not camera permission/calibration. No completion is fabricated.
- Success proof: synthetic camera drives each tutorial step; early/wrong/missing input cannot complete it; physics and recording stay stopped during practice; completion and skip both reach the real game; camera teardown and mobile/desktop readability are checked.
- Scope: Pixel Defense AR only, per-page tutorial completion, existing recognizer and illustration reuse, no new model/dependency/platform. Other games keep their current entry flow.
- Later: voice prompts, saved completion preferences, tutorial controls for other games, and participant usability trials.

## Implementation evidence

The prototype reuses `PoseCamera`, `BodyArcadeRecognizer`, the named-body overlay,
and the existing person diagrams. A tutorial-only ActionFrame consumer confirms
300 ms of steering on each side, one stable completion ID, and 300 ms of genuinely
lowered left-wrist observations. Early and repeated completion IDs cannot complete
later steps. Practice commands update a separate ship display, never the game.

Automated evidence uses synthetic camera fixtures and a public-image model fixture,
not participant recordings. Tests cover correct/wrong input order, tracking loss,
skip before and during camera setup, permission denial, late permission cancellation,
retry/background cleanup, an actual game shot after practice, and local recording
beginning only in the real round. Desktop, 320 px mobile and landscape entry controls
are checked. Human comfort, timing and comprehension still need a play trial.
