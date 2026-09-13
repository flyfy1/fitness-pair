# Game integration audit — 2026-09-13

Freshly fetched baseline: `90afd3f89d4f986191d513985256df533b2667aa`. Integration owner used the isolated
`codex/game-integration-audit` checkout. This is a finite branch sweep.

## Result and merge decision

No genuinely missing game changes were found among the existing local and remote
branches. Every remote task branch except `codex/hopmodo-endcard` is an ancestor
of the baseline. Do not create redundant merges based solely on commit IDs.

`dd39ee59209bacd57b5e4b04f91a943e438ce772` on the endcard branch was cherry-picked
as `17c943387ddfefa5cfe83145e0cdcd87038ef742` on main. Both have stable patch ID
`67570f45ec5c06da1b123f981f1b6da9290a6231`; `git cherry` marks the former equivalent.
The entire `apps/arcade/src/clip-compositor.js` file is also identical between
that branch and the baseline. No duplicate patch was applied by this sweep.

Recent improvements already integrated include:

- `c657e5b`: camera setup and calibrated jump controls connect to the playable Dino loop.
- `c2deccd`: Push-up Flight holds head position through tracking loss while obstacles
  continue, with live gate opening, speed and acceleration controls.
- `3294afb`: Dino AR has separate keyboard simulation of movement input.
- `7d261ca`: Hopmodo automatically records rounds as branded device-local replays.
- `c8e656d`: Recognition Lab preserves complete skeleton framing in replay review.

This sweep adds only this audit record. It preserves Hopmodo branding and automatic
local replay behavior; no source, contract, dependency, hosting, or identity change
is needed. No participant recording was collected.

## Remote branch inventory

After `git fetch origin --prune`, the following 37 remote task branches were
compared by ancestry, ahead commits and stable patch equivalence:

| Branch | Tip | Disposition |
| --- | --- | --- |
| `codex/camera-game-flow` | `90afd3f` | Contained in main |
| `codex/camera-start-poc` | `c62c128` | Contained in main |
| `codex/checkpoint-workflow` | `5982f09` | Contained in main |
| `codex/dino-ar` | `74b65ff` | Contained in main |
| `codex/dino-ar-detection-fix` | `e3f85bc` | Contained in main |
| `codex/dino-ar-keyboard-input` | `741d535` | Contained in main |
| `codex/dino-ar-large-playfield` | `3e5818f` | Contained in main |
| `codex/dino-ar-quick-start` | `0b7d510` | Contained in main |
| `codex/dino-ar-range-hud` | `0556021` | Contained in main |
| `codex/dino-ar-shoulder-controls` | `ec47775` | Contained in main |
| `codex/dino-fullscreen-halfbody` | `7e2435b` | Contained in main |
| `codex/dino-gesture-controls` | `d709194` | Contained in main |
| `codex/dino-jump-height-poc` | `488545c` | Contained in main |
| `codex/english-sharing` | `8a1dd10` | Contained in main |
| `codex/english-tracking` | `b4e42ca` | Contained in main |
| `codex/gesture-lab` | `da6eaaa` | Contained in main |
| `codex/gesture-ratings` | `3a4aa01` | Contained in main |
| `codex/hand-tracking-integration` | `c28840f` | Contained in main |
| `codex/hand-tracking-poc` | `7d31c42` | Contained in main |
| `codex/hopmodo-clips` | `f1f46c8` | Contained in main |
| `codex/hopmodo-endcard` | `dd39ee5` | Patch-equivalent; no merge needed |
| `codex/jump-crouch-fix` | `56b2534` | Contained in main |
| `codex/jump-detection-poc` | `9bced15` | Contained in main |
| `codex/jump-noise-filter` | `4ec151f` | Contained in main |
| `codex/kinetic-arcade` | `257ebad` | Contained in main |
| `codex/monitor-hopmodo-integration` | `29dcaeb` | Contained in main |
| `codex/monitor-sharing-errors` | `873fa82` | Contained in main |
| `codex/motion-quest-ar` | `afb0b96` | Contained in main |
| `codex/motion-quest-large-status` | `f09e986` | Contained in main |
| `codex/play-brand` | `c7d2491` | Contained in main |
| `codex/recognition-lab` | `c8e656d` | Contained in main |
| `codex/result-sharing` | `593b934` | Contained in main |
| `codex/setup-slider` | `5d08f09` | Contained in main |
| `codex/skeleton-default` | `f024011` | Contained in main |
| `codex/tracking-methods` | `d34f816` | Contained in main |
| `codex/tracking-poc` | `61c3d6d` | Contained in main |
| `codex/worktree-integration` | `ce85f0f` | Contained in main |

