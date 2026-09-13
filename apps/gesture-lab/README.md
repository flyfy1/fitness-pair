# Gesture Lab — local hand-control POC

An independent app for exploring seven built-in MediaPipe hand poses and an
experimental sideways wave. Thumbs up means **Confirm**; waving side to side
means **No**. A still open palm and thumbs down do not trigger No.
The separate **Rate 1–5** mode recognizes documented finger-number patterns
and previews one rating after a stable hold. Ratings are session-only and are
not yet connected to a game's scoring or saved to a server.
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
unrecognized pose. No detected hand is a separate state. The custom wave and
finger numbers are not pretrained classes. Pinch, OK, arbitrary finger patterns
and sign-language translation are outside this POC.
Source: [Google's Gesture Recognizer Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js).

## Rating POC: 1–5

Choose **Rate 1–5**, enable the camera, and face one palm toward it. Hold the
number still for 700 ms to preview a rating. Lower the hand for at least 350 ms
before the next rating. Holding a number or changing directly to another number
does not submit repeatedly. Switching modes stops the camera, clears the preview
and starts a new session on the next enable. Confirm / No stays inactive in
rating mode, so V means 2 and a still open palm means 5.

| Rating | Documented pattern |
| --- | --- |
| 1 | Index finger extended; other fingers and thumb folded |
| 2 | Index and middle fingers extended; other fingers and thumb folded |
| 3 | Index, middle and ring fingers extended; pinky and thumb folded |
| 4 | Four fingers extended; thumb folded across the palm |
| 5 | All five fingers extended and spread |

The extension uses the existing named 21-joint hand observations; no model,
dependency or shared contract change is needed. `ratings.js` corrects image
aspect ratio, checks finger joint angles and reach, and distinguishes an open
thumb from a thumb folded across the palm. Ambiguous, incomplete, cropped or
too-small hands produce no rating. Rules use distances/angles instead of
screen-up or left/right assumptions. A thumbs up is not 1, and the I Love You
pattern is not 3. Other regional ways of signing numbers are not supported.

Numeric holds require a stable wrist position and apparent hand scale; movement,
tracking gaps, changing hand side or number restart the hold. A continuously
waving palm does not rate, but a deliberate still pause can eventually rate 5.
Ratings are experimental geometry, not a learned numeric classifier, and there
is no numeric confidence percentage. Canned gesture scores do not gate numeric
recognition because 3 and 4 can legitimately have a canned result of `None`.
Oblique views, folded-finger occlusion and partial bends still need human trials.

The MVP addition is one loop: show a number → hold → see `Rate N/5` and the last
rating → release → repeat. `Rating_1` through `Rating_5` are app-local action IDs
with unique completion IDs. The existing session-bound consumer deduplicates
them. Persistent ratings, aggregation and game integration remain later work.

Rating extension verified on 2026-09-13: 14 app unit tests and 8 production Chrome
tests passed, alongside 38 repository tests and both app builds. Synthetic named
hands exercise all five values, reflection/rotation, rejected inputs, movement,
release and mode isolation. Google's public `victory.jpg` runs through the real
model and geometry to produce `Rate 2/5`, with no external browser requests.
The first geometry draft rejected that image's folded thumb; projecting the
thumb direction relative to the palm replaced the inadequate distance-only rule.
Desktop and 390px rating layouts were visually checked. Numeric 1, 3, 4 and 5
have synthetic evidence only; all five values still need live human trials.

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
  These canned-class rules apply to Confirm / No mode; numeric rules are above.
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
