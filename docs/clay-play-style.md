# Warm sculptural play screens

## MVP card

- Player: someone entering a game from its new illustrated cover.
- Job: recognize the same warm, rounded visual identity while playing, and use
  start, movement, pause, finish and replay controls with clear state feedback.
- Risk: decorative treatment can obscure camera input, change apparent collision
  bounds, reduce contrast, or make small-screen controls harder to use.
- Loop: illustrated entry → native camera/demo start → visible movement controls
  and sculptural game objects → pause/recover → finish → playable local replay.
- Input: all nine playable games plus the Orbit Pop concept, desktop and narrow
  phone viewports, English and Chinese, synthetic camera and pointer inputs.
- Output: cream surfaces, teal controls, coral accents, soft depth and readable
  status cues; shaded game pieces matching each cover's theme.
- Proof: existing gameplay, recovery, recording and cleanup regressions; browser
  screenshots; production release and served asset verification.
- Boundary: native canvas/DOM rendering, existing controls and camera ownership;
  retain collision geometry, scoring, timing, recognition and local-only replay.
  No new engine, dependency or model.
- Appetite: one visual slice, validated and deployed before other gameplay work.

The shared play stylesheet changes material and color rather than control
placement. Small canvas helpers shade existing shapes with local gradients and
bounded shadows; no per-frame image decoding or external requests are required.

## Delivered treatment

- Shared entry, movement instructions, confirmation, pause/recovery, finish,
  feedback and replay controls use cream surfaces, teal actions and coral focus
  accents. Recording still has its distinct red state.
- Brick Pulse, Perfect Stack and Pixel Defense use rounded shaded pieces;
  Bubble Pop has matte pastel spheres; Orbit Knife has a wood-grain core;
  Fruit Orbit has shaded fruit with leaves, faces and tier details.
- Jump Game has a rounded green runner, teal cacti and sandy ground. Push-up
  Flight has a teal helicopter, coral rotor and cream gate columns. Motion Quest
  has shaded guardian/hero parts and blue spell accents.
- Movement diagrams retain their explicit poses and hand labels. Their SVG
  gradient IDs are unique across dialogs and embedded instructions.
- The concept remains labeled as a button simulation. Its target has the same
  soft depth treatment.

Canvas bounds, event handling, collision rules, camera projection and soundtrack
remain owned by the original hosts. Shared shell cleanup removes its theme class
along with its existing resources. Styles remain usable with reduced motion.

## Verification

On 2026-10-03, `npm test` passed 138 checks, the Jump Game/Flight unit suites passed
45 checks, deployment/server suites passed 35 checks, and `npm run build` built all
nine games. Browser checks covered all six AR rounds and camera replay cleanup,
Motion Quest and Jump Game local replay, Flight tracking grace/recovery/audio,
responsive bilingual footers, all nine illustrated guides, entry lifecycle,
cover images and completion/retry feedback.

The replay test helper now handles completion feedback arriving between its
visibility check and the replay click; it dismisses the prompt via the normal
View replay action before retrying. Guide checks now inspect the real cover image
instead of the retired poster/canvas fallback.

An ignored browser evidence script, `.local/verify-clay-play.mjs`, compares root
and all nine served game HTML/JS/CSS files with this checkout and exercises each
game through play, finish and local replay. Screenshots cover playing, paused and
finished phone screens. Production runs check the release commit and Pi origin,
block test analytics, and assert no video uploads or browser errors. Inputs are
synthetic camera fixtures or pointer/keyboard demos; this proves presentation and
playback paths, not human movement recognition accuracy.
