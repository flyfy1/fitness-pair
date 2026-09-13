# Recognition Lab

A standalone local skeleton capture and regression app. Uses the same full-window,
mirrored camera AR layout as Ready to Move. It does not require a running game.

## MVP card

- **User:** the developer/player collecting their own movement examples.
- **Job:** preserve a recognition failure and reproduce it after a code change.
- **Risk:** a recognizer cannot be debugged from a screenshot or a total score alone.
- **Loop:** start capture → stand to calibrate → move → mark a problem → stop →
  scrub skeleton and recorded state → annotate a test window → rerun → export.
- **Proof:** persisted capture survives reload; unchanged replay preserves timing;
  labeled expected count/state detects a deliberately failing regression.
- **No-gos:** no uploads, backend, private data in Git, video recording, new model,
  or claims of exercise quality/recognition accuracy. Human trials remain separate.
- **Appetite:** one capture-to-regression loop using the existing squat and jump recognizers.

## Run

```sh
npm ci
npm run dev --workspace recognition-lab
```

Open <http://127.0.0.1:5276> on localhost (or use HTTPS for camera access).
Choose Squat or Jump height, then **Start capture**. This explicitly starts local
skeleton collection, including calibration. Squat: stand, squat, return upright.
Jump height: stand, make one comfortable calibration jump, land, then repeat.
Jump uses the baseline automatic maximum calibration, not Dino's slider profile.
The live cue shows the recognizer's actual state. Keep your full body in frame.

Camera frames are processed locally and discarded. The app retains named 2D
joints, confidence, original sampling time/session/source, recognizer output and
sample-to-result delay. This delay is not an end-to-end motion latency metric.
**Mark issue** (or M outside form fields) bookmarks the latest sampled frame;
these notes are not ground truth. Stop before annotating a case.

## Local data and regression cases

Browser IndexedDB stores sessions, with an autosave every two seconds and a final
save on stop. A sudden browser/process exit may lose the last unsaved interval.
A session is bounded to five minutes or 9,000 frames; reaching either limit stops
capture and saves. Storage errors are visible and in-memory JSON export remains
available. No session is silently evicted. Delete individual sessions explicitly.
Origin/port changes create a separate browser library; export before moving hosts.

Select a session, scrub or play at original timing, and compare **Recorded** with
**Current replay**. Replay always begins at frame zero to preserve calibration and
other temporal context; a selected test window only limits assertions/scoring.
The original camera envelope remains in the file. Reruns use fresh replay session
IDs and replay provenance, retaining input sequence numbers and timestamps.
Synthetic demonstrations remain labeled synthetic evidence.

Set **Window start/end** using the current frame, enter an expected completion
count, and **Save test case**. A completion count is optional; state assertions can
stand alone. Use **Expect current state** to assert the phase you manually select
at the scrubbed frame. Mark only what you personally observed; recorded recognition
is not ground truth. Expected counts check totals, not event-level accuracy.
Cases keep the full calibration prefix, window bounds, notes and state assertions.
Re-run after a recognizer change; JSON reports include current recognizer identity,
observed counts and pass/fail per assertion. Unannotated sessions are **UNLABELED**,
never passing tests. A matching count does not measure false/missed events.

**Export JSON** saves a portable local recording/test case. Imports are validated,
bounded to 32 MiB and reject malformed envelopes, mixed sessions/models, nonmonotonic
time, invalid observations and out-of-range annotations. Imports get a new local
library ID so they cannot overwrite an existing session. Browser file selection is
local; nothing is uploaded. Store private exports only in ignored paths, for example:

```sh
mkdir -p apps/recognition-lab/data
# Move your exported JSON into that ignored directory, then:
npm run replay --workspace recognition-lab -- data/my-case.json
```

The CLI emits a JSON report and returns 1 for a failing or unlabeled case, 2 for
invalid input. It never writes input data. Tests committed here are synthetic only.
To improve a case, revisit an issue marker, widen the test window, correct manual
expectations or add a state assertion, then export again. Preserve original examples
when comparing algorithm changes. This app does not automatically tune thresholds.

## Validation

```sh
npm run test --workspace recognition-lab
npm run build --workspace recognition-lab
npm run test:browser --workspace recognition-lab
```

Browser checks use a production build on isolated port 5277. Synthetic camera
checks and real-model public-image checks are labeled separately. They prove
software capture/replay/storage, not the user's movement recognition accuracy.
