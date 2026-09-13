# Contributing

Read [AGENTS.md](AGENTS.md), [README.md](README.md), and the [contracts](contracts/index.d.ts) first. English is the default for repository artifacts, documentation, code, and UI. Conversation with the user may be in Chinese.

## Claim a bounded task

Before parallel work, state the directory, intended result, and stop condition in the coordinating task. Work in `experiments/<track>/<experiment-slug>/` for exploration. Use a separate branch or worktree for multiple writers; explicitly disjoint file ownership is required in any shared checkout. Do not edit a claimed directory or shared interface concurrently. Do not assign contributors who have not agreed to participate.

| Boundary | Directory | Responsibility |
| --- | --- | --- |
| Integration | `apps/motion-quest/` | Camera lifecycle, permissions, and UI wiring |
| Pose producer | `packages/pose-mediapipe/` | Model execution and named-joint adaptation |
| Action producer | `packages/action-squat/` | Calibration, temporal recognition, completion events |
| Game consumer | `packages/game-forest/` | Event deduplication, rules, and rendering |
| Shared types | `contracts/` | Data semantics, validation, fixtures |

## Preserve the contracts

The integration pipeline is `PoseFrame → ActionFrame → GameSnapshot`. [contracts/index.d.ts](contracts/index.d.ts) also defines `EvaluationResult`; use that definition rather than copying types into experiments.

- Pose adapters emit named joints in unmirrored image coordinates. Model-specific landmark arrays stay inside the adapter.
- Preserve session IDs, input timestamps, sequence references, and camera/replay/synthetic provenance.
- Recognizers emit explicit stable completion IDs. Recalibration must not reuse IDs; progress and cues never award attacks.
- Games consume each completion once and reject incompatible sessions or provenance.
- Evaluation reports label their evidence and timing metric. Unknown ground truth and unavailable measurements remain `null`, never zero.

Discuss breaking contract changes with affected module owners before merging, and include adapters, fixtures, and tests. Routine compatible changes proceed without another approval step.

## Explore, then integrate

Choose one of the [four tracks](experiments/README.md). Keep the baseline playable while testing alternatives. Each experiment records its hypothesis, command, environment, baseline, observations, limitations, and decision in its README. Compare one meaningful variable at a time. Stop after the stated comparison and one review pass; continue only when a specific unresolved finding warrants it.

Keep private input, generated runs, and downloaded weights under ignored `data/`, `runs/`, `models/`, or `.local/` paths. Check ignore coverage before storing anything. Commit small public or synthetic fixtures only when redistribution is permitted and they contain no private information. Participant recording requires consent; ordinary local implementation and testing do not require additional permission.

Run the smallest relevant checks. Shared module or contract changes require `npm test` and `npm run build`; playable-path changes also require a browser check from this checkout. Distinguish camera trials from replay and synthetic checks. Review the diff, stage only owned files, commit the verified unit, and push its branch. Report what changed, the evidence, and remaining limitations.
