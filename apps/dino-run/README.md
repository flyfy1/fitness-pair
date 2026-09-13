# Dino Run

A standalone endless runner for Fitness Pair. Jump over cacti, build a score,
and try again. No camera or pose-model assets are required.

## MVP boundary

- **Player / job:** someone trying the arcade, completing a quick runner round.
- **Assumption:** jumping and avoiding obstacles is a useful game loop to pair
  with movement controls later. Human playtesting must establish whether it is fun.
- **Loop:** start → jump → clear obstacles → score and accelerate → collision → retry.
- **Proof:** automated physics checks and actual desktop/mobile Chrome interactions,
  including pause, retry, and best-score persistence across reloads.
- **Scope:** one dinosaur, ground obstacles, keyboard/touch controls, local best score.
  Movement recognition, additional characters, accounts and leaderboards come later.
- **Time box:** one playable local prototype, stopping after the loop is verified.

## Run

From this directory, with Node.js 22.12+:

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5180. In the repository workspace, use
`npm run dev --workspace dino-run` after installing dependencies.

Space / Arrow Up jumps; touching the game or the Jump button also works.
P / Escape pauses or resumes. Leaving the tab/window automatically pauses;
returning does not automatically resume. Holding a key does not repeat jumps.
One jump is allowed at a time. Best score is stored locally when a round ends;
the game remains playable when browser storage is unavailable.

```sh
npm test
npm run build
npm run test:browser
```

Browser tests run against this app's production build in installed Google Chrome,
on port 5180. Close any existing server on this port before running them.
The static output is `dist/`. This prototype has no configured public deployment.

## Game / movement boundary

`src/engine.js` owns physics, obstacles, scoring and round state, independent of
the DOM, camera and recognition model. `src/render.js` owns the canvas presentation.
`src/main.js` maps browser inputs into game commands.

The source movement prototype is `second-brain/projects/260913-motion-quest`.
Its migration is owned separately: `packages/pose-mediapipe` produces `PoseFrame`,
and `packages/action-squat` produces `ActionFrame` under the repository contracts.
Dino Run does not import or duplicate their recognition code.

The future host can call the same boundary used by keyboard/touch:

```js
window.dinoGame.command('start');
window.dinoGame.command('jump'); // true if accepted; false when airborne/inactive
window.dinoGame.command('pause');
window.dinoGame.command('resume');
window.dinoGame.command('restart'); // only after game over
window.dinoGame.getState();
// { status, score, distance, passed, jumps, speed, airborne, best }
```

For a same-page input adapter, the equivalent DOM event is:

```js
window.dispatchEvent(new CustomEvent('fitness:action', {
  detail: { action: 'jump' },
}));
```

This is a game-command boundary, **not** an `ActionFrame` or evidence that an
exercise happened. The future adapter must validate `ActionFrame`, bind the
selected session/source/action, reject stale input, and deduplicate
`completion.id` before mapping a completed action to one `jump`. Progress alone
must not trigger a jump. Input received while paused/airborne is ignored rather
than queued; tracking loss should pause and require explicit resume.

`dino:state` emits a snapshot on round-state transitions. The runner snapshot is
specific to this game; it does not claim to implement the forest game's current
health/target-repetition `GameSnapshot` contract. Agree a compatible runner
snapshot with the contract owner when integrating.

The current speed and obstacle spacing are tuned for buttons. A physical squat
takes longer than a button press; human trials must tune the pace before claiming
the runner works well with exercise. No camera integration or human motion
accuracy has been tested in this app.
