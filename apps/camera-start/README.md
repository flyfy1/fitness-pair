# Ready to Move — camera-controlled Dino POC

A standalone experiment for completing game setup while standing away from the
screen. The camera fills the viewport; the current instruction is the primary UI.
After setup, the default page runs **Dino** over the live camera. The existing
AR scene and runner engine are reused; this app supplies the calibrated movement
controls. The standalone jump detection test remains at `/?mode=detect`.

## MVP card

- **Player:** someone standing far enough from a camera for body tracking.
- **Job:** complete setup, then control a dinosaur using comfortable body movement.
- **Risk:** a short body jump must trigger a complete, smooth Dino arc; longer
  observed rise-to-return time should produce a higher arc without noise or pause
  time increasing height.
- **Loop:** enable camera → stand still → automatic movement setup → raise
  one hand to confirm → three-second countdown → rise and return to control Dino
  → clear cacti or collide → see results → play again.
- **Proof:** production-browser synthetic setup, duration-based animation, obstacle
  clearance, collision, replay, pause/resume, tracking recovery and camera cleanup.
- **No-gos:** no new game engine, model, backend, recording, physical-height claims
  or deployment.
- **Appetite:** connect the existing controls to the existing playable game, keep
  the skeleton, readable instructions, local logs and isolated detection mode.

## Run

```sh
npm ci
npm run dev --workspace camera-start
```

Open <http://127.0.0.1:5274>. Enable the camera once, then follow the large text.
The page fills its window immediately; the top fullscreen button optionally enters
native fullscreen. Camera permission requires localhost or HTTPS.

The desktop primary instruction is 64–112 px, supporting instruction 26–38 px,
and current status 22–34 px. Smaller windows retain large text and a single next
action. The camera is mirrored and fills the whole viewport; joints cropped out
of that visible image cannot satisfy calibration or gestures. Both shoulders and
hips must be visible. Both wrists are needed only for the confirming hand gesture.
A large **Confirm & continue** button is available as an alternative.

The existing Dino camera, torso-height recognizer, gesture recognizer and local
model are reused directly. There is no second recognition implementation.
Unlike Dino's prior start gate, this POC does **not** require wrists to reappear
below the shoulders after confirmation. Confirmation is the intent to continue;
only fresh, valid, steady torso tracking gates the three-second countdown.
Interrupted tracking clearly states why the countdown stopped and restarts it
when steady tracking returns. Long torso loss/position drift still recalibrates.

Camera tracks and the model worker stop on cancellation, errors, page exit,
hidden tabs, collision and **Finish run** / **Finish test**. Finishing setup keeps
the camera active. Play again starts a fresh camera session and resets the round.
Manual pause keeps tracking active so the player can resume with a gesture.

## Local runtime log

Choose **Log** to inspect recent events or **Download log** to export JSON.
The latest 300 events persist in this browser's local storage under
`camera-start:diagnostics:v1`. **Clear log** deletes them. If storage is blocked,
the current session can still be inspected and exported from memory.

Events include camera initialization/stopping/errors, calibration transitions,
gesture detection, rejected/accepted height confirmation, visible waiting reasons,
countdown start/interruption, setup completion, jump start/return/detection and
test pause/finish, game start/pause/resume, obstacles cleared and round results.
Each `jump-detected` carries a stable event ID and count. Timestamps show their order.
Logs contain no image/video, body coordinates or landmarks and are never uploaded.
The view shows the latest 40 entries; the JSON contains the retained 300 entries.
`window.cameraSetup.getState()` and `.getLog()` expose the same compact diagnostic
state for local checks, without images or coordinates.

When setup appears stuck, the most useful events are `height-confirmed`,
`countdown-started`, `countdown-interrupted` and the following `screen-state` reason.
For example, `stale-tracking` means frames are at least 250 ms old or missing;
`not-grounded` means torso height has not returned to its calibrated baseline;
`missing-hands` blocks gesture confirmation, but never a confirmed countdown.

## Evidence

```sh
npm run test --workspace camera-start
npm run build --workspace camera-start
npm run test:browser --workspace camera-start
```

Production Chrome checks on isolated port 5192 cover viewport camera coverage and
large text at 1440×960, 390×844 and 844×390; automatic setup without a jump;
hand/button confirmation; live response to small movement; optional body
overlay visibility and cleanup; noisy takeoff; interrupted countdowns; persisted
logs; permission recovery and fullscreen. Shared tests verify selected ranges,
input validation and the unchanged default maximum-calibration mode.

