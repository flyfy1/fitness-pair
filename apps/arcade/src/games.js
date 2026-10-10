import {gameCovers} from '../../../packages/gameplay/game-covers.js';
import {gameRuntimes} from './game-runtimes.js';
export const games=gameRuntimes.map(game=>({...game,cover:gameCovers[game.id]}));
