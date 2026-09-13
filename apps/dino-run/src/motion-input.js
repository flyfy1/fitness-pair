import {createActionController} from '../../../packages/gameplay/input.js';

export function createRunnerMotionInput(runner){
 return createActionController({action:'jump-height',
  accept:frame=>frame.calibrated&&frame.stage==='ready'&&frame.phase!=='missing'&&Number.isFinite(frame.heightRatio)&&frame.heightRatio>=0&&frame.heightRatio<=1,
  apply:(frame,{completed})=>runner.setHeightRatio(frame.heightRatio,{completed}),
 });
}