Synthetic input proves software transitions, not human recognition accuracy or
readability from a measured physical distance. The user still needs to try this
screen at their actual camera distance. Detection-only mode isolates recognition
evaluation from gameplay. The game checks additionally cover animated Dino
jumps, clearing a cactus, collision, replay, button/gesture pause and resume,
tracking-loss freezing, camera restart without resetting the round, and visible
controls at the three viewport sizes above. Animation unit tests compare short
and long cycles with identical movement amplitude, reject single-frame spikes,
verify no stacked jumps, freeze on pause, check 30/120 FPS consistency and
ensure the longest arc lands within one second. Browser audio checks measure
real Web Audio output and cover countdown, pause, mute, cancellation, missing
audio support, tab hiding and page exit.

The preview uses its own origin on port 5274. Port 5190 was previously controlled
by an unrelated cached games app in the desktop browser; its cache/storage were
left untouched. This POC registers no Service Worker.

## Short tracking interruptions and noise

The setup POC now opts into debounced recognition. A brief missing-joint or
geometry rejection keeps the existing step visible for 350 ms, retains the
baseline and movement scale, and pauses countdown time. Sustained loss shows
tracking guidance; after 750 ms of rejected observations calibration resets.
Rejected frames never contribute height, landing evidence or confirmation.
Three-sample median filtering rejects isolated height spikes, while a 180 ms
instruction debounce prevents jump/confirm prompts from rapidly alternating.

`tracking-signal` records transitions, rejection reason, rejected duration and
input sequence. `tracking-hold-started` / `tracking-hold-ended` show when the
screen held its previous instruction and for how long. Logs remain local, bounded
and free of images or body coordinates.

Regression coverage includes mixed low-confidence/geometry/missing frames during
crouch-to-takeoff, a single coherent height spike, and a short countdown interruption
that resumes without restarting. Shared tests additionally check long loss,
silent gaps, drift and observed landing requirements. The new thresholds still
need a trial with the user's camera and natural movement.


## Movement controls

**Skeleton debug view** is on by default and shows a live skeleton over the
mirrored camera as soon as tracking starts. It uses only visible, confident named
joints. The switch can hide it. It aligns with the video's cover crop;
missing/stale joints are cleared rather than displayed as a frozen body. Turning
the switch off, stopping the camera or completing a round clears the overlay.
Nothing is recorded.

Movement setup is automatic after standing still. There is no range slider or
maximum-jump requirement. The response scale uses 15% of standing torso length;
this is a relative screen-space scale, not centimeters or a personal maximum.
The **Live jump response** meter previews movement after baseline capture.
A coherent rise reaching 12% of this response scale can trigger the animation;
its final height depends on observed movement duration. Stand upright and raise
one hand (or click **Confirm & continue**) to start the countdown.

Each camera session captures a new baseline. The log marks `rangeSource: automatic`
and the fixed response scale on confirmation, and records overlay toggles.
These settings are configuration, never evidence of a jump.


## Play Dino

The default `/` route finishes the countdown into a running game. The player's
rise triggers a dinosaur jump after a 30 ms animation buffer. Two or more
coherent rising samples over at least 60 ms are required before triggering.
The dinosaur follows its own continuous trajectory, so the player's return does
not snap it to the ground. Longer observed rise-to-return time sustains lift
for longer, creating a higher arc; lift is capped at 250 ms. A short movement
still produces a complete arc (about 0.72 seconds, versus about 0.95 seconds at
full lift). New movements during an arc do not queue or stack extra jumps.
The automatic movement scale sets the trigger threshold; the response meter
continues to show the raw movement mapping, not the dinosaur's animated height.
There is no mandatory maximum jump. Half-body tracking still requires both
shoulders and hips. The scene comes from `experiments/gameplay/dino-ar/src/scene.js`
and the motion-mode rules from `apps/dino-run/src/engine.js`.

The left playfield shows the dinosaur, ground and incoming cacti. The jump prompt
moves closer to each cactus to match the shorter arc. Large cues
announce **Jump!**, **Cleared!** and confirmed jumps; the controls show score,
cacti cleared, confirmed jumps and the live movement meter. Score and cleared
count stay in a compact top-right HUD. The larger settings panel is hidden by
default in game mode; click **Settings** to show the sound and skeleton toggles,
movement meter and **Finish run**. Click Settings again, outside the panel, or
press Escape to close it. Hiding settings does not hide the skeleton or resize
the game world. Score advances with
running distance; jump counts come only from explicit completed movement events.
The full-camera background and default skeleton stay live during play.

