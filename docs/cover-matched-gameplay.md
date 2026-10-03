# Cover-matched playable scenes

## MVP card

- Player: someone who likes the game's sculptural illustrated introduction.
- Job: enter the game and see the same characters, depth and material in the
  playable scene and movement instructions.
- Risk: recoloring flat legacy shapes does not reproduce the cover's illustration
  quality, while a static cover behind gameplay can obscure moving objects.
- Loop: illustrated entry → matching movement guide → live game with sculptural
  characters and a dimensional board → pause/finish → matching local replay.
- Conditions: all nine playable games, phone and desktop, synthetic camera and
  pointer/keyboard demos. No participant recording.
- Output: local transparent character/pose artwork; dimensional native boards,
  props and readable cream instruction surfaces. Existing game rules and camera
  input continue to drive the visible scene.
- Proof: screenshots of actual playing states, loaded artwork, native completion,
  replay playback and owned-media teardown; served production asset verification.
- Boundary: preserve collisions, scoring, calibration, gesture timing, full-camera
  access, audio and local-only replay. No engine/model/dependency changes.
- Appetite: one visual correction across the existing catalog. No new games.

## Implementation

The earlier treatment recolored flat shapes. Live rendering now draws local
transparent dinosaur, guardian, mage and helicopter sprites based on the cover
references. MQ's charge and impact effects still follow actual action state;
Flight keeps its head-centered pilot view and collision envelope; Jump Game keeps
its existing motion arc and collision boxes. The renderers retain native fallback
drawing while images load.

The six AR games have cached dimensional play boards, ceramic rims, clay props
and improved material depth. The source canvas owns that scenery so saved local
replays include it. Non-camera Quest and Flight previews also render their sky
and terrain into the canvas rather than relying on a CSS background.

Movement guides and start confirmation use explicitly posed clay figures with
the existing text, arrows and hand labels. Instruction surfaces are cream and
compact enough to leave characters visible. Guide footer links no longer move
under the pointer: the old hover transform could oscillate after a narrow resize
and prevent a normal click.

All covers, selected sprites, movement illustrations and original generated
sources are organized in [assets/game-art](../assets/game-art/README.md). Its index
records dimensions, transparency and hashes; generation briefs preserve the
recipe for future iterations. Private recordings do not belong in that directory.

## Verification

On 2026-10-03: 138 shared unit checks, 45 Jump Game/Flight checks, 35 deployment
and server checks, all nine builds and 24 browser cases passed. Browser coverage
includes every movement guide, 320/390/844/1440px native/shared HUD layout,
English/Chinese, camera denial/retry, the five-action Quest loop, Flight tracking
grace/recovery/audio, partial stopped replays and immediate media/worker cleanup.

Actual native play, pause, completion and decoded local replay were also checked
for all nine games. The asset index's 23 hashes match the source files; all 20
selected cover/sprite/pose images are bundled and reachable with matching bytes.
Screenshots were reviewed to keep the Quest characters visible below instructions
and to retain clear native controls. Production acceptance compares served
HTML/JS/CSS and artwork against the committed build before exercising those same
play/replay paths.

Camera inputs are synthetic fixtures; other paths use pointer/keyboard demos.
This verifies presentation, recording and lifecycle, not human recognition
accuracy. Original generated sheets are reusable source material, not animation
frame packs; games still own their movement and effects.
