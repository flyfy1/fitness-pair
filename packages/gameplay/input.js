import {assertActionFrame,sameSource} from '../../contracts/index.js';

// Recognition is optional. Map valid ActionFrames onto a game's semantic controls.
export function createActionController({action,accept=()=>true,apply}){
 let session=null,lastSeq=-1,lastTime=-1;const completed=new Set();
 return {
  reset(value){
   if(!value?.sessionId||!value.source)throw new TypeError('Input session and source are required');
   session={sessionId:value.sessionId,source:{...value.source}};lastSeq=-1;lastTime=-1;completed.clear();
  },
  consume(frame){
   assertActionFrame(frame);
   if(!session||frame.action!==action||frame.sessionId!==session.sessionId||!sameSource(frame.source,session.source)||frame.inputSeq<=lastSeq||frame.tMs<=lastTime||!accept(frame))return false;
   lastSeq=frame.inputSeq;lastTime=frame.tMs;
   const isNewCompletion=!!frame.completion&&!completed.has(frame.completion.id);
   const result=apply(frame,{completed:isNewCompletion});
   if(result!==false&&isNewCompletion)completed.add(frame.completion.id);
   return result!==false;
  },
  dispose(){session=null;completed.clear();},
 };
}