Raise **both hands for one second** to pause or resume, lowering them between
commands. **Pause** and **Resume run** buttons provide the same controls. Resume
requires fresh tracking at the standing baseline, so movement made while paused
does not score. Tracking loss immediately freezes obstacles and score; brief loss
resumes when valid tracking returns. Sustained loss requires setup again, keeping
the current round and score. **Stop camera** releases the camera; **Resume with
camera** starts a new tracking session, repeats setup and continues that round.

A collision or **Finish run** shows the results and stops owned camera tracks and
the model worker. **Play again** resets the score and counts and returns to setup.
Local diagnostics also include `dino-jump-triggered`, `dino-body-returned`,
`dino-jump-landed` and `dino-jump-ignored`. The observed duration excludes the
recognizer's landing confirmation hold. It measures a tracked torso cycle, not
verified physical airtime. Pauses or lost tracking discard the in-progress
duration measurement and freeze animation along with the world.

Local diagnostics include `game-started`, `game-paused`, `game-resume-blocked`,
`game-resumed`, `obstacle-cleared` and `round-finished`, alongside the existing
jump detection events. No camera images or skeleton coordinates are recorded.

## Jump detection test

Select **Jump detection only** or open `/?mode=detect`. Once standing confirmation
and countdown succeed, **Try a small jump** starts the test. Skeleton and response meter stay live. **Moving up** and
**Coming back down** indicate the recognizer's current motion. **Jump detected!**
is shown for 1.8 seconds after an explicit completed action; the confirmed count
stays visible, and a new rise can immediately start another cycle. A stable
completion ID prevents duplicate counts. Setup motions are not counted.

No maximum jump or range adjustment is required.
Detection still requires coherent upward movement above the standing reference,
multiple observed samples and a stable return. A preparatory crouch alone,
standing still, or an isolated noise spike does not count. No count is inferred
from a missing frame. Sustained loss invalidates calibration, pauses testing and
requires the standing/confirmation/countdown steps again; previously confirmed counts
remain until the user starts a fresh camera session.

The test uses the existing upper-body recognizer, so **detected jump** means a
tracked torso rise-and-return cycle, not independently verified feet leaving the
floor. Feet can stay outside the picture. It is a movement-control POC, not a
physical jump-height measurement. Peak response is a percentage of the automatic
response scale and is not centimeters.

**Finish test** shows the count and stops the camera and worker. The local log
includes `jump-test-started`, `jump-started`, `jump-returning`, `jump-detected`,
`jump-cancelled`, `jump-test-paused` and `jump-test-finished`. No skeleton coordinates
or camera images are recorded. Production-browser synthetic regressions cover two
successive cycles, persistent confirmation, default skeleton rendering, responsive
controls, noise rejection, loss recovery, setup-only movements and cleanup.
Human detection accuracy still requires a trial at the user's camera distance.


## Sound

Game mode reuses the neighboring Plank Flight experiment's bundled English
**Three, two, one, start** speech and Web Audio synthesis helpers. The spoken
numbers follow the visible countdown; interrupted or cancelled countdowns cancel
queued speech. A new attempt can announce the numbers again.

Dino adds a playful 128–156 BPM chip melody, bass and drums, a rising jump sound
aligned to the dinosaur's takeoff animation, a soft landing thump, a four-note reward
for clearing a cactus, encouragement every third clear and a descending crash
sound. Finishing manually plays a closing chord and local encouragement. Music
stays quieter than speech. No external music service or microphone is used.

Audio is unlocked by **Enable camera**. **Settings → Game sound** mutes all layers
without changing the round. Pause, tracking loss, cancellation and a hidden tab
stop scheduled sounds; finishing lets only its brief ending cue play before
suspending audio. Page exit closes the owned audio context. Missing sound support
or unavailable voice files leave the visual game usable. The local log includes
`audio-cue` and `sound-changed`; diagnostics expose audio state and active nodes.

`prepare:assets` copies the existing local voice WAVs into ignored `public/audio/`
for standalone and arcade builds. Their source and synthesis provenance remain in
`experiments/gameplay/plank-flight/README.md`; no private recording is introduced.
