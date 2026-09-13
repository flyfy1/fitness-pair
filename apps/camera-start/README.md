# Ready to Move — camera-first setup POC

A standalone experiment for completing game setup while standing away from the
screen. The camera fills the viewport; the current instruction is the primary UI.
This app ends at **Ready to play** and does not launch Dino or another game.

## MVP card

- **Player:** someone standing far enough from a camera for body tracking.
- **Job:** understand the current state and complete setup without reading a sidebar.
- **Risk:** small text and hidden start conditions make successful calibration look stuck.
- **Loop:** enable camera → stand still → choose a comfortable range with the slider → raise one hand
  to confirm → stand steady for three seconds → Ready to play.
- **Proof:** browser geometry and screenshots, synthetic camera flow, readable
  interruption reasons, persisted/exported state logs and camera cleanup.
- **No-gos:** no game, new model, backend, recording, physical-height claims or deployment.
- **Appetite:** one setup loop, a range slider and an optional movement overlay.

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

Production Chrome checks on isolated port 5192 cover viewport camera coverage and
large text at 1440×960, 390×844 and 844×390; slider-based setup without a jump;
hand/button confirmation; changing live response with the slider; optional body
overlay visibility and cleanup; noisy takeoff; interrupted countdowns; persisted
logs; permission recovery and fullscreen. Shared tests verify selected ranges,
input validation and the unchanged default maximum-calibration mode.

Synthetic input proves software transitions, not human recognition accuracy or
readability from a measured physical distance. The user still needs to try this
screen at their actual camera distance. This POC isolates that evaluation from gameplay.

The preview uses its own origin on port 5274. Port 5190 was previously controlled
by an unrelated cached games app in the desktop browser; its cache/storage were
left untouched. This POC registers no Service Worker.

## Short tracking interruptions and noise

The setup POC now opts into debounced recognition. A brief missing-joint or
geometry rejection keeps the existing step visible for 350 ms, retains the
baseline and selected range, and pauses countdown time. Sustained loss shows
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
the switch off, stopping the camera or completing setup clears the overlay.
Nothing is recorded.

**Movement for a full jump** chooses upward torso movement as 10–80% of the
standing torso length, initially 25%. Lower means less real movement for the same
response. This is a relative screen-space setting, not centimeters or a measured
personal maximum. The **Live jump response** meter previews that mapping after
the standing baseline is captured. Trying a movement is optional: standing still
is sufficient to unlock confirmation. The chosen range becomes fixed when
confirmed; **Try again** allows another setup. The chosen value stays for this
page session. No camera-derived baseline is reused across sessions.

The log marks `rangeSource: slider` on confirmation, and records range changes
and overlay toggles. These settings are configuration, never evidence of a jump.
