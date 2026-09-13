# Gameplay track

**Hypothesis:** one specific feedback or pacing change makes the short movement-controlled loop easier to understand or more appealing to replay than `packages/game-forest/`.

Run `npm run explore:gameplay` from the repository root. Claim `experiments/gameplay/<experiment-slug>/`. Consume `ActionFrame` and expose `GameSnapshot`. Develop with contract-compatible replay or synthetic events so model work is not a dependency.

**Deliverables:** one playable variation, its action mapping, a deterministic event fixture, and a short comparison protocol. Declare an observable outcome such as time to first successful interaction, rule-comprehension errors, or voluntary replay. Record observations and limitations; store private participant material in ignored `data/`, generated runs in ignored `runs/`, and any downloaded weights in ignored `models/`.

**Acceptance:** each completion scores once; progress and cues do not trigger attacks; session/provenance boundaries remain intact. Instructions and feedback are readable at the intended camera distance. Synthetic checks establish rules only; enjoyment or usability claims require actual participant observations. Do not imply multiplayer, exercise-quality assessment, calories, or health outcomes are implemented.

**Stop:** compare one variation with the baseline, complete one review pass, and select keep, revise, or reject. Do not expand characters, levels, or action vocabulary before the tested loop supports that decision.
