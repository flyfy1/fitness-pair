# Integ Games to movement AR

## MVP card

- Target user: one player choosing a camera-controlled game in the Hopmodo arcade.
- Job: play several distinct game categories with body movement and see which body landmarks drive them.
- Riskiest assumption: torso position, deliberate arm raises and wrist pointing can control the original games without accidental repeated commands or hidden tracking loss.
- P1 loop: choose one of six games → explicitly enable camera → stand still to calibrate → move with the live camera and named torso/limb overlay → pause/recover or finish → save the existing local replay → return to the arcade.
- Success proof: source-derived mechanics, recognizer fixtures, synthetic camera-to-game interactions for every imported game, actual local-model public-fixture inference, desktop/mobile AR visuals and lifecycle/replay checks. Human usability remains an explicit trial.
- No-gos: changing Integ Games production, key-event simulation as the integration, opaque embedded game pages, fabricated joints, private participant recordings, new backend/model/dependency or changing shared v1 contracts.
- Appetite: the six selected categories and a complete inventory/mapping, not all 20 games or a new game platform.

## Available movement inputs

| Input | Current evidence / implementation | Best use |
| --- | --- | --- |
| Full squat then stand | Existing `action-squat`; completed, deduplicated repetitions | Motion Quest charge/attack; slow deliberate discrete actions |
| Relative torso rise and return | Existing `action-jump-height`; full/upper-body calibration | Dino height; not centimeters or a clinical jump measurement |
| Head vertical/lateral movement | Existing Push-up Flight head extension | Continuous flying position |
| One hand raised for one second | Existing Dino `BodyGestures`, with lower-to-rearm | Confirm calibration / next |
| Both hands raised for one second | Existing Dino `BodyGestures`, with lower-to-rearm | Pause/resume; reserved as a system command |
| Torso horizontal position | New adapter over existing named shoulders/hips; standing baseline and dead zone | Paddle, ship and fruit drop position |
| Deliberate left-hand raise | New app-local 150 ms stable raise after observed lowering; one completion ID per raise | Shoot, drop, throw; no repeated action while held |
| Right-wrist position | New app-local normalized aiming over existing named wrist; wrist required for aim games | Bubble aim with a visible reticle |
| Thumbs up, wave, seven static hand categories, finger ratings 1–5 | Existing Gesture Lab experiment; separate hand model, not connected to these six games | Later menu confirmation/selection; do not claim it is active in the AR body games |

All recognition coordinates remain unmirrored. Presentation mirrors the video and skeleton together; control mapping makes screen-left movement move game objects left. Body-only inputs do not require a separate hand model. Incomplete or stale poses suppress commands and clear stale skeletons.

## Source catalog and matching

The current source is the user's `flyfy1/integ-games` checkout at
`c2a3374daec9ea15342baa32e001581ade40dec8`. Catalog metadata and selected original
mechanics are imported locally under `apps/integ-ar/`; the source repository is read-only.

| Original game | Decision | Body mapping / reason |
| --- | --- | --- |
| Merge 2048 | Possible later | Four directional arm swipes; deliberate turn-based input |
| Block Drop | Possible later | Sway to move, separate rotate/drop gestures; too many simultaneous commands for this first set |
| Neon Snake | Possible later | Four directional gestures; sharp turns need latency trials |
| Pocket Mines | Poor initial fit | Small targets and distinct reveal/flag actions need precise pointing |
| Daily Solitaire | Poor initial fit | Precise card selection and destinations |
| Calm Sudoku | Poor initial fit | Cell selection plus nine-number entry |
| Word Trail | Poor initial fit | Continuous tracing of small adjacent targets |
| Memory Flip | Possible later | Large wrist-hover card targets and deliberate confirm |
| Perfect Stack | Selected | Left-hand raise → Drop one slab; lower the hand to rearm |
| Sky Flap | Possible later | Repeated arm raises to flap; overlaps existing Flight category and needs cadence tuning |
| Brick Pulse | Selected | Body sway left/right → Continuous paddle position |
| Pixel Defense | Selected | Body sway + left-hand raise → Move ship + fire once per raised-hand event |
| Metro Dash | Possible later | Sway lanes + jump + crouch; overlaps existing AR Dino and needs three-input trials |
| Trap Trail | Possible later | Sway + jump; direction precision and traps need trials |
| Tiny Wheels | Possible later | Lean to accelerate/brake; game speed needs body-scale tuning |
| Fruit Orbit | Selected | Body sway + left-hand raise → Choose drop position + release fruit |
| Bubble Pop | Selected | Right-wrist aim + left-hand raise → Aim at the on-screen reticle + shoot |
| Hexa Fit | Poor initial fit | Tray selection and precise cell placement |
| Orbit Knife | Selected | Left-hand raise → Throw once; lower the hand to rearm |
| Pocket Survivor | Possible later | Two-axis body steering plus upgrade selection; requires a separate menu interaction |

## AR presentation and controls

The camera fills the play viewport. Transparent game objects render over it;
shoulders, hips, torso edges and every confidently visible limb remain visible.
No missing hip, wrist or limb is invented. The HUD names the required missing
joints and shows recognized sway, aim and arm state. Setup, manual pause and
tracking loss are separate states. Pause freezes game physics immediately;
resume requires fresh tracking and lowered hands before new actions.

Every selected game uses the same start/calibrate/play/pause/finish/replay flow.
The gameplay engine receives semantic position/aim/primary commands, not pose
joints or browser key events. `PoseFrame → ActionFrame → game state` preserves
session, source, input sequence/time and stable completion IDs. Added control
observations are an app-local optional extension of the unchanged v1 envelope.

Existing listed AR games retain their gameplay; Push-up Flight also gains the
visible named-body overlay so the active catalog consistently shows tracking.
