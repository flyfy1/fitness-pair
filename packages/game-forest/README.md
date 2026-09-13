# Forest game

Owns `ActionFrame → GameSnapshot → rendering`. `createGameState()` and
`consumeAction()` are pure functions. The canvas `ForestGame` renderer is separate.

Only previously unconsumed completion IDs cause damage. Foreign sessions, sources,
actions, stale frames, duplicate events, and input after victory are ignored.
Defaults: five repetitions, twenty damage per completion. No model, camera,
recognition thresholds, or calibration logic belongs here.

Run `npm run explore:gameplay` without a camera. Alternative games can consume the
same contract from `experiments/gameplay/<slug>/` or their own app.
