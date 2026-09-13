# Fitness Pair

A collaborative workspace for local camera-based movement controls and games.
The current integrated baseline, Motion Quest, uses five squats to defeat a forest
guardian. No multiplayer is implemented by this baseline.

## Run

Use Node.js 22.12+ and a recent desktop Chrome/Edge browser.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5178>. Enable the camera, keep shoulders through ankles visible,
turn slightly sideways, and stand upright for about two seconds to calibrate.
Squat to charge, then stand to attack. The button/Space preview is labeled synthetic.
The first start downloads the official Lite model; later starts use local assets.

The parallel Dino Run contribution owns `apps/dino-run/`. When present, start it
independently with `npm run dev --workspace dino-run` at <http://127.0.0.1:5180>.

## Team map

```text
apps/motion-quest/          Playable host, camera lifecycle, UI wiring
contracts/                 v1 types, validators, semantics, fixtures
packages/pose-mediapipe/    Local model and named-joint adapter
packages/action-squat/      Temporal action recognition
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
and fails if port 5178 is occupied; stop your own preview first.

Human squat accuracy, phone performance, exercise quality, calories, and player
enjoyment remain unverified. No private recordings, dependencies, model weights, or
generated runs belong in Git. See [app details](apps/motion-quest/README.md) and
[research](docs/research.md).

## Origin

Migrated on 2026-09-13 from `flyfy1/second-brain`, commit `814143e`, path
`projects/260913-motion-quest`. The original remains a historical snapshot;
this repository is the collaborative home. Private notes and unrelated history
were not imported.
