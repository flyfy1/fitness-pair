import {gameCatalog} from '../game-catalog.js';
import {motionQuestAdapter,dinoARAdapter,plankFlightAdapter,cameraStartAdapter} from './game-adapters/index.js';
import {createNativeAdapter} from './gameplay/runtime.js';
const adapters={motionQuestAdapter,dinoARAdapter,plankFlightAdapter,cameraStartAdapter};
export const games=gameCatalog.map(game=>({...game,createAdapter:game.adapter?adapters[game.adapter]:createNativeAdapter}));
