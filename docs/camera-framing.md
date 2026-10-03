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
