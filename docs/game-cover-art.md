# Distinct game covers

## MVP card

- Player: someone choosing a movement game on a phone or desktop.
- Job: recognize each game's theme before opening it, then find its existing
  start controls on an illustrated introduction.
- Risk: attractive artwork can obscure the start controls or imply a different
  game. The pictures must reflect each game's current main mechanic.
- Loop: browse ten distinct covers → select a game → see its matching cover and
  positioning instructions → start through the original control.
- Input: all nine playable games and the labeled Orbit Pop concept; narrow
  portrait, short landscape and desktop screens.
- Proof: loaded, distinct images for every catalog card and playable entry;
  responsive screenshots; camera remains off before Start; original demo/start
  controls work. Confirm production release and image bytes.
- Boundary: retain game names, concept labeling, recognition and recording;
  no new games, dependency, camera capture or animated asset loading.
- Appetite: one cover and shared introduction treatment per existing game,
  validated and delivered as a single checkpoint.

## Artwork

The covers are illustrative game artwork, not gameplay screenshots or participant
recordings. They use the built-in image-generation tool, one independent prompt
per game. Titles and instructions remain accessible HTML outside the image.
Original generated PNGs remain in the tool's output directory; production JPEGs
are in `assets/game-art/covers/` and are bundled by Vite for both Arcade
and standalone game entry pages. The shared cover metadata supplies the same
image and alternate description to both consumers.

### Prompt set

Each prompt requests a landscape 3:2, polished playful 3D clay-like miniature,
soft studio lighting, rounded matte shapes, restrained tactile texture, crisp
silhouettes, a central composition suitable for responsive crops, an uncluttered
layered background, and no text, logos, UI, watermarks or photoreal people.

- Motion Quest: friendly forest mage casts luminous blue magic toward a mossy
  forest guardian among rounded trees; emerald, cream and blue.
- Push-up Flight: tiny teal/cream helicopter with coral propeller flies through
  rounded arch gates above a calm landscape; teal, cream and coral.
- Jump Game: compact green dinosaur jumps over a cactus on a sunny desert path;
  cream hills, coral rocks and pale sky.
- Brick Pulse AR: paddle bounces a coral ball toward teal/blue/yellow bricks,
  with a readable ball trajectory in a miniature arcade arena.
- Pixel Defense AR: small blue spacecraft fires upward toward chunky pixel
  aliens; indigo space with teal/coral accents.
- Perfect Stack AR: aligned teal/coral/cream/yellow slabs form a tower, with
  one slab hovering above it ready to line up in a pastel architectural world.
- Orbit Knife AR: wooden circular target with blunt toy-like silver knives,
  teal handles and one incoming knife aimed at a gap; no violence or people.
- Bubble Pop AR: colorful clustered puzzle bubbles and a launcher aiming one
  mint bubble at an opening; pastel blue, one clear trajectory.
- Fruit Orbit AR: rounded container of strawberries, oranges, apples and
  watermelon; orange drops onto a matching pair with a subtle merging sparkle.
- Orbit Pop: large coral target sphere and smaller teal/gold targets along
  orbit rings in pastel purple space; an inviting target-tapping concept.

The exact prompt set is saved in
`assets/game-art/covers/prompts.json`. All ten generated outputs were
visually inspected, then encoded as JPEG at quality 82 without cropping. Combined
production image size is approximately 2.7 MB; card images load lazily, while an
entry prioritizes its own cover.

## Validation

- 138 root tests and 35 deployment/server tests passed; all nine games built.
- 14 browser cases passed: catalog artwork, all nine bilingual introductions,
  Flight grace/replay/audio, six AR play-and-replay flows, Jump Game and Motion
  Quest replay flows, and three entry lifecycle cases covering language, the
  five-action preview, permission retry and worker cleanup.
- Introduction coverage includes 320-pixel portrait, 844-pixel landscape and
  desktop; controls remain reachable and camera permission stays unopened before
  Start. Fresh portrait, landscape and desktop screenshots were inspected.
- Production acceptance checks the served commit, exact image bytes, every card
  and introduction, both languages, three viewports, and a pointer demo ending in
  one playable local replay without a video upload.
- Synthetic camera and pointer checks establish software behavior; they do not
  establish human recognition accuracy.
