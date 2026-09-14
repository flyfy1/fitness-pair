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

`createTrackingPublisher()` is the optional event-driven bridge from a camera
host to that presentation layer. It validates each named-joint `PoseFrame` before
delivery and owns no camera, model, buffering, or persistence. Standalone games
have no subscriber, so publishing a frame does not save it by itself.

## Camera start gesture

`HandsStartGate` consumes named PoseFrames using the existing BodyGestures
recognizer. Participating hosts choose a setup boundary for this gate. Both wrists
must be visible above the shoulders for one second, followed by 400 ms with both
hands down. A missing/stale frame or loss of readiness resets the attempt. Reset
the gate for every camera session; hide its view on teardown. It emits permission
to begin, never a scoring ActionFrame. Camera permission still requires a button.

Jump Game does not use this gate; after standing calibration, a one-second
left-hand raise or the Confirm & continue button leads directly to the countdown.

`createHandsStart` provides the large instruction overlay for participating
camera routes, with transparent text and no panel or progress bar. Pointer and keyboard previews keep their existing controls.
Motion Quest and Push-up Flight do not use this gate: standing calibration and
the head/one-shoulder countdown respectively begin immediately after camera setup.

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
