import { createGameState, consumeAction } from '@fitness-pair/game-forest';
import { baselineActions } from '../action-recognition/baseline.mjs';

const actions = baselineActions();
let state = createGameState(actions[0]);
for (const frame of actions) state = consumeAction(state, frame).state;
console.log(JSON.stringify({ note: 'Synthetic action replay; no real workout.', state }, null, 2));
