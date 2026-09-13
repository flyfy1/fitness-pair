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
