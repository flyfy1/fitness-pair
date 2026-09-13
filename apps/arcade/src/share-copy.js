import {loadRecordingLogo,drawClipEnding,drawDownloadFrame} from './clip-compositor.js';
import {startVideoRecorder,recordedBlob} from './video-format.js';
import {MAX_BYTES} from './local-clips.js';

export const SHARE_MAX_BYTES=20*1024*1024,SHARE_MAX_SECONDS=90;
export const fitsWebsiteShare=clip=>clip.blob.size>0&&clip.blob.size<=SHARE_MAX_BYTES&&Number.isFinite(clip.duration)&&clip.duration>0&&clip.duration<=SHARE_MAX_SECONDS;
// Keep website copies below the gateway duration limit; exclude legacy endings.
export function shareWindow(duration,hasEnding,endingSeconds=3){
 const end=Math.max(0,duration-(hasEnding?endingSeconds:0));
 if(!Number.isFinite(end)||end<=0)throw new Error('This replay has no gameplay to copy.');
 return {start:Math.max(0,end-55),end};
}
function abortable(promise,signal){
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
  promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}
function waitMedia(video,event,action,signal){
 return new Promise((resolve,reject)=>{
  const finish=error=>{clearTimeout(timer);video.removeEventListener(event,ready);video.removeEventListener('error',failed);signal.removeEventListener('abort',aborted);error?reject(error):resolve();};
  const ready=()=>finish(),failed=()=>finish(new Error('This browser could not read the replay. Download the original or retry in an updated browser.')),aborted=()=>finish(signal.reason);
  const timer=setTimeout(()=>finish(new Error('Reading the replay took too long. Please retry.')),10000);
  video.addEventListener(event,ready,{once:true});video.addEventListener('error',failed,{once:true});signal.addEventListener('abort',aborted,{once:true});
  if(signal.aborted){aborted();return;}try{action();}catch(error){finish(error);}
 });
}

