# Optional action input

`createActionController` is the boundary between recognition and game controls.
It accepts the existing `ActionFrame` contract, preserves its source/session/time,
rejects stale or foreign frames, and deduplicates completion IDs. Each integration
supplies an `accept` predicate and a mapping to the game's own semantic controls.
It does not acquire a camera, select a model, own rendering, or award points.

Example: `apps/camera-start/src/motion-input.js` maps calibrated jump height to
`Runner.setHeightRatio()`. Keyboard controls instead call `Runner.command()`.
The Runner engine imports neither this controller nor any recognition contract.
A different recognizer can feed the controller without changing game physics.
Reset the controller with each recognition session; dispose it on teardown.

The existing `PoseFrame → ActionFrame → GameSnapshot` contract is unchanged.
Presentation and recording are independently hosted by
`apps/arcade/src/gameplay`; see its README and typed presentation interface.

`createTrackingPublisher()` is the optional event-driven bridge from a camera
host to that presentation layer. It validates each named-joint `PoseFrame` before
delivery and owns no camera, model, buffering, or persistence. Standalone games
have no subscriber, so publishing a frame does not save it by itself.

## Camera start gesture

`BodyGestures` is the shared named-joint gesture recognizer. Each camera host
creates one instance and calls `update` once per PoseFrame. Its result feeds both
start confirmation and existing pause/resume commands. `HandsStartGate` owns no
recognizer, camera or Worker: it validates readiness, frame/session identity,
freshness, left-hand hold and release from that same result.

Standing games require a left-hand hold above the shoulder for one second with
the right hand down, followed by 400 ms with both hands lowered. A gesture begun
before readiness cannot authorize play. Confirmation never scores. Hosts retain
their existing game-specific calibration and countdown; Motion Quest and Jump Game
use the gate's optional three-second countdown. There is exactly one countdown.
New camera sessions reset confirmation; ordinary in-round tracking recovery does
not add another setup gesture. Push-up Flight reuses its existing head/shoulder
controller and countdown, with no hand gesture or extra detector.

`createHandsStart` provides the common confirmation prompt. `mountGameEntry`
provides the shared introduction, steps and controls on all nine playable routes,
including standalone pages. Hosts pass their native buttons/options; the view
moves them temporarily and restores them before their existing handlers run.
Hosts also pass their catalog `gameId` to display the corresponding local cover
from `game-covers.js`. Arcade cards use the same metadata. Vite bundles these
images for standalone previews, so entry artwork requires no production request.
See [cover artwork and prompts](../../docs/game-cover-art.md).
The entry view never requests a camera or starts inference. Keyboard/pointer
alternatives retain their original controls. The arcade shell still owns
recording, optional microphone/debug controls, feedback and statistics.

`play-style.css` supplies the shared warm material treatment under `clay-play`;
hosts retain their own layouts and control handlers. `clay-draw.js` shades native
canvas pieces using bounded gradients and shadows without owning physics or
camera input. See [the visual loop and evidence](../../docs/clay-play-style.md).
The playable renderers now use transparent cover-matched characters and cached
miniature boards. Illustrated movement poses are shared by guides and hand-start
confirmation. All reusable visual files and original generated sheets live in
[assets/game-art](../../assets/game-art/README.md), including an asset index and
generation briefs. See [the playable visual correction](../../docs/cover-matched-gameplay.md).

## Language preference

`locale.js` stores an explicit shared `hopmodo.language` choice (`en` or `zh`).
Without one, the browser's first preferred language selects Simplified Chinese for
Chinese tags and English otherwise. Automatic detection does not save a choice.
The arcade menu, shared game controls and standalone hosts use the same preference;
a manual change also works for the current page and frames when storage is blocked.
See [translation resources, boundaries and validation](../../docs/multilingual.md).

## Default game audio

Every game defaults to Push-up Flight's prerecorded countdown and original backing
pattern. Existing engines call `scheduleGameMusic` and use `sharedVoiceURL`; their
native action effects remain independent. A documented game-specific requirement
can choose another sound. Shared voice files are bundled by Vite for standalone
and arcade builds. No live speech service or microphone is involved. The arcade
shell owns the control panel and recording indicator. Current acceptance focuses
on the three listed demos: Motion Quest, Push-up Flight and Jump Game.
