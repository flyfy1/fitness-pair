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

## Implemented experience

The 11 playable routes now share one entry view, language selector, back link,
setup steps and native action buttons. Flight settings are expandable so the
camera/demo controls remain in the first viewport. Orbit Pop remains a labeled
pointer concept. Existing game HUDs and calibration requirements are retained.

Standing routes share a one-second left-hand confirmation followed by release.
Motion Quest and Dino AR now get a three-second countdown. Flight preserves its
head/one-shoulder readiness. The entry view never opens a camera; the gate consumes
the host's one BodyGestures result. Dino Run and the six Integ AR hosts no longer
compute that command gesture twice. This removes duplicated gesture processing,
not a second MediaPipe model (none was present in the original implementation).

## Verification and remaining evidence

- Shared unit tests: 95 passed; Dino Run host tests: 20 passed; Jump host tests:
  9 passed. Production build passed.
- Ten standing camera routes each passed start/release checks with exactly one
  camera request and one model Worker; both-hands holding cannot start a round.
- All 11 entry routes checked at 1440×1000, 390×844, 320×740 and 844×390. Visual
  inspection found and corrected Flight's inherited slider translation and
  small-screen overflow. Tutorial start/skip/back remain accessible.
- Permission denial/retry, English/Chinese switching before camera access,
  cancellation cleanup, five-squat completion and restart, Flight's hands-free
  start, feedback/replay and Jump's brief tracking interruptions passed.
- The completed-round retry test now dismisses the existing feedback dialog via
  View replay before using the native replay button. No product feedback behavior
  changed for this fixture correction.
- Human trials are still needed for lighting, distance, physical comfort and
  false/missed movement recognition. Synthetic poses prove flow and lifecycle,
  not real-person detection accuracy. This change is not deployed yet.

The standalone Jump Game check also exposed a language selector covering Stop
camera. A declarative language-control slot now places it inside the native
header layout. During shared confirmation, the previous step strip and movement
settings are hidden to avoid competing with the large prompt; they return when
confirmation completes.

The focused standalone Jump Game regression finished with 10/10 passing
(replay confirmation, wrong/short hand gestures, interrupted countdown diagnostics,
mobile cleanup, crouch/missing/noisy setup recovery, confirmed countdown recovery,
distant-player prompts and small shoulder lift). The final prompt layout also
passed a two-test mobile/landscape recheck after removing legacy overlap.
