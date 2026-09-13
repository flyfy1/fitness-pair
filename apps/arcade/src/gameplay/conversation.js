// Microphone capture is opt-in, local, and independent of the game video/audio.
import {startRollingRecorder} from './rolling-media.js';
const LIMIT=10*1024*1024;
export function createConversationCapture({onChange=()=>{},onError=()=>{}}={}){
 let stream=null,context=null,source=null,round=null,generation=0,pending=false,timer=0;
 const emit=()=>onChange({enabled:!!stream,pending,recording:!!stream&&round?.recorder?.state==='recording'&&context?.state==='running'});
 function disconnect(){source?.disconnect();source=null;stream?.getTracks().forEach(t=>t.stop());stream=null;}
 function closeIdle(){if(context&&(!round?.recorder||context!==round.context)){context.close().catch(()=>{});context=null;}}
 function disable(){generation++;clearTimeout(timer);pending=false;disconnect();closeIdle();emit();}
 function attach(){
  if(!round||!stream)return;
  if(round.stopping)throw new Error('Conversation capture has finished for this round. Start another round to record more.');
  if(!round.recorder){
   const target=round,output=context.createMediaStreamDestination();
   target.output=output;target.context=context;target.chunks=[];target.bytes=0;
   target.result=new Promise(resolve=>{target.resolve=resolve;});
   target.offsetSeconds=Math.max(0,(performance.now()-target.startedAt)/1000);
   try{
    target.recorder=startRollingRecorder(output.stream,{audioOnly:true,maxBytes:LIMIT,onError:()=>{
     target.failed=true;if(round===target)disable();stop(target);onError('Conversation recording stopped. The game video is still recording.');
    }});
   }catch(error){output.stream.getTracks().forEach(t=>t.stop());target.resolve(null);throw error;}

  }
  source?.disconnect();source=context.createMediaStreamSource(stream);source.connect(round.output);
 }
 function settle(target,recorded){
  target.output?.stream.getTracks().forEach(t=>t.stop());
  target.context?.close().catch(()=>{});if(context===target.context)context=null;
  target.resolve?.(!target.failed&&recorded?.blob.size?{blob:recorded.blob,offsetSeconds:target.offsetSeconds+recorded.startSeconds}:null);
 }
 function stop(target){
  if(target.stopping)return;target.stopping=true;
  if(target.recorder)target.recorder.stop().then(recorded=>settle(target,recorded)).catch(()=>{target.failed=true;settle(target);onError('Conversation recording could not be saved. The game video is still available.');});
  else settle(target);
 }
 async function enable(){
  if(stream||pending){disable();return;}
  if(!navigator.mediaDevices?.getUserMedia){onError('Microphone recording is unavailable in this browser.');return;}
  const token=++generation;pending=true;emit();
  try{
   context??=new AudioContext();context.onstatechange=emit;
   timer=setTimeout(()=>{if(token===generation){disable();onError('Microphone permission took too long. Click Record conversation to retry.');}},20000);
   await context.resume();if(token!==generation)return;
   const acquired=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   if(token!==generation||document.hidden){acquired.getTracks().forEach(t=>t.stop());return;}
   clearTimeout(timer);pending=false;stream=acquired;
   if(!stream.getAudioTracks().some(t=>t.readyState==='live'))throw new Error('No microphone track is available.');
   for(const track of stream.getAudioTracks())track.addEventListener('ended',()=>{if(stream===acquired){disable();onError('Microphone disconnected. Your recorded video and conversation so far are kept.');}},{once:true});
   await context.resume();if(token!==generation)return;
   attach();emit();
  }catch(error){if(token!==generation)return;disable();onError(error.name==='NotAllowedError'?'Microphone permission was denied. You can still play without conversation.':error.message||'Microphone could not start. You can still play.');}
 }
 return {toggle:enable,disable,
  begin(startedAt){
   const target={startedAt};round=target;
   try{attach();}catch(error){disable();onError(error.message);}emit();
   return {finish(){
    if(round===target){disable();round=null;if(context===target.context)context=null;}
    stop(target);return target.result||Promise.resolve(null);
   }};
  },
 };
}
