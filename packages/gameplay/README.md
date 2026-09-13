# Optional action input

`createActionController` is the boundary between recognition and game controls.
It accepts the existing `ActionFrame` contract, preserves its source/session/time,
rejects stale or foreign frames, and deduplicates completion IDs. Each integration
supplies an `accept` predicate and a mapping to the game's own semantic controls.
It does not acquire a camera, select a model, own rendering, or award points.

Example: `apps/dino-run/src/motion-input.js` maps calibrated jump height to
`Runner.setHeightRatio()`. Keyboard controls instead call `Runner.command()`.
The Runner engine imports neither this controller nor any recognition contract.
A different recognizer can feed the controller without changing game physics.
Reset the controller with each recognition session; dispose it on teardown.

The existing `PoseFrame → ActionFrame → GameSnapshot` contract is unchanged.
Presentation and recording are independently hosted by
`apps/arcade/src/gameplay`; see its README and typed presentation interface.

## Language preference

`locale.js` stores a shared `hopmodo.language` preference (`en` or `zh`) on this
origin. Without a saved choice, Chinese browser locales select Chinese; other
locales select English. Unavailable storage does not prevent an in-page change.
The helper owns no game state or UI. Push-up Flight is the first integration;
other games can independently resolve their own text/audio resources from it.
