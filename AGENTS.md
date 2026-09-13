# Fitness Pair — Agent and Team Working Agreement

## Default language

**English is the default for all repository artifacts: code, documentation,
comments, identifiers, UI copy, commit messages, pull requests, and experiment reports.**
Conversation with the user may be in Chinese. Do not infer that a Chinese user
message authorizes Chinese repository content. Use another artifact language only
when explicitly requested. Preserve exact quotations and third-party names when
translation would change their meaning. This overrides older Chinese defaults
for project artifacts, not the language of the conversation.

## Product and scope

Fitness Pair explores local camera-based movement controls for games. The current
integration baseline is Motion Quest: calibrate standing posture, squat, stand up
to attack, and complete five repetitions. Validate that loop before adding breadth.
Do not imply multiplayer exists because of the project name.

## Read first

1. `README.md`: setup, boundaries, and current evidence.
2. `contracts/README.md` and `contracts/index.d.ts`: shared interfaces.
3. `CONTRIBUTING.md`: ownership, experiments, and integration procedure.
4. The README of the directory you are changing.

## Ownership and parallel work

- `apps/motion-quest/`: integration host, camera permission/lifecycle, UI wiring.
- `contracts/`: shared data semantics, type definitions, validators, fixtures.
- `packages/pose-mediapipe/`: baseline local model and named-joint adapter.
- `packages/action-squat/`: baseline action recognizer and calibration.
- `packages/action-jump-height/`: relative jump-height calibration and recognition.
- `apps/dino-run/`: runner game, camera-height POC host and calibration UI.
- `packages/game-forest/`: game rules and rendering.
- `experiments/pose-models/`, `action-recognition/`, `gameplay/`, `evaluation/`:
  independent explorations. Work under `<track>/<experiment-slug>/`.

Claim a concrete directory and task before parallel work. Use separate branches
or worktrees for multiple writers; never have two agents edit the same files.
Use read-only scouts/reviewers when useful, one integration owner, and one bounded
review pass. Do not invent team members or assign people without their agreement.

## Contract rules

- Keep the pipeline `PoseFrame → ActionFrame → GameSnapshot`.
- Producers adapt to named joints. Never leak model-specific index arrays into
  other modules. UI mirroring must not alter recognition coordinates.
- Preserve input timestamps, session IDs, and camera/replay/synthetic provenance.
- A completed action has an explicit stable event ID. Progress alone never scores.
- Recalibration must not reuse completion IDs. Games must deduplicate events.
- A breaking contract change requires a short proposal and agreement from the
  affected module owners before merging, plus adapters, fixtures, and tests.
  Routine compatible implementation changes do not need an extra approval step.
- Do not introduce an event bus, plugin platform, backend, or new dependencies
  unless required by a demonstrated experiment or the current playable loop.

## Evidence and safety

- Label synthetic inputs, public fixtures, replay, and human trials separately.
- Never claim screenshots, successful builds, or synthetic tests prove human
  recognition accuracy, exercise quality, calories, or health outcomes.
- Keep camera frames local by default. Do not record, upload, or commit private
  recordings, identifying landmarks, credentials, datasets, or model weights.
- User consent is required before collecting participant recordings. Store any
  authorized local data under ignored `data/` or `.local/` directories.
- Stop owned media tracks and model workers on cancellation, failure, page exit,
  and completion. Bound model initialization and stalled-inference timeouts.
- Do not stop unrelated user processes. Local preview servers are not production
  services; do not infer a deployment target from the checkout location.

## Validation and delivery

- Run the smallest relevant tests; run `npm test` and `npm run build` for shared
  module or contract changes. Run browser checks when the playable path changes.
- Verify using this checkout; never silently reuse a preview from another repo.
- Commit independently verified work, stage only task-owned files, and push the
  working branch promptly. Preserve other people's uncommitted work.
- Treat every independently verifiable checkpoint as a delivery: validate,
  review the diff, commit, and push before starting the next checkpoint. Do not
  wait for the entire feature or another reminder; no extra permission is needed
  for these routine commits and pushes within the agreed task.
- Report each checkpoint's branch, commit, checks, push result, and remaining
  work. If validation or push fails, report the blocker and do not claim delivery.
- Use `codex/<short-task>` for agent branches unless the user specifies otherwise.
- Push checkpoints to the task branch. When the agreed task is complete, merge
  its verified commits into the agreed integration branch (default: `main`) and
  push that branch. This routine integration of task-owned work is authorized;
  do not stop at a pushed worktree branch or request another reminder.
- Before integration, fetch the latest target, review the complete merge diff,
  and run relevant checks on the integrated result in a clean worktree. Preserve
  concurrent work and never overwrite teammates' history to resolve a rejected push.
- Verify the remote integration branch contains the completed commits and report
  the result. Remove only task-owned temporary worktrees after confirming they
  contain no uncommitted work or local data to preserve. If integration is blocked,
  report the blocker and outstanding merge instead of claiming the task complete.
- Keep PRs narrow: problem, changed behavior, evidence, remaining limitations.
- Do not merge another contributor's work or publish a public service unless
  authorized. Ordinary local development and validation should proceed directly.
