# Voice replay and shared demo audio

The current delivery focuses on Motion Quest, Push-up Flight and Ready to Move.
The arcade host owns one microphone control, its permission/capture state, HUD
space reservation and fullscreen placement in `src/gameplay/controls.js`. Games
must not add their own copies or per-game placement rules. The mic stays off until
the player enables it; blue means ready and red means actively recording.

Voice is stored independently from the game video. Replay now listens to it by
default, scheduling decoded audio against the video clock so recorded WebM needs
no seek index. Pause, seek, volume, playback rate and the listening toggle stay in
sync, including replays encoded at 2× speed. The original video is preserved; including voice in a downloaded/shared
video is explicit, and never uploads it automatically.

`soundtrack.js` contains Push-up Flight's original backing pattern. The three demo
engines share it, retaining their native action effects. `voice-assets.js` bundles
one copy of each original default countdown/cue asset per game build. Existing
countdowns use those files. Ready to Move now supplies its stable mixed game audio
to the host recorder. Its animation runner also uses the existing motion-input
adapter after the base engine's old pose methods were removed.

Local verification uses synthetic inputs only:

- 77 repository tests and 61 game/backend/deployment tests passed.
- Three demo layouts passed at 1440, 390 and 320 pixels; screenshots were reviewed.
- Voice capture, permission denial/cancellation, decoded audible replay, explicit
  mixed export and original preservation passed browser checks.
- Native browser microphone capture used a prerecorded synthetic test source;
  fullscreen placement and persisted voice after reload passed.
- Flight recording retained backing music, final speech and mute/unmute changes.
- Motion Quest retained charge, final projectile/impact, victory and game sound.
- Ready to Move completed calibration, the three-two-one-start sequence and a
  saved replay containing game sound.

These checks do not measure physical microphone quality or human motion accuracy.
Release acceptance checks the exact public commit, served assets and these same
recording flows at https://fitness.integ.life.
