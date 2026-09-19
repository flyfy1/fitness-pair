# Fitness Pair

A collaborative workspace for local camera-based movement controls and games.
The current integrated baseline, Motion Quest, uses five squats to defeat a forest
guardian over a full-viewport live camera view. Charge and attacks follow the
player in a camera-overlay AR presentation. No multiplayer is implemented by this baseline.

## Run

Use Node.js 22.12+ and a recent desktop Chrome/Edge browser.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5178>. Enable the camera. Keep shoulders through ankles visible, turn slightly sideways,
and stand upright for about two seconds to calibrate. Raise your left hand for one second, then lower both hands for the countdown.
Squat to charge, then stand to attack. The button/Space preview is labeled synthetic.
The arcade homepage preloads tracking files without camera access. Games reuse verified device-cached files when browser storage is available; first-time and uncached starts show download progress in Motion Quest.

Dino Run in `apps/dino-run/` now offers a calibrated jump-height POC. Start it
with `npm run dev --workspace dino-run` at <http://127.0.0.1:5180>. Enable the camera,
stand still, then make one maximum comfortable jump and return. Raise your left hand
for one second to confirm the measured height, then lower both hands for a
three-second countdown. Raise both hands for one second to pause or resume,
lowering them between commands. Dino follows your relative torso rise and descent. Height is a percentage of
your own calibration, not centimeters. Keyboard mode remains available separately.
See [Dino setup and evidence](apps/dino-run/README.md).

Gesture Lab is a separate hand-control POC. Start it with
`npm run dev --workspace gesture-lab` at <http://127.0.0.1:5182>. Explore seven
built-in hand poses and an experimental sideways wave: thumbs up confirms;
waving side to side says No. See [the gesture catalog and trial instructions](apps/gesture-lab/README.md).

A full-camera Dino flow is available at <http://127.0.0.1:5274> with
`npm run dev --workspace camera-start`. Large instructions guide standing, automatic movement setup,
a large left-hand confirmation prompt and a spoken countdown into Jump Game.
Raise your left hand for one second with your right hand down; no confirmation
button is needed, and tracking interruptions preserve the saved setup step.
Skeleton debug view stays live; raise both hands to pause or resume. Detection-only
mode remains at `/?mode=detect`. Local runtime logs explain blocked steps and round
results. See [camera controls and gameplay](apps/camera-start/README.md).

Recognition Lab is an independent AR skeleton capture and replay app at
<http://127.0.0.1:5276>: `npm run dev --workspace recognition-lab`. Capture movement
locally, bookmark recognition failures, and turn annotated windows into replayable
regression cases. See [capture, privacy and test workflow](apps/recognition-lab/README.md).

## Integ movement AR games

The arcade adds six source-adapted Integ Games: Brick Pulse (torso paddle),
Pixel Defense (torso steering + raised-hand fire), Perfect Stack and Orbit Knife
(raised-hand timing), Bubble Pop (right-wrist aim + left-hand fire), and Fruit Orbit
(torso aim + raised-hand drop). All use local camera AR with a live torso/limb
overlay, standing calibration, tracking-loss pause and the shared local replay flow.
See [all 20 source games and movement mappings](docs/movement-game-mapping.md).
Start the standalone set with `npm run dev --workspace @fitness-pair/integ-ar`
at <http://127.0.0.1:5284/?game=breakout>, or choose a game in the arcade below.

## Arcade landing page and local clips

`npm run build` now builds the complete arcade, including Motion Quest and Dino Run.
Run `npm run preview:arcade` and open <http://127.0.0.1:5191>.
`npm run build:motion-quest` retains the standalone baseline build.
The arcade lives in `apps/arcade/`; game sources remain independently owned.
Gameplay records automatically to IndexedDB on the player’s device. Branded MP4
exports use a supported native encoder, with an explicitly labeled WebM fallback.
Full replays can produce a short local copy for website sharing. Gallery publication is enabled on
`fitness.integ.life` with a shared 10 GB anonymous public-upload pool and 2 GB per-account storage.
Anonymous shares last seven days, with the oldest anonymous videos replaced when the pool is full.
Accounts can choose 1, 7, 30, or 90 days, or no expiry; private links let friends watch without login. GPT Sites retains its
separate, disabled gallery configuration.
See [arcade details](apps/arcade/README.md) and [GCP setup](apps/arcade/server/README.md).