The six pre-existing local branches were also checked:
`codex/hopmodo-clips`, `codex/hopmodo-endcard`, `codex/hopmodo-latest-games`,
`codex/kinetic-arcade`, and `codex/play-brand`, plus local `main` (the integration
branch, not a task branch). Only the endcard branch was not an ancestor; its patch
is equivalent as described above. Local `main` was three commits behind the
baseline and was left untouched in the other user's checkout.

The deleted remote `codex/plank-helicopter` reference was pruned by fetch. Its
recent Flight improvement `c2deccd` remains present in main. No local branch was
deleted and no other worktree or uncommitted work was altered.

## Readiness evidence

Validation runs against this checkout's production builds. Results are synthetic
software checks and public-image inference, not human movement accuracy evidence.

All checks passed:

| Check | Result |
| --- | --- |
| `npm ci` | Installed locked dependencies |
| `npm test` | Shared contracts and jump-height recognition passed |
| `npm run test --workspace @fitness-pair/motion-quest` | Shared/app checks passed |
| `npm run test --workspace dino-run` | 18 passed |
| `npm --prefix experiments/gameplay/dino-ar test` | 10 passed |
| `npm --prefix experiments/gameplay/plank-flight test` | 12 passed |
| `npm run build` | Arcade, Motion Quest and Dino Run built |
| `npm run build --workspace camera-start` | Passed |
| `npm --prefix experiments/gameplay/dino-ar run build` | Passed |
| `npm --prefix experiments/gameplay/plank-flight run build` | Passed |
| `CI=1 PREVIEW=1 npm run test:browser` | 7 passed |
| `CI=1 npm run test:browser --workspace dino-run` | 15 passed |
| `CI=1 npm run test:browser --workspace camera-start` | 15 passed |
| `CI=1 npm --prefix experiments/gameplay/dino-ar run test:browser` | 13 passed |
| `CI=1 npm --prefix experiments/gameplay/plank-flight run test:browser` | 9 passed |
| Audit content review and `git diff --check` | Passed |

The 59 production Chrome checks used five isolated servers from this checkout
with existing-server reuse disabled. Coverage includes calibration, synthetic
play-throughs, pause/retry, tracking loss/recovery, responsive geometry, permission
denial/cancellation, owned camera/worker cleanup and public-image local inference.

Initial model preparation was blocked by sandbox DNS; a permitted download also
timed out. Validation then used a copy of the official public model from the
publishing task's cache, verified against pinned SHA-256
`59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`.
All runtime assets were rebuilt here, and every model copy remains ignored.
The sandbox also blocked preview listening; browser checks passed with permission
for local servers and Chrome. No unrelated preview was reused or stopped.

## Separate publishing work

The concurrent task **Design bold movement arcade landing** owns
`apps/arcade/`, `scripts/build-arcade.mjs`, Sites configuration and game replay
bridge updates. At this baseline the aggregate arcade build includes Motion Quest
and Dino Run; source integration alone does not expose Dino AR, Push-up Flight or
camera-start on the public arcade. That task is adding those mounts and adapters,
then validating and publishing. This sweep neither merges its unfinished work nor
deploys or calls Sites tools. GCP credentials are absent; no policy or identity
changes were attempted.

During final refresh, main advanced to `e1cf383` through a concurrent merge of
the equivalent endcard branch. `git diff 90afd3f e1cf383` is empty: the tested
source tree is unchanged, and all 37 inventoried branches are now ancestors of
main. The audit branch fast-forwarded to that commit before delivery. No branch
from the inventory remains deliberately excluded or pending integration.

No missing game branch remains for this sweep. Public release and new replay
adapter validation belong to the publishing task. Human recognition accuracy,
physical exercise quality and enjoyment remain unverified.
