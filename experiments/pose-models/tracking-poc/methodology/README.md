# Tracking methodology explorer

## MVP card

- Target user: the project owner comparing movement-control approaches.
- Job: inspect current methods, their evidence, fit, limitations and source directories.
- Riskiest assumption: useful comparison is possible without conflating landmark models, gesture rules and game integration, or inventing accuracy rankings.
- Loop: choose a scenario/status → inspect method cards → compare up to three methods → follow evidence or open the existing lab.
- Success proof: browser filters, comparison selection/limits, navigation, accessible narrow layout and a production build.
- No-gos: new tracking algorithms, camera collection, synthetic accuracy ratings, external services or libraries.
- Owned paths: this directory, the parent Vite multi-page input, parent navigation and overview browser test.
- Stop: one working comparison page with source-backed qualitative tradeoffs.

Open `/methodology/` from Tracking Lab's existing Vite development or production
preview server. The lab's top navigation links here. Build with the existing
`npm run build` in `experiments/pose-models/tracking-poc/`.

The catalog summarizes checked-in implementation and the dated repository research
review; research entries are candidates, not freshly reproduced releases. Source
links are pinned to the inspected baseline commit. There are no fabricated quality
scores or cross-device speed rankings. Human accuracy remains unmeasured.

The page does not request a camera. Comparison selection is temporary page state;
no user data is persisted. The seven implemented entries include two parameterized
views of the same pose model and two heuristic cues, not seven independent models.
The retained standalone hand folder is explicitly identified as a historical host.

## Verification — 2026-09-13

On Apple Silicon macOS with installed Chrome, the production build and four
existing adapter/geometry tests passed. All 15 production browser cases passed
on isolated port 5190, including three new overview checks and the existing
12 tracking/model/lifecycle cases. The new checks exercise scenario/layer/search
filters, empty-state recovery, three-method selection limits, cross-layer notices,
selection retention across filters, source links, lab navigation, zero camera
requests from the overview, and horizontal table scrolling at 390px. Desktop and
narrow viewport screenshots were inspected. Generated outputs remain ignored.

These checks prove the overview interaction and preserve the lab path. They do not
add comparative tracking-accuracy evidence to the catalog.
