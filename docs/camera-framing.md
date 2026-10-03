# Camera framing and start gestures

## MVP card

- Target user: a player whose camera cannot show their full body.
- Job: choose a game by its actual required tracking area and start without a left-hand raise.
- Riskiest assumption: shoulder-only calibration can steer the existing AR games without hip observations.
- P1 loop: choose Upper body → frame shoulders and hands → calibrate → bring hands together for one second → lower them → countdown → play and pause.
- Representative input: synthetic named joints with hips, knees and ankles absent; missing wrists, short holds and tracking interruptions.
- Useful output: all six AR games calibrate and accept controls without lower-body tracking; setup gestures never enter game rules.
- Proof: recognizer and gate regressions, built-app browser checks, localized category/entry/guide checks, and served release verification.
- No-gos: new pose/hand models, finger classifiers, new dependencies, health/accuracy claims, scoring from setup gestures, or camera uploads.
- Appetite: one compatible change across the existing shared entry, catalog and camera hosts.

## Classification

| Games | Category | Required camera framing |
| --- | --- | --- |
| Brick Pulse AR, Pixel Defense AR, Perfect Stack AR, Orbit Knife AR, Bubble Pop AR, Fruit Orbit AR | Upper body | Both shoulders; both wrists for start/pause; left wrist for primary actions and right wrist for Bubble Pop aim. Hips and legs are optional. |
| Push-up Flight | Upper body | Head and at least one shoulder. Keep a comfortable movement range; its existing automatic countdown remains. |
| Jump Game | Upper body | Both shoulders and hips. Feet may stay outside the frame, but standing space is still needed for its rise-and-return movement. This is not a shoulder-only or seated game. |
| Motion Quest | Full body | Shoulders through ankles, with space to squat and stand. |
| Orbit Pop | No camera | Pointer/touch concept. |

The categories describe **tracking**, not exercise intensity or independent proof of physical jumping. Shoulder games can be played seated. The local pose model still needs human trials with close framing and natural movement.

## Deliberate start

The six AR games and Jump Game use both wrists close together near the center of the upper chest or face. Hold for one second after calibration, then separate and lower both hands for 400 ms. This is proximity of wrists, not recognition of palm orientation, touching, or fingers. Both shoulders and wrists must be fresh and visible. A short hold, missing joints, stale input or a gesture held before readiness cannot start play. Start confirmation never scores. The original left-hand primary actions and both-hands-raised pause remain distinct during play.

Motion Quest retains its left-hand start and full-body calibration. Push-up Flight retains head/shoulder readiness and its automatic start. Jump detection-only mode retains its existing evaluation gesture. No host adds a camera, worker or detector.

## Validation (2026-10-03)

- `npm test`: 146 passing unit regressions, including shoulder-only controls and the compatible start gate.
- `npm run build`: arcade and all nine playable routes.
- Arcade browser checks: categories, localized entries, upper-body illustrations at desktop/phone sizes, eight gesture starts, one camera/worker per start, and compatible Jump URLs.
- Integ AR browser checks: all six original game flows without hips, tutorial, permission/cancellation, primary-action deduplication, pause and tracking recovery (27 passing).
- Jump setup browser checks: invalid raises/short holds, interrupted readiness, retained confirmation, shoulder lift and three viewport sizes (7 passing).

These use synthetic camera images and generated pose outputs, not participant
recordings or human recognition measurements. Close-framing accuracy with the
local pose model still needs a trial using the player’s actual camera.

## Close-framing start correction: MVP card

- User/job: a seated player who joins their hands but remains at the start prompt.
- Observed evidence: a consented three-second local page capture reproduced the
  unchanged prompt with hands together. The rendered wrist markers remained
  separated. Raw PoseFrame coordinates were not captured; this is visual human
  evidence, not a landmark replay or an accuracy measurement.
- Risk: touching palms can leave wrists separated, and the pose model can place
  partially occluded wrists farther apart. The original half-shoulder-width limit
  rejects this geometry; independently normalized x/y also distort face framing.
- Loop: visible shoulders/wrists → centered proximity held one second → explicit
  recognition feedback → separate/lower → existing countdown.
- Acceptance: a deliberately approximate synthetic close-framing case passes;
  separated arms, missing wrists, short holds and stale frames cannot start;
  portrait/landscape geometry uses image aspect; calibration-held gestures tell
  the player to release first; the compact upper-body prompt leaves the chest
  view visible. No new model, camera, recording upload or scoring changes.
- Private evidence stays in ignored `.local/`; regression fixtures contain only
  invented synthetic joints. The real camera must still be retried after release.

Correction validation (2026-10-03): `npm test` passed 150 tests and
`npm run build` built all nine routes. Eleven synthetic browser cases covered
all eight gesture-start routes and the new wrist-spacing case at desktop,
phone and landscape sizes. After reserving shared-control space, the three
new cases passed again, with three additional HUD regressions covering resize,
language changes and fullscreen. Pi/GCP deployment checks passed 27 tests and
gateway checks passed eight. These checks do not replace the player's real
camera retry; no participant frames or joints are included in Git.
