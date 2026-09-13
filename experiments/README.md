# Independent experiments

The current baseline lives in `apps/motion-quest/`, with `packages/pose-mediapipe/`, `packages/action-squat/`, and `packages/game-forest/`. Experiments compare alternatives without rewriting that loop.

| Track | Entry command | Contract boundary |
| --- | --- | --- |
| [Pose models](pose-models/README.md) | `npm run explore:pose` | Camera/replay input → `PoseFrame` |
| [Action recognition](action-recognition/README.md) | `npm run explore:actions` | `PoseFrame` → `ActionFrame` |
| [Gameplay](gameplay/README.md) | `npm run explore:gameplay` | `ActionFrame` → `GameSnapshot` |
| [Evaluation](evaluation/README.md) | `npm run explore:evaluation` | Annotated observations → `EvaluationResult` |

Run commands from the repository root. See [contracts/index.d.ts](../contracts/index.d.ts) for authoritative types and [CONTRIBUTING.md](../CONTRIBUTING.md) for directory claims and integration rules.

Create `experiments/<track>/<experiment-slug>/README.md` before implementation. State the hypothesis, baseline, exact command, deliverables, acceptance criteria, stop condition, and owned paths. No experiment needs to modify another track to produce useful evidence: exchange contract-compatible fixtures instead.

Store private or generated material only in ignored `data/`, `runs/`, `models/`, or `.local/` directories; verify with `git check-ignore <path>`. Keep reproducible configuration and sanitized summaries in Git. Label synthetic, public-fixture, and consented-human evidence separately. A successful build or simulated action sequence does not establish human recognition accuracy or health benefits.
