// Microphone capture is opt-in, local, and independent of the game video/audio.
const FORMATS=['audio/webm;codecs=opus','audio/webm','audio/mp4;codecs=mp4a.40.2','audio/mp4'];
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
   let recorder;
   for(const mimeType of FORMATS){
    if(!MediaRecorder.isTypeSupported(mimeType))continue;
    try{recorder=new MediaRecorder(output.stream,{mimeType,audioBitsPerSecond:96000});
     recorder.ondataavailable=e=>{if(!e.data.size)return;target.bytes+=e.data.size;if(target.bytes>LIMIT){target.failed=true;if(round===target)disable();stop(target);onError('Conversation track reached its limit. The game video is still recording.');}else target.chunks.push(e.data);};
     recorder.onerror=()=>{target.failed=true;if(round===target)disable();stop(target);onError('Conversation recording stopped. The game video is still recording.');};
     recorder.onstop=()=>settle(target);
     recorder.start(500);target.offsetSeconds=Math.max(0,(performance.now()-target.startedAt)/1000);target.recorder=recorder;break;
    }catch{if(recorder){recorder.ondataavailable=recorder.onstop=recorder.onerror=null;if(recorder.state!=='inactive')recorder.stop();}recorder=null;}
   }
   if(!target.recorder){output.stream.getTracks().forEach(t=>t.stop());target.resolve(null);throw new Error('This browser cannot record a conversation track. You can still play and record video.');}
  }
  source?.disconnect();source=context.createMediaStreamSource(stream);source.connect(round.output);
 }
 function settle(target){
  clearTimeout(target.timeout);target.output?.stream.getTracks().forEach(t=>t.stop());
  target.context?.close().catch(()=>{});if(context===target.context)context=null;
  const blob=new Blob(target.chunks||[],{type:target.recorder?.mimeType.split(';')[0]||'audio/webm'});
  target.chunks=[];target.resolve?.(!target.failed&&blob.size?{blob,offsetSeconds:target.offsetSeconds}:null);
 }
 function stop(target){
  if(target.stopping)return;target.stopping=true;
  if(target.recorder?.state!=='inactive'&&target.recorder){target.recorder.stop();target.timeout=setTimeout(()=>{target.failed=true;settle(target);},3000);}
  else settle(target);
 }
 async function enable(){
  if(stream||pending){disable();return;}
  if(!navigator.mediaDevices?.getUserMedia){onError('Microphone recording is unavailable in this browser.');return;}
  const token=++generation;pending=true;emit();
  try{
   context??=new AudioContext();
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
