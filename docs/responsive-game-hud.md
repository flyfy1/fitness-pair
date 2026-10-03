# Responsive shared game controls

## MVP card

- Player: someone playing Motion Quest, Jump Game or Push-up Flight on a phone.
- Job: read the game title/status and reach language, stop, microphone and native
  game controls without overlapping or clipped controls.
- Risk: a fixed shared-control reservation squeezes the native HUD, and changing
  language or game state changes the width of the shared controls.
- Loop: enter → start camera/demo → read status → pause or stop → local replay.
- Conditions: 320/390px portrait, 844px landscape and desktop, English/Chinese,
  synthetic camera or keyboard/pointer input, no participant recording.
- Output: a separate shared-control row on narrow screens, measured reservation
  on wide screens, native status/guidance below the occupied header area.
- Proof: failing geometry regression before the repair; playable browser checks,
  local replay and cleanup; served production assets and browser behavior.
- Boundary: shared shell owns common controls; native hosts own their following
  status/guidance. Preserve recognition, physics, audio and recording ownership.
- Appetite: fix the observed header obstruction, validate and deliver it before
  unrelated features.

## Verification and follow-up

The old Jump Game layout failed the new phone regression: native controls were
outside the viewport and overlapped the title. The repair measures the shared
control width on wide screens and places it in a separate row at 700px and below.
ResizeObserver tracks language/state changes, header wrapping and footer text;
fullscreen and resize events update the same layout. Host padding is read afresh
at each viewport size. Motion Quest/Jump Game consume the measured header bottom
for status, guidance and settings placement. Existing AR tracking/control rows
and Flight's deliberate hiding of initial setup options are preserved.

Checks on 2026-10-03: 138 unit checks and all nine builds; browser coverage of the
three legacy HUDs at 320/390/844/1440px, English/Chinese configurations, native
fullscreen, entry/retry, feedback cleanup, bilingual Flight footers, six AR local
camera replays and Flight grace/recovery/audio. All camera input is synthetic.

The expanded stop-path check uncovered a separate existing behavior: shared Stop
game saves a local clip but disposes the inline replay presenter and offers no
View replay action in its feedback dialog. Layout is a separately verified
checkpoint; the stopped-round replay entry remains the next repair.
