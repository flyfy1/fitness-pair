import {gameCatalog} from '../game-catalog.js';
import {motionQuestAdapter,plankFlightAdapter,cameraStartAdapter} from './game-adapters/index.js';
import {createNativeAdapter} from './gameplay/runtime.js';
// Cover-free game entries for standalone pages; keep cover images out of this module graph.
const adapters={motionQuestAdapter,plankFlightAdapter,cameraStartAdapter};
export const gameRuntimes=gameCatalog.map(game=>({...game,createAdapter:game.adapter?adapters[game.adapter]:createNativeAdapter}));
