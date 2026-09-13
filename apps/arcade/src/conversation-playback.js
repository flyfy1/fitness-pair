// MediaRecorder WebM can lack seek indexes. Decode the local voice once and
// schedule it against the video's clock instead of seeking an audio element.
export function attachConversationPlayback(video,conversation,{enabled,sourceRate=1,onState=()=>{},onError=()=>{}}){
 let context=null,buffer=null,loading=null,source=null,gain=null,generation=0,startAt=0,startOffset=0,rate=1;
 function stop(){generation++;if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();source=null;}onState(false);}
 async function sync(){
  if(!enabled()||video.paused||video.ended||video.seeking){stop();return;}
  const position=video.currentTime*sourceRate-(conversation.offsetSeconds||0);
  if(source&&rate===video.playbackRate*sourceRate&&Math.abs(startOffset+(context.currentTime-startAt)*rate-position)<.2){gain.gain.value=video.muted?0:video.volume;return;}
  stop();const token=generation;
  try{
   context??=new AudioContext();await context.resume();
   loading??=conversation.blob.arrayBuffer().then(bytes=>context.decodeAudioData(bytes));
   buffer??=await loading;
   if(token!==generation||!enabled()||video.paused||video.seeking)return;
   const time=video.currentTime*sourceRate-(conversation.offsetSeconds||0);
   if(time>=buffer.duration)return;
   rate=video.playbackRate*sourceRate;startOffset=Math.max(0,time);startAt=context.currentTime+Math.max(0,-time)/rate;
   source=context.createBufferSource();source.buffer=buffer;source.playbackRate.value=rate;
   gain??=context.createGain();gain.gain.value=video.muted?0:video.volume;
   gain.disconnect();gain.connect(context.destination);source.connect(gain);
   source.onended=()=>{source=null;onState(false);};source.start(startAt,startOffset);onState(true);
  }catch{if(token===generation)onError();}
 }
 const events=['play','playing','pause','seeking','seeked','timeupdate','ratechange','volumechange','ended','emptied'];
 events.forEach(event=>video.addEventListener(event,sync));
 function dispose(){stop();events.forEach(event=>video.removeEventListener(event,sync));context?.close().catch(()=>{});window.removeEventListener('pagehide',dispose);}
 window.addEventListener('pagehide',dispose,{once:true});
 return {sync,dispose};
}
