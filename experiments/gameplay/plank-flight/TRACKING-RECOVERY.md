# Flight tracking grace

## MVP card

- Target user: a camera player whose head or shoulder briefly leaves the crop.
- Job: recover control of the same flight without flying indefinitely into gates
  while tracking is unavailable.
- Riskiest assumption: freezing and recovering must retain the world, countdown,
  audio stream and local replay without inventing gates or restarting takeoff.
- P1 loop: hold the last position for a 1.5-second capture-time grace period →
  longer loss freezes countdown/flight → 200 ms of fresh consecutive visible
  head-and-shoulder observations resumes the same world and camera.
- Proof: deterministic gate/time tests, synthetic camera loss/recovery, paused
  physics/audio checks, countdown continuity and one playable local replay.
- No-gos: new models/dependencies, push-up counts, automatic permission/retry,
  fabricated controls, or human recognition accuracy claims.
- Appetite: one validated, committed and publicly verified recovery slice.

Manual interruption/backgrounding retains the existing explicit fresh-start
boundary. Finish & rest is available while a flight is paused for tracking and
still records its final encouragement. Terminal camera failure stops resources
and offers an explicit retry; it cannot auto-resume without a camera.

## Evidence

The public `635b73c` release still advanced flight time from 0.05 to 3.67 seconds
through a 3.6-second synthetic head/shoulder loss. This establishes the previous
unbounded world motion separately from the updated local behavior.

Validation covers 27 Flight unit tests, 138 repository tests, all nine game builds,
22 Flight browser scenarios and the arcade's local-replay/audio flow. The gates
are synthetic pose/video input and a separate static public-image model check;
these do not establish human push-up recognition accuracy.

Recovery uses capture time. Isolated valid detections cannot extend grace while
head controls remain held. Silence or delayed/future observations cannot complete
the recovery hold, and a paused world cannot award a gate or advance collisions.
Audio resumes its existing stream without repeating the takeoff announcement.
The native Finish & rest action resumes audio before playing the ending so that
a replay finished during a tracking pause retains its encouragement.

## Later

The hosted Flight privacy disclosure overlaps the native toolbar at 390×844.
The finish/recording flow passes, but the shared shell needs to reserve footer
space so its disclosure and game controls remain readable on narrow screens.
