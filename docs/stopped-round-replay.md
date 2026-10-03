# Replay after shared Stop game

## MVP card

- Player: someone ending a game early with the shared Stop game control.
- Job: immediately stop camera/model/recording, then watch the saved partial round
  without navigating away or submitting feedback.
- Risk: treating Stop as page unload suppresses the inline replay even though the
  clip is saved, and leaves feedback with no replay entry.
- Loop: camera or demo play → optional pause → Stop game → resources released →
  saved local replay → explicit playback or a fresh game entry.
- Input: Motion Quest demo, synthetic Jump Game/Flight/AR camera rounds, paused
  and active states, unsupported recording, no participant footage.
- Output: normal feedback plus a preparing/ready/unavailable replay action; video
  stays local and poster-first. A stopped game restarts via Play again.
- Proof: browser regression failing before the repair, media teardown before the
  prompt, a durable single clip, decoded playback, no uploads and production proof.
- Boundary: separate stopping a round from disposing its presenter. Reuse the
  current recorder, persistence, feedback and card components. No game rules,
  contracts, camera permission, encoder dependency or publication changes.
- Appetite: repair this observed stop/replay path and deliver it before new games.

## Delivered behavior

The shell stops the recorder's capture and subscriptions before releasing the
game's camera and model. The recorder keeps its local replay presenter alive
while encoding and persistence finish. Feedback offers Preparing video, View
replay or Video unavailable without requiring a rating. View replay focuses the
current clip, and its Play again action opens a fresh game entry. Page exit still
disposes the presenter and releases its resources.

Replay thumbnails keep their image visible beneath the shared clay-style play
button. Playback remains explicit and no video is uploaded automatically.

## Verification

The new Motion Quest regression failed before the repair because the saved clip
had no inline replay card. On 2026-10-03, 138 unit checks, all nine builds and 15
browser cases passed after the repair. Browser cases cover stopped Motion Quest,
Jump Game, Flight and AR Breakout rounds, immediately ended owned media tracks
and model workers, IndexedDB persistence, explicit decoded playback, fresh entry,
unsupported recording, feedback, consecutive storage-failure download fallbacks,
entry retry and Flight tracking grace/recovery/audio.

All camera input is synthetic. These checks prove lifecycle and playback paths;
they do not measure human movement recognition accuracy. Production browser and
served-asset checks follow deployment from clean, pushed main.
