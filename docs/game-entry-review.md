# Game entry and movement readiness review

Review date: 2026-09-19. Baseline: `3964e20`. Evidence is local Chrome with
synthetic PoseFrames; no human recognition accuracy or production deployment is
claimed.

## Current experience

All 11 playable routes passed the existing viewport/entry/exit checks at 1440,
390 and 320 pixels. The eight secondary camera routes waited for both hands and
release. Jump Game's current named entry and left-hand instructions passed.
One legacy clip-link test supplied incomplete clip metadata (`expiresAt` was
missing), producing the generic unavailable screen before the link assertion.
Its fixture must include the current metadata contract.

| Family | Current readiness and entry | Friction |
| --- | --- | --- |
| Motion Quest | Standing calibration, then immediate play | No deliberate ready gesture or countdown |
| Jump Game | Standing baseline, left-hand confirmation, countdown | Different from secondary games |
| Dino Run | Standing + measured range, both-hand gate, countdown | Two BodyGestures instances process the same pose |
| Six Integ AR games | Torso baseline, optional practice, both-hand gate, countdown | Two BodyGestures instances; start and pause share a gesture |
| Dino AR | Shoulder baseline, both-hand gate, immediate play | No countdown; keyboard is the initial mode |
| Push-up Flight | Existing head/shoulder readiness, countdown | Hands must remain available for physical support |
| Orbit Pop | Pointer concept; no camera | Keep explicitly labeled as a concept |

## P1 acceptance

- Player: someone switching between movement games.
- Job: recognize the same entry screen and readiness instructions, then start one
  round without repeated permission, inference or calibration.
- Main risk: a shared gate could consume a gesture twice, turn confirmation into
  a gameplay action, or reset a confirmed baseline on a brief tracking gap.
- Loop: common entry UI → existing camera/recognizer → shared confirmation using
  that recognizer's existing gesture output → one countdown → gameplay.
- Standing default: left hand held for one second, then hands lowered; both hands
  remain available for pause/resume where supported. Push-up Flight reuses its
  existing head/shoulder readiness and does not request a hand gesture.
- UI reuses the native action buttons/handlers. No second camera, model Worker,
  landmark pass or game-specific calibration is introduced by the entry view.
- Proof: unit tests for frame/session/freshness and pre-readiness gestures;
  browser checks for all routes, one camera/Worker per attempt, release before
  play, restart/cancel, keyboard/pointer alternatives, and mobile layout.
- Out of scope: changing physics, claiming human movement accuracy, replacing
  all game HUDs, introducing a detector service, and unrelated debug-upload
  release fixes. The existing shared recording/control shell remains in charge.
