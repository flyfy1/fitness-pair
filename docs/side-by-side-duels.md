# Side-by-side camera duels

## MVP card

Target user: two people playing together in front of one desktop camera.
User job: compete at the same time with movement controls on one screen.
Riskiest assumption: changing detector result order must not exchange controls.
P1 loop: choose Duel on an existing game entry, enable one camera, independently
calibrate and confirm, share a countdown, control separate boards, compare scores,
and use the shared local replay or restart.
Representative conditions: shoulders and both hands visible, one person per
fixed half of the mirrored camera, with no crossing or center overlap.
Useful output: independent controls and scores, a clear winner or draw, and a
single replay showing both boards.
Success proof: real local model inference with a composed public image, synthetic
browser controls and interruption checks, shared replay/audio decoding, then a
two-person trial for recognition and usability evidence.
No-gos: remote networking, identifying people, changing shared v1 semantics,
uploading frames, or claiming exercise/recognition accuracy from synthetic tests.
Appetite: three suitable existing games and one bounded validation/review pass.

## Play

Perfect Stack AR, Orbit Knife AR and Brick Pulse AR show **Two players · side by
side** on their normal entry screen. The **One player** link returns to normal
play. The mode is also addressable with `?game=stack&mode=duel` (or `knife` /
`breakout`) in the standalone Integ AR host.

Each player keeps their shoulders and hands in their own half of the mirrored
preview. Stay still with hands down for individual calibration. Bring hands
together for one second, then lower both hands. The shared three-second countdown
waits for both confirmations and resets if either player's tracking or hand
position is unsuitable. Original movement controls then operate each board.

The match lasts 60 seconds of active play. Both boards use separate copies of
the same initial random sequence. Scores follow original game rules; Orbit Knife
adds successful hits across its native stage score resets. A lost/won board
freezes while the opponent continues. The match ends when time expires, both
boards finish, or the players select Finish round. A tie is shown as Draw.

Pause freezes both boards and the timer. Either person's held both-hands gesture
can pause without awarding an action. Resume is deliberate: both people return
to their sides with hands down, then press Resume. Missing or stale recognition
pauses immediately to avoid giving the other person an advantage. Recalibration
retains current boards/scores/active time and repeats the setup/confirmation;
Play again resets boards, scores, timer and all recognition session IDs.

## Implementation and privacy

MediaPipe's pinned Tasks Vision model supports `numPoses: 2`, so one existing
worker processes the full camera frame. No second camera, model download or
network service is needed. PoseCamera requests a higher ideal resolution for
the two-person view; actual resolution is device-dependent.

Inside the provider, raw results are adapted to named joints before assignment.
Screen-left means the unmirrored image's right half. Both shoulders must fall
inside the same half and their midpoint must stay outside a central buffer.
No candidate, low confidence, center overlap or multiple candidates in one lane
emits missing joints. Detector array order never decides which player receives
input. Each lane owns a distinct ordinary v1 PoseFrame session, two recognizers
and action consumers remain independent, and completion IDs remain deduplicated.
Input timestamps, camera provenance and unmirrored coordinates are preserved.

These are fixed player lanes. Swapping sides changes who owns the lane; the
system does not recognize physical identities. People must keep their sides.
Games needing more movement space, such as Jump Game and Push-up Flight, remain
single-player. Other standing games are deferred until trials justify extending
the same interaction.

The game composes both boards, mirrored camera, named-body outlines, scores and
timer into its existing presentation canvas. The arcade's shared recorder and
controls consume that canvas and a stable game-audio stream. The common Push-up
Flight voice assets and soundtrack are reused. Setup is excluded from gameplay
recording. No player pose samples are emitted into the single-person sidecar for
duel rounds; the shared recorder retains only empty session metadata. Mixing lane
session IDs into the existing format would misrepresent its contract. Frames
and recordings remain local; publication still uses the existing explicit flow.
Owned tracks, worker, animation loops and audio stop on cancellation, completion,
camera failure, hidden tab and page exit.

## Evidence and remaining limits

`npm test` passes 260 tests and `npm run build` builds all nine existing mounts.
Provider regressions cover detector order changes, absent/ambiguous players,
distinct sessions, common sampling times and lifecycle cleanup. Duel scoring
tests cover Knife stage resets and independent matching random sequences.

Browser checks cover both players' setup, isolated primary/steering controls,
held-hand deduplication, reordered detector results, tracking-loss pauses,
paused physics/timing, retry, restart, cleanup and mobile layout. The real local
model test duplicates Google's public `pose.jpg` side by side and receives two
named-joint frames without external browser frame requests. It is a composed
public fixture, not a two-person recording. Hosted replay checks verify local
video, game-audio decoding and no automatic video upload.

Two-person human trials, low-end phone throughput, crowded-background behavior,
occlusion and comfortable movement space remain unmeasured. No public deployment
is claimed by this change.

## References

- [MediaPipe Pose Landmarker for Web](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js): `numPoses` configures the maximum pose count.
- [Google public pose image](https://storage.googleapis.com/mediapipe-assets/pose.jpg): downloaded only into ignored test cache.