// Local re-encoding only: no fetch/upload of video, no new camera permission.
// The source already contains camera and game; draw it without mirroring.
export async function createShareCopy(clip,{signal,onProgress=()=>{},includeConversation=false,fullLength=false,playbackRate=1,brandedDownload=false}={}){
 if(![1,2].includes(playbackRate))throw new Error('Unsupported replay speed.');
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason||new DOMException('Share copy cancelled.','AbortError'));
 const visibility=()=>{if(document.hidden)controller.abort(new Error('Keep this tab visible while making a share copy. Your original replay is safe.'));};
 signal?.addEventListener('abort',abort,{once:true});window.addEventListener('pagehide',abort);document.addEventListener('visibilitychange',visibility);
 const deadline=setTimeout(()=>controller.abort(new Error('Making the share copy took too long. Your original replay is safe.')),fullLength?Math.max(75000,(clip.duration+20)*1000):75000);
 const localSignal=controller.signal,video=document.createElement('video'),url=URL.createObjectURL(clip.blob);
 let stream,recorder,audioContext,audioOutput,voiceSource,voiceBuffer,raf=0,endTimer=0;video.muted=true;video.playsInline=true;video.preload='auto';
 try{
  if(signal?.aborted)abort();visibility();localSignal.throwIfAborted();
  if(clip.includesAudio||(includeConversation&&clip.conversation)){
   // Resume within the player's click; route decoded game sound only to the copy.
   audioContext=new AudioContext();
   audioOutput=audioContext.createMediaStreamDestination();
   if(clip.includesAudio)audioContext.createMediaElementSource(video).connect(audioOutput);
   video.muted=false;
   await abortable(audioContext.resume(),localSignal);
  }
  if(includeConversation&&clip.conversation){
   voiceBuffer=await abortable(audioContext.decodeAudioData(await clip.conversation.blob.arrayBuffer()),localSignal);
  }
  await waitMedia(video,'loadeddata',()=>{video.src=url;video.load();},localSignal);
  const duration=Number.isFinite(video.duration)?video.duration:clip.duration;
  const range=fullLength?{start:0,end:duration}:shareWindow(duration,clip.hasEnding,clip.endingSeconds??3);
  if(!Number.isFinite(range.end)||range.end<=0)throw new Error('The replay duration is unavailable.');
  video.playbackRate=playbackRate;
  if(range.start>0)await waitMedia(video,'seeked',()=>{video.currentTime=range.start;},localSignal);
  const logo=brandedDownload?await abortable(loadRecordingLogo(),localSignal):null;localSignal.throwIfAborted();
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');
  const draw=()=>brandedDownload?drawDownloadFrame(ctx,video,clip,logo):ctx.drawImage(video,0,0,canvas.width,canvas.height);
  draw();stream=canvas.captureStream(24);
  for(const track of audioOutput?.stream.getAudioTracks()||[])stream.addTrack(track);
  let chunks=[],bytes=0,startedAt=0,stoppedAt=0,finishing=false,lastTime=video.currentTime,lastFrameAt=performance.now();
  const output=new Promise((resolve,reject)=>{
   const interrupted=()=>reject(localSignal.reason);localSignal.addEventListener('abort',interrupted,{once:true});
   try{
    recorder=startVideoRecorder(stream,r=>{
     r.ondataavailable=e=>{bytes+=e.data.size;if(bytes>(fullLength?MAX_BYTES:SHARE_MAX_BYTES)){controller.abort(new Error('This copy exceeded its file limit. Your original replay is safe.'));return;}if(e.data.size)chunks.push(e.data);};
     r.onerror=()=>controller.abort(new Error('This browser could not encode the share copy. Your original replay is safe.'));
     r.onstop=async()=>{localSignal.removeEventListener('abort',interrupted);try{resolve({blob:await recordedBlob(chunks,r.mimeType),duration:(stoppedAt-startedAt)/1000});}catch(error){reject(error);}finally{chunks=[];}};
    },{videoBitsPerSecond:1800000});startedAt=performance.now();
   }catch(error){localSignal.removeEventListener('abort',interrupted);reject(error);return;}
   const finish=()=>{
    if(finishing)return;finishing=true;video.pause();voiceSource?.stop();
    if(!brandedDownload){stoppedAt=performance.now();recorder.stop();return;}
    drawClipEnding(ctx,clip.gameTitle||clip.title.split(' · ')[0],clip.finalScore||'Replay highlights',logo,clip.includesCamera,'Replay highlights');
    onProgress('Adding the Hopmodo invitation…');
    endTimer=setTimeout(()=>{stoppedAt=performance.now();recorder.stop();},3000);
   };
   function paint(){
    if(localSignal.aborted||recorder.state==='inactive')return;
    if(finishing){ctx.fillRect(0,0,1,1);stream.getVideoTracks()[0]?.requestFrame?.();}
    else{
     if(video.currentTime!==lastTime){lastTime=video.currentTime;lastFrameAt=performance.now();}
     if(performance.now()-lastFrameAt>8000){controller.abort(new Error('Replay playback stalled. Keep this tab visible and retry.'));return;}
     draw();
     onProgress(`Making your share copy · ${Math.floor(video.currentTime-range.start)} / ${Math.ceil(range.end-range.start)} seconds`);
     if(video.currentTime>=range.end-.04||video.ended||(!fullLength&&performance.now()-startedAt>=55000))finish();
    }
    raf=requestAnimationFrame(paint);
   }
   video.play().then(()=>{
    if(voiceBuffer){
     const sourceRate=clip.playbackRate||1;
     const offset=(clip.conversation.offsetSeconds||0)/sourceRate,position=video.currentTime;
     const skip=Math.max(0,position-offset),delay=Math.max(0,offset-position);
     const length=Math.min(voiceBuffer.duration/sourceRate-skip,range.end-position-delay);
     if(length>0){voiceSource=audioContext.createBufferSource();voiceSource.buffer=voiceBuffer;voiceSource.playbackRate.value=sourceRate*playbackRate;voiceSource.connect(audioOutput);voiceSource.start(audioContext.currentTime+delay/playbackRate,skip*sourceRate,length*sourceRate);}
    }
    raf=requestAnimationFrame(paint);},error=>controller.abort(new Error('Replay playback could not start. Please retry from the clip button.',{cause:error})));
  });
  const encoded=await output;localSignal.throwIfAborted();
  if(!fullLength&&!fitsWebsiteShare(encoded))throw new Error('The share copy exceeded the website limits. Your full replay is still saved.');
  return {id:crypto.randomUUID(),parentId:clip.id,title:`${clip.gameTitle||clip.title.split(' · ')[0]} · ${fullLength?'with conversation':'share copy'}`,game:clip.game,createdAt:Date.now(),width:canvas.width,height:canvas.height,source:clip.source,includesCamera:clip.includesCamera,includesAudio:!!clip.includesAudio||!!voiceBuffer,conversationEmbedded:!!voiceBuffer||!!clip.conversationEmbedded,gameTitle:clip.gameTitle,brand:clip.brand,website:clip.website,shareCopy:!fullLength,branded:brandedDownload||clip.branded!==false,playbackRate:(clip.playbackRate||1)*playbackRate,endingSeconds:brandedDownload?3:fullLength?(clip.endingSeconds??3)/playbackRate:0,hasEnding:brandedDownload||(fullLength&&!!clip.hasEnding),finalScore:clip.finalScore,...encoded};
 }finally{
  clearTimeout(deadline);clearTimeout(endTimer);cancelAnimationFrame(raf);
  if(recorder){recorder.ondataavailable=recorder.onstop=recorder.onerror=null;if(recorder.state!=='inactive')recorder.stop();}
  try{voiceSource?.stop();}catch{/* Already ended. */}
  stream?.getTracks().forEach(track=>track.stop());audioOutput?.stream.getTracks().forEach(track=>track.stop());audioContext?.close().catch(()=>{});video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
  signal?.removeEventListener('abort',abort);window.removeEventListener('pagehide',abort);document.removeEventListener('visibilitychange',visibility);
 }
}