The complete arcade also has an independent GCP deployment at
[fitness.integ.life](https://fitness.integ.life). See the
[GCP deployment workflow](apps/arcade/deploy/gcp/README.md). It keeps the GPT Sites
deployment separate and preserves the original sharing studio at `/highlights`.

## Team map

```text
apps/motion-quest/          Playable host, camera lifecycle, UI wiring
contracts/                 v1 types, validators, semantics, fixtures
packages/pose-mediapipe/    Local model and named-joint adapter
packages/action-squat/      Temporal action recognition
packages/action-jump-height/  Standing/max-jump calibration and continuous height
packages/game-forest/       Pure game rules and separate canvas renderer
experiments/pose-models/    Model/runtime alternatives
experiments/action-recognition/  Counting and movement algorithms
experiments/gameplay/       Mechanics using mock action events
experiments/evaluation/     Trials and measured comparisons
docs/                      Research and integration notes
tests/                     Shared recognition and contract checks
```

Claim a track and work in `experiments/<track>/<experiment-slug>/`. Team members
have not been assigned automatically. Read [AGENTS.md](AGENTS.md),
[CONTRIBUTING.md](CONTRIBUTING.md), and [the exploration guide](experiments/README.md).
Repository artifacts are English; conversation with the user may be Chinese.

## Shared boundaries

| Contract | Producer → consumer | Contents |
| --- | --- | --- |
| `PoseFrame` | Pose model → recognizer | Named unmirrored joints, dimensions, input time, provenance |
| `ActionFrame` | Recognizer → game | Phase, charge, explicit stable completion ID |
| `GameSnapshot` | Game rules → renderer | Health, repetitions, finished state, consumed events |
| `EvaluationResult` | Experiment → comparison | Evidence type, counts, defined timings, unknown metrics |

See [contract semantics](contracts/README.md), [types](contracts/index.d.ts), and
[JSON examples](contracts/examples/). These boundaries are already used in Motion
Quest. Model indices stay in the pose provider. Calibration cannot charge the game;
only explicit, deduplicated completion events score. Synthetic and camera rounds
have different provenance and cannot mix.

## Explore independently

These commands run synthetic contract fixtures without a camera or model:

```sh
npm run explore:pose
npm run explore:actions
npm run explore:gameplay
npm run explore:evaluation
```

Each track README defines its hypothesis, deliverables, acceptance, and stop condition.
Smoke-check output is not a model benchmark or human recognition evidence.

## Validation

```sh
npm test
npm run build
CI=1 PREVIEW=1 npm run test:browser
```

2026-09-13 migration checks: **15 unit/contract tests and 6 production-browser
tests passed**, including actual local inference on a public image, synthetic
end-to-end victory, English desktop/mobile UI, permission denial, cancellation,
and camera/Worker cleanup. The browser command requires installed Google Chrome
and starts an isolated server on port 5179 (override with `MOTION_PORT`),
leaving the interactive preview on port 5178 available.

Human squat accuracy, phone performance, exercise quality, calories, and player
enjoyment remain unverified. No private recordings, dependencies, model weights, or
generated runs belong in Git. See [app details](apps/motion-quest/README.md) and
[research](docs/research.md).

## Origin

Migrated on 2026-09-13 from `flyfy1/second-brain`, commit `814143e`, path
`projects/260913-motion-quest`. The original remains a historical snapshot;
this repository is the collaborative home. Private notes and unrelated history
were not imported.


## Shared gameplay and optional inputs

The [gameplay host](apps/arcade/src/gameplay/README.md) separates game views and
rules from recording, local replay and sharing. New games register once in
`apps/arcade/game-catalog.js` and implement the presentation API; existing games
use explicit adapters. The [action controller](packages/gameplay/README.md) maps
recognizer output onto game controls independently of the host and recorder.
Dino Run demonstrates direct keyboard/height controls plus an optional motion
adapter. Conversation recording is opt-in and stored as a separate local track;
players can export the original video or a version including conversation.

Standing camera games use one shared deliberate start: raise the left hand above the shoulder for one second, then lower both hands for the countdown. Push-up Flight reuses its head-and-shoulder readiness without a hand gesture. Pixel Defense practice uses large instructions at the top of the AR view. See [the tutorial prototype](docs/invaders-tutorial-prototype.md).
