import {startRollingRecorder} from './rolling-media.js';
import {createTrackingCapture,isSessionUUID} from './tracking-recording.js';
import {drawClipFrame,recordingSize} from '../clip-compositor.js';

export const DEBUG_CAPTURE_MS=5000,DEBUG_CAPTURE_BYTES=8*1024*1024;
const cameraLive=video=>video?.srcObject?.getVideoTracks().some(track=>track.readyState==='live')&&video.readyState>=2&&video.videoWidth>0;
export function createDebugCapture(game,runtime,{onProgress=()=>{}}={}){
 let operation=null,disposed=false;
 return {
  get active(){return !!operation;},
  start(){
   if(disposed)throw Error('This game has closed.');
   if(operation)return operation.result;
   const snapshot=runtime.readFrame(),includesCamera=cameraLive(snapshot?.video);
   if(!snapshot?.canvas?.width||(!includesCamera&&!['playing','paused','ending','complete'].includes(snapshot.phase)))throw Error('Start the camera or a game preview before recording debug.');
   const canvas=document.createElement('canvas'),size=recordingSize(runtime.getViewport?.()||snapshot.layout||snapshot.canvas);
   canvas.width=size.width;canvas.height=size.height;
   const context=canvas.getContext('2d'),stream=canvas.captureStream(24);
   const sessionId=isSessionUUID(snapshot.sessionId)?snapshot.sessionId:crypto.randomUUID();
   const source=snapshot.source||{kind:includesCamera?'camera':'synthetic',id:sessionId};
   const startAt=performance.now(),inputStartAt=runtime.getInputTime?.()??startAt,createdAt=Date.now(),contexts=[];
   const tracking=createTrackingCapture({sessionId,source,game:game.id,startedAt:inputStartAt,createdAt,maxDurationMs:DEBUG_CAPTURE_MS});
   let recorder,raf,timer,unsubscribe=()=>{},settled=false,resolve,reject;
   const result=new Promise((yes,no)=>{resolve=yes;reject=no;});
   const cleanup=()=>{cancelAnimationFrame(raf);clearTimeout(timer);unsubscribe();stream.getTracks().forEach(track=>track.stop());};
   const finish=async error=>{
    if(settled)return;settled=true;cleanup();
    try{
     const recorded=await recorder?.stop();
     if(error)throw error;
     if(!recorded?.blob?.size)throw Error('The browser returned an empty debug recording.');
     const selected=contexts.filter(sample=>sample.videoMs>=recorded.startSeconds*1000&&sample.videoMs<=(recorded.startSeconds+recorded.duration)*1000+50).map(sample=>({...sample,videoMs:sample.videoMs-recorded.startSeconds*1000}));
     resolve({clip:{id:crypto.randomUUID(),sessionId,createdAt,width:canvas.width,height:canvas.height,duration:recorded.duration,source:includesCamera?'replay':'synthetic',inputSource:source,stopReason:'Debug capture',finalScore:snapshot.score||null,blob:recorded.blob,tracking:tracking?.finish(recorded)||null},snapshot,
      diagnostics:{format:'fitness-pair/debug-capture/1',durationMs:recorded.duration*1000,contexts:selected}});
    }catch(failure){reject(error||failure);}finally{if(operation?.result===result)operation=null;}
   };
   operation={result,cancel:()=>finish(Error('Debug recording canceled.'))};
   try{
    // Only this canvas stream is owned; do not request or stop the game's camera.
    drawClipFrame(context,{...snapshot,includesCamera,title:game.title,branded:false});
    recorder=startRollingRecorder(stream,{maxBytes:DEBUG_CAPTURE_BYTES,maxSeconds:6,segmentSeconds:5,onError:error=>finish(error)});
    unsubscribe=runtime.subscribeTracking(frame=>{
     if(settled||!tracking||!tracking.add(frame))return;
     // Hosts publish PoseFrame before computing recognition; read its result after that callback.
     queueMicrotask(()=>{if(settled||contexts.length>=400)return;const current=runtime.readFrame();contexts.push({videoMs:frame.tMs-inputStartAt,inputSeq:frame.seq,phase:current?.phase||null,recognition:structuredClone(current?.recognition||null)});});
    });
    function paint(){
     if(settled)return;
     try{
      const current=runtime.readFrame();
      if(!current||current.round!==snapshot.round)return void finish(Error('The game restarted during debug capture.'));
      if(includesCamera&&!cameraLive(current.video))return void finish(Error('The camera stopped during debug capture.'));
      drawClipFrame(context,{...current,includesCamera,title:game.title,branded:false});
      const remaining=Math.max(0,Math.ceil((DEBUG_CAPTURE_MS-performance.now()+startAt)/1000));
      onProgress(remaining);raf=requestAnimationFrame(paint);
     }catch(error){void finish(error);}
    }
    onProgress(5);paint();timer=setTimeout(()=>finish(),DEBUG_CAPTURE_MS);
   }catch(error){void finish(error);}
   return result;
  },
  cancel(){operation?.cancel();},
  dispose(){disposed=true;operation?.cancel();},
 };
}
