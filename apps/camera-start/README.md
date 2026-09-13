# Ready to Move — camera-first setup POC

A standalone experiment for completing game setup while standing away from the
screen. The camera fills the viewport; the current instruction is the primary UI.
This app ends at **Ready to play** and does not launch Dino or another game.

## MVP card

- **Player:** someone standing far enough from a camera for body tracking.
- **Job:** understand the current state and complete setup without reading a sidebar.
- **Risk:** small text and hidden start conditions make successful calibration look stuck.
- **Loop:** enable camera → stand still → one comfortable jump/rise → raise one hand
  to confirm → stand steady for three seconds → Ready to play.
- **Proof:** browser geometry and screenshots, synthetic camera flow, readable
  interruption reasons, persisted/exported state logs and camera cleanup.
- **No-gos:** no game, new model, backend, recording, physical-height claims or deployment.
- **Appetite:** this one onboarding loop; verify before adding more controls.

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
hidden tabs and POC completion. Try again starts a fresh camera session.

## Local runtime log

Choose **Log** to inspect recent events or **Download log** to export JSON.
The latest 300 events persist in this browser's local storage under
`camera-start:diagnostics:v1`. **Clear log** deletes them. If storage is blocked,
the current session can still be inspected and exported from memory.

Events include camera initialization/stopping/errors, calibration transitions,
gesture detection, rejected/accepted height confirmation, visible waiting reasons,
countdown start/interruption, and setup completion. Timestamps show their order.
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
npm run build --workspace camera-start
npm run test:browser --workspace camera-start
```

Five Chrome checks pass against a production build on isolated port 5192:
viewport camera coverage and large-text layouts at 1440×960, 390×844 and 844×390;
complete synthetic calibration/gesture/countdown despite cropped wrists; visible
countdown interruption and persisted/downloaded logs; mobile confirmation and
torso-loss rejection; permission-error recovery and native fullscreen exit.
Resource cleanup is checked on completion and cancellation. Runtime model assets
and screenshots are ignored; no participant recordings are included.

Synthetic input proves software transitions, not human recognition accuracy or
readability from a measured physical distance. The user still needs to try this
screen at their actual camera distance. This POC isolates that evaluation from gameplay.

The preview uses its own origin on port 5274. Port 5190 was previously controlled
by an unrelated cached games app in the desktop browser; its cache/storage were
left untouched. This POC registers no Service Worker.

The preparatory-crouch regression covers a one-second crouch, torso unfolding,
takeoff, a crouched landing and upright confirmation. The screen shows **JUMP
PREPARATION** and retains the standing reference; the runtime log records
`prepare-jump` instead of resetting to standing calibration. Six production Chrome
checks and 46 shared/recognizer tests pass for this update. Synthetic coverage does
not replace a trial of the player's actual movement.


## Short tracking interruptions and noise

The setup POC now opts into debounced recognition. A brief missing-joint or
geometry rejection keeps the existing step visible for 350 ms, retains the
baseline and measured maximum, and pauses countdown time. Sustained loss shows
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
