import {gameCatalog} from '../game-catalog.js';
import {gameCovers} from '../../../packages/gameplay/game-covers.js';
import {motionQuestAdapter,plankFlightAdapter,cameraStartAdapter} from './game-adapters/index.js';
import {createNativeAdapter} from './gameplay/runtime.js';
const adapters={motionQuestAdapter,plankFlightAdapter,cameraStartAdapter};
export const games=gameCatalog.map(game=>({...game,cover:gameCovers[game.id],createAdapter:game.adapter?adapters[game.adapter]:createNativeAdapter}));
