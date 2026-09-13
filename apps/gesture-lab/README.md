# Gesture Lab — local hand-control POC

An independent app for exploring seven built-in MediaPipe hand poses and an
experimental sideways wave. Thumbs up means **Confirm**; waving side to side
means **No**. A still open palm and thumbs down do not trigger No.
The existing [Tracking Lab](../../experiments/pose-models/tracking-poc/README.md)
remains the landmark/cursor/pinch observation tool; this app tests categorical
gestures and discrete commands with the same installed runtime family.

## MVP card

- **Target user / job:** a player trying camera hand gestures as simple controls.
- **Riskiest assumption:** a short held thumbs up and a deliberate sideways wave
  can be separated from incidental movement with usable responsiveness.
- **P1 loop:** enable camera → see the named gesture and confidence → hold thumbs
  up or wave → see Confirm / No and a session counter → release and repeat.
- **Success proof:** production browser model inference on a public fixture,
  synthetic temporal/command integration, lifecycle checks, then a human trial.
- **No-gos:** recordings, uploads, physical measurements, sign-language
  translation, custom model training, backend, or changes to existing games.
- **Appetite:** this one standalone POC; stop at a runnable, tested trial surface.

## Run

From the repository root, using Node.js 22.12+ and recent desktop Chrome / Edge:

```sh
npm ci
npm run dev --workspace gesture-lab
```

Open <http://127.0.0.1:5182>. Allow camera access, keep one complete hand in view,
and face the palm toward the camera in good light. Hold thumbs up for roughly
half a second. For No, spread your fingers and move your palm left → right →
left (or the reverse). Lower your hand briefly between completed actions.
The feed is mirrored for display; recognition coordinates are not mirrored.

First preparation downloads the official float16 v1 gesture model from Google's
model bucket. SHA-256 is pinned to
`97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482`.
The script copies the existing `@mediapipe/tasks-vision` 0.10.32 runtime locally.
Runtime assets, model weights, build output and tests' public-image cache are
ignored. The running app requires no external requests and never records or
uploads camera frames. Camera access requires localhost or HTTPS.

## Complete supported catalog

| Gesture | Model category | App behavior |
| --- | --- | --- |
| Thumbs up | `Thumb_Up` | Hold → Confirm |
| Wave side to side | App-local temporal rule | Three alternating horizontal legs → No |
| Thumbs down | `Thumb_Down` | Recognition only |
| Open palm | `Open_Palm` | Live recognition; basis for the wave rule |
| Closed fist | `Closed_Fist` | Recognition only |
| Pointing up | `Pointing_Up` | Recognition only |
| Victory / V | `Victory` | Recognition only |
| I love you | `ILoveYou` | Recognition only |

The official model has seven named static poses and a `None` result for an
unrecognized pose. No detected hand is a separate state. The custom wave is
not a pretrained class. Pinch, OK, arbitrary finger counts and sign-language
translation are outside this model's built-in catalog and this POC.
Source: [Google's Gesture Recognizer Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js).

## Recognition and experimental boundary

- The provider's classic Worker adapts all 21 model indices into named hand
  joints. The host emits a valid `PoseFrame` with named left/right wrists and
  an optional, **app-local** `hands` observation extension. This experiment
  does not change the shared v1 types or another producer's obligations.
- `GestureActions` consumes those frames and emits shared-compatible
  `ActionFrame`s. The session-bound command snapshot consumes unique explicit
  completion IDs only. Input timestamps, sequences and source provenance are
  preserved through `PoseFrame → ActionFrame → command snapshot`.
- Confidence must be at least 0.6. Static actions require 450 ms of fresh,
  continuous classification. Release to no hand / unrecognized pose for 350 ms
  rearms recognition. Open palm remains observable without latching, so a
  held palm can proceed into a wave.
- Wave requires three horizontal legs / two reversals in 300–1,800 ms. Each leg
  exceeds max(7.5% of image width, 65% of apparent wrist-to-middle-knuckle size).
  Vertical drift, scale changes, lost/ambiguous hands, hand-side changes and
  >250 ms gaps discard unfinished motion. Either lateral direction works.
- Camera capture is capped at 30 samples/sec with one inference in flight.
  Results older than 250 ms are treated as missing. Permission/model startup
  is bounded at 30 seconds and stalled inference at 1 second. Stop, cancel,
  errors, camera disconnect, tab hiding and page exit release tracks/Worker.
- Counters and the last eight recognized actions live only in this session.
  Starting again resets them and creates new session/completion IDs.

The optional hand observations and experimental action IDs stay inside this
app until their semantics have been agreed for shared use. Human performance,
false positives from whole-body/camera movement, lighting sensitivity, occlusion,
and hand identity swaps remain unmeasured. Confidence is a model score, not a
probability of human correctness. No gesture is a health assessment.

## Validation

```sh
npm run test --workspace gesture-lab
npm run build --workspace gesture-lab
npm run test:browser --workspace gesture-lab
```

Browser tests run the built app on isolated port 5183 using installed Chrome.
Synthetic observations check held confirmation, wave commands, rearming,
deduplication and rejected motion. Public fixture inference uses Google's
[thumbs-up test image](https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg),
cached only in ignored `tests/.cache/`. Neither is a live human accuracy trial.

Verified on 2026-09-13, Apple Silicon macOS / installed Chrome: 8 app unit tests,
6 production-browser tests and 38 repository tests passed; Gesture Lab and the
baseline Motion Quest both built successfully. Desktop and 390px layouts were
visually inspected. Public-image inference triggered Confirm with no external
browser requests. The initial 0.70 confidence threshold rejected this fixture's
stable tracking score of approximately 0.69; the POC now uses 0.60 with temporal
hold/release requirements. This is a documented tuning observation on one image,
not an accuracy estimate or a calibrated operating point. Wave-to-No is proven
with synthetic observations; real human wave recognition remains to be tried.

For a human trial, try each catalog pose with each hand, repeat Confirm / No,
and check that a still palm, small jitter and one-way movement do not issue No.
Do not record participants without explicit consent. Phone camera performance
and actual gesture success rates remain unverified.
