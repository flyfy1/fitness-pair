# Plank Flight — local video AR experiment

## MVP card

- **Target player:** one person in a side-on camera view, doing a forearm plank,
  high plank, or push-up movement.
- **Job:** turn time holding a support pose into a small, encouraging flight.
- **Riskiest assumption:** the existing local Lite pose model provides sufficiently
  stable side-view landmarks near the floor to recognize support and locate a head.
- **Loop:** enable camera → position full body sideways → hold support for 1.2 seconds
  → fly through obstacles over the live video → release to descend → after a short
  coast, crash softly → encouragement and an explicit fresh start.
- **Success proof:** deterministic named-pose checks and browser interaction,
  camera lifecycle and rendering checks; a real person's playability remains unverified.
- **No-gos:** uploads, recordings, face identification, exercise-quality assessment,
  repetition counting, multiplayer, new dependencies, or changes to other games.
- **Appetite:** one runnable experiment and one bounded review; no additional levels.

## Ownership and baseline

All changes belong to `experiments/gameplay/plank-flight/`. The baseline is Motion
Quest's local MediaPipe model and Dino Run's camera lifecycle. The host preserves
`PoseFrame → ActionFrame → GameSnapshot`; the experiment's provider adds an optional
`head` presentation hint outside the shared joint map, leaving shared v1 unchanged.
Raw model indices stay in `src/pose-provider.js`. The game consumes the experimental
`plank-hold` action: active time controls flight, and time is shown in seconds, never
as completed repetitions. There are no completion events or repetition scores.

Video remains the full background; the person is not removed. Graphics are overlaid
on that video and a local head crop appears in the cockpit when visible. This is
2D video AR, without body segmentation, world anchoring, or depth occlusion.

## Run

From the repository root, install the existing dependencies with `npm ci`, then:

```sh
cd experiments/gameplay/plank-flight
npm run dev
```

Open <http://127.0.0.1:5184>. Use localhost or HTTPS and a recent desktop Chrome.
Keep the camera fixed near your side, with head, shoulders, arms, hips, knees and
ankles visible. A front-facing or head-only view cannot validate this support pose.
Keep the device somewhere visible without changing your posture to watch it.
The English UI follows the repository's artifact-language policy.

## Evidence boundary

Synthetic tests validate geometry, timing, provenance, rendering and cleanup only.
Public-fixture inference validates model plumbing only. Neither proves human plank
or push-up accuracy, exercise quality, health outcomes, or emotional effect.
The experiment recognizes a horizontal supported pose during push-ups; it does not
count repetitions or certify technique. Prone lying and occlusion may be ambiguous
in 2D. If tracking disappears, gameplay pauses rather than treating it as fatigue.
A fresh explicit attempt is required after a tracking failure or camera stop.

The pose model's nose and ear indices follow the
[official MediaPipe landmark definitions](https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/vision/PoseLandmark).
Runtime files and model weights are generated locally and ignored. Camera pixels
and head crops stay in memory and are never saved or uploaded.
