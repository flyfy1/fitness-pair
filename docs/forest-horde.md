# Forest horde MVP card

- Player: the existing five-squat Forest Guardian player.
- Job: defend an animated mage from approaching guardians while seeing the camera.
- Risk: a decorative marching loop without attack response would feel disconnected.
- Loop: start → guardians approach → squat charges mage → stand casts → front guardian recoils and dissolves → next guardian steps forward → five hits clear the wave → local replay/retry.
- Inputs: existing real camera pipeline, synthetic named-joint browser fixtures and labeled keyboard demo; desktop and phone.
- Output: transparent character-only play layer with state-driven character animation, approach and local spell effects.
- Proof: approaching positions change, each deduplicated action defeats one guardian, progress alone does not; camera remains visible below characters; five actions end with camera/worker cleanup and decoded local replay.
- Boundaries: recognition thresholds, shared contracts, recording/privacy/audio ownership unchanged; no new loss/timer penalty or dependencies.
- Appetite: one five-enemy wave; deeper levels and damage/loss rules are later.

## Implementation and evidence

Approach is a presentation clock separate from scoring. Five indexed guardians
move along one lane; completed actions remove the front one, whose last position
is retained for its projectile and recoil. Waiting at the front creates no health
loss or extra scoring. Setup and missing tracking do not advance the wave.
Six generated action poses live alongside their source sheet and generation
brief in `assets/game-art`. Walking pose swaps, breathing, casting recoil and
hit dissolution are bounded canvas animations. Reduced motion keeps static poses
and readable fading feedback. Teal comet ribbons, lightning, rune charging and
local impact rings retain the existing 460 ms flight and 1.8 s ending window.
No full-screen flash or opaque floor is added to the camera view.

2026-10-03 validation: 142 shared/app unit checks, all nine builds, five arcade
browser cases and two spell/sound/reduced-motion browser cases passed. The wave
case uses synthetic video and named-joint input: approach, five real recognizer
completions, transparent lower canvas, native replay decoding, retry and immediate
owned camera/worker cleanup. No participant footage is collected or uploaded.
This evidence does not establish human movement recognition accuracy.
