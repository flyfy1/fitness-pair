# Contributing

Read [AGENTS.md](AGENTS.md), [README.md](README.md), and the [contracts](contracts/index.d.ts) first. English is the default for repository artifacts, documentation, code, and UI. Conversation with the user may be in Chinese.

## Claim a bounded task

Use the primary checkout on `main` for development and deployment, with one local worktree by default. Do not create task branches or extra worktrees unless the user explicitly requests isolation. Serialize writers in the shared checkout. Before user-requested parallel work, state the directory, intended result, and stop condition in the coordinating task. Work in `experiments/<track>/<experiment-slug>/` for exploration. Do not edit a claimed directory or shared interface concurrently. Do not assign contributors who have not agreed to participate.

| Boundary | Directory | Responsibility |
| --- | --- | --- |
| Gameplay host | `apps/arcade/src/gameplay/` | Shared viewport, recording lifecycle, optional conversation |
| Presentation adapters | `apps/arcade/src/game-adapters/` | Translate legacy game views; new games prefer the native presentation API |
| Input integration | `packages/gameplay/` | Validate action frames and map to game controls without owning a model |
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

## Deliver each checkpoint

Commit and push every independently verifiable part of the agreed task before
starting the next part. Do not wait until the entire feature is complete or ask
for another reminder. A checkpoint can be a documented decision, a recognizer
fix with a passing regression check, or a playable interaction with browser
evidence. Keep each commit coherent; unfinished work stays outside that commit.

1. Claim the directory, result, and stop condition in a shared issue, PR, or
   coordinating conversation visible to the affected contributors. Work on `main`
   in the primary checkout by default. Fetch the latest remote state and reconcile
   it safely before starting; preserve unrelated uncommitted work.
2. Complete one bounded part and run its relevant checks. Documentation-only
   changes need a content/link review and `git diff --check`; shared code and
   playable-path changes retain the checks specified above.
3. Review the diff and stage explicit owned paths. Inspect the staged diff before
   committing so unrelated work, private data, and generated files stay out.
4. Commit with an English message describing the change and push with
   `git push origin main`. Verify that remote `main` contains the delivered commit.
   For explicitly requested isolation, use `codex/<short-task>` unless another name
   is specified, push that branch, and finish by integrating as described below.
5. Share the branch, commit, changed behavior, checks, push result, and remaining
   work so teammates can fetch the checkpoint. Open or update a narrow PR when
   the checkpoint is ready for review; use a draft if integration is unfinished.

These routine commits and pushes are authorized within the agreed task. Checkpoint
pushes share progress; isolated work also requires the integration below.
Breaking contracts still require agreement from affected owners. Do not merge
another contributor's work without authorization.

If a check fails, fix it or report the blocker before declaring the checkpoint
verified. If a push fails, retain the local commit, report that it is unpushed,
and resolve authentication or remote divergence without overwriting teammates'
history. Do not force-push a shared branch or silently claim the team has the work.

## Finish on main

Normal work is committed and pushed directly on `main`; do not create an extra
branch or worktree just to validate or deliver it. Deployment requires clean,
committed `main` synchronized with remote `main`, plus authorization to publish.
Branch cleanup alone is not deployment authorization.

If the user explicitly requested isolation, a completed task must not remain
only on its temporary branch. Merge its verified,
task-owned commits into the agreed integration branch (default: `main`) and push
that branch before reporting completion. The user authorizes this routine final
integration; no additional reminder or approval is needed. Respect repository
branch protection and any required reviews, and report an outstanding merge if
those requirements block completion.

1. Fetch the latest target branch and inspect the full difference from the task
   branch. Include only the agreed work; a branch that also contains unrelated
   contributions needs a clean integration branch containing the intended commits.
2. Integrate in the existing primary checkout on `main`, without creating another
   worktree. Preserve other contributors' active worktrees,
   uncommitted changes, and local data. Resolve conflicts within the agreed scope;
   coordinate any conflict that requires changing another owner's contract.
3. Review and validate the integrated result with the relevant checks above.
   Push the integration branch without forcing. If the remote advances, fetch,
   integrate its new commits, and validate the resulting changes before retrying.
4. Verify that the remote integration branch contains the delivered commits.
   Report the target branch, integrated commit, checks, and push result. A pushed
   task branch or an open PR alone does not mean integration is complete.
5. Remove explicitly requested, task-owned temporary worktrees after verifying integration and
   checking for uncommitted, untracked, or ignored local data that must be retained.
   Never discard local data or clean up another contributor's active workspace
   without authorization. Finish with the primary checkout on `main`.

If validation, conflicts, branch protection, or access prevent integration, keep
the work available and report the exact blocker and remaining merge explicitly.
