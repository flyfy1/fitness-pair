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

Tracking gaps have a 1.5-second grace period: physics continues while controls
hold their last valid position and missing observations cannot fire actions.
Fresh tracking within that window continues immediately. Longer loss pauses
the game; visible, lowered hands held for 500 ms start a 1.5-second countdown
to resume the same round. Stay paused cancels automatic recovery, and manual
pauses require a deliberate resume. Stop, finish, recalibration and camera
failure cancel recovery. See [the recovery behavior and evidence](../../docs/ar-tracking-recovery.md).

Every camera start creates a UUID v4 shared by its PoseFrames and Arcade
presentation. The six games publish validated named-joint frames through the
same optional presentation boundary. Hopmodo records only the frames emitted
during the local video window and persists both artifacts atomically; standalone
play does not save tracking, and no upload happens automatically.

Source code under `src/originals/` is adapted from the user's `flyfy1/integ-games`
commit `c2a3374daec9ea15342baa32e001581ade40dec8`, paths `src/games/` and
`src/core/game-types.ts`. It is user-authorized source reuse, not a claim of an
open-source license. The source checkout has no LICENSE/COPYING/NOTICE file.
Adaptations remove opaque backgrounds/mobile controls, expose semantic input
and snapshots, suppress paused/finished actions, and retain original mechanics.

## Brick Pulse recovery loop

Brick Pulse starts each round with three lives. Missing the ball preserves the
score and remaining bricks, holds the next ball over the moving paddle for two
seconds, then serves automatically. The first serve and each new level have a
short preparation countdown too. Only the third miss ends the camera round and
finalizes its local replay. A life loss keeps the same camera session, tracking
sidecar and recording; it never publishes a clip.

Ball motion and collisions advance in fixed 120 Hz steps, using elapsed active
time rather than render-frame counts. Manual/tracking pauses freeze the serve
countdown and physics; a stalled frame advances at most 100 ms. This avoids a
hidden burst of collisions after a stall. The named-joint input boundary and
shared countdown, soundtrack, recording and pause controls are unchanged.

Synthetic regressions compare motion, collision events, scores and lives at
20/30/60/120 FPS, exercise reinforced bricks and level bonuses, and check a full
three-life round with paused preparation and one persisted replay in Chrome.
They do not establish human paddle-control accuracy or player enjoyment.

## Pixel Defense tutorial prototype

Pixel Defense AR alone opens a full-window practice screen on entry. After an
explicit camera start and standing calibration, it asks for sustained left and
right torso movement, one recognized left-hand shot, and observed hand lowering.
A practice ship and labeled person diagram show each control; confirmed steps
stay checked. Large text has no colored backdrop; the camera remains visible
through the instruction area. Missing or stale tracking cannot finish a step.

The original game stays paused with zero score and no shots during practice.
Its presentation phase remains `setup`, so the shared recorder does not capture
the tutorial. After confirmation, bring both hands together for one second, then lower them to begin the fresh countdown.
Skip tutorial is available before permission and during practice; it still
requires normal camera setup and the two-hand start gesture. Cancellation stops camera/model resources and a
new camera attempt starts practice again. Completion/skip lasts for this page
only. All six games share the same two-hand start gesture.

See [the bounded prototype and evidence](../../docs/invaders-tutorial-prototype.md).

## Upper-body framing

All six AR games calibrate from both shoulders without hips or legs. Sit or stand,
keep both hands visible for setup, bring them together near your chest or face
for one second, then separate and lower them for the countdown. This start gesture
does not fire/drop/throw; left-hand actions and both-hands-raised pause remain.
See [camera framing and evidence](../../docs/camera-framing.md).
