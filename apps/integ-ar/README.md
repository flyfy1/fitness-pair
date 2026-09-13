# Integ AR games

Six original Integ Games adapted for camera-only AR play: Brick Pulse,
Pixel Defense, Perfect Stack, Orbit Knife, Bubble Pop and Fruit Orbit.
See [the complete matching and MVP boundary](../../docs/movement-game-mapping.md).

The camera, game objects and live named-body skeleton share a full-window stage.
The source game canvas is an inert offscreen render target, not an opaque iframe
or a keyboard-controlled preview. Games receive semantic controls after
`PoseFrame → ActionFrame`; primary event IDs are deduplicated before game input.
The existing pose camera, body-gesture pause command, model assets and recording
host are reused. No new runtime dependency or model is required.

Source code under `src/originals/` is adapted from the user's `flyfy1/integ-games`
commit `c2a3374daec9ea15342baa32e001581ade40dec8`, paths `src/games/` and
`src/core/game-types.ts`. It is user-authorized source reuse, not a claim of an
open-source license. The source checkout has no LICENSE/COPYING/NOTICE file.
Adaptations remove opaque backgrounds/mobile controls, expose semantic input
and snapshots, suppress paused/finished actions, and retain original mechanics.

## Pixel Defense tutorial prototype

Pixel Defense AR alone opens a full-window practice screen on entry. After an
explicit camera start and standing calibration, it asks for sustained left and
right torso movement, one recognized left-hand shot, and observed hand lowering.
A practice ship and labeled person diagram show each control; confirmed steps
stay checked. Large text has no colored backdrop; the camera remains visible
through the instruction area. Missing or stale tracking cannot finish a step.

The original game stays paused with zero score and no shots during practice.
Its presentation phase remains `setup`, so the shared recorder does not capture
the tutorial. After confirmation, raise both hands for one second, then lower them to begin the fresh countdown.
Skip tutorial is available before permission and during practice; it still
requires normal camera setup and the two-hand start gesture. Cancellation stops camera/model resources and a
new camera attempt starts practice again. Completion/skip lasts for this page
only. All six games share the same two-hand start gesture.

See [the bounded prototype and evidence](../../docs/invaders-tutorial-prototype.md).
