import {CLIP_WIDTH,CLIP_HEIGHT,loadRecordingLogo,drawClipEnding} from './clip-compositor.js';
import {startVideoRecorder,recordedBlob} from './video-format.js';

export const SHARE_MAX_BYTES=20*1024*1024,SHARE_MAX_SECONDS=60;
export const fitsWebsiteShare=clip=>clip.blob.size>0&&clip.blob.size<=SHARE_MAX_BYTES&&Number.isFinite(clip.duration)&&clip.duration>0&&clip.duration<=SHARE_MAX_SECONDS;
// Leave two seconds of timing headroom around 55 seconds of play + 3s invitation.
export function shareWindow(duration,hasEnding){
 const end=Math.max(0,duration-(hasEnding?3:0));
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
// The source already contains camera, game and footer; draw it without mirroring.
export async function createShareCopy(clip,{signal,onProgress=()=>{}}={}){
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason||new DOMException('Share copy cancelled.','AbortError'));
 const visibility=()=>{if(document.hidden)controller.abort(new Error('Keep this tab visible while making a share copy. Your original replay is safe.'));};
 signal?.addEventListener('abort',abort,{once:true});window.addEventListener('pagehide',abort);document.addEventListener('visibilitychange',visibility);
 const deadline=setTimeout(()=>controller.abort(new Error('Making the share copy took too long. Your original replay is safe.')),75000);
 const localSignal=controller.signal,video=document.createElement('video'),url=URL.createObjectURL(clip.blob);
 let stream,recorder,audioContext,audioOutput,raf=0,endTimer=0;video.muted=true;video.playsInline=true;video.preload='auto';
 try{
  if(signal?.aborted)abort();visibility();localSignal.throwIfAborted();
  if(clip.includesAudio){
   // Resume within the player's click; route decoded game sound only to the copy.
   audioContext=new AudioContext();
   audioOutput=audioContext.createMediaStreamDestination();
   audioContext.createMediaElementSource(video).connect(audioOutput);
   video.muted=false;
   await abortable(audioContext.resume(),localSignal);
  }
  await waitMedia(video,'loadeddata',()=>{video.src=url;video.load();},localSignal);
  const duration=Number.isFinite(video.duration)?video.duration:clip.duration;
  const range=shareWindow(duration,clip.hasEnding);
  if(range.start>0)await waitMedia(video,'seeked',()=>{video.currentTime=range.start;},localSignal);
  const logo=await abortable(loadRecordingLogo(),localSignal);localSignal.throwIfAborted();
  const canvas=document.createElement('canvas');canvas.width=CLIP_WIDTH;canvas.height=CLIP_HEIGHT;const ctx=canvas.getContext('2d');
  ctx.drawImage(video,0,0,CLIP_WIDTH,CLIP_HEIGHT);stream=canvas.captureStream(24);
  for(const track of audioOutput?.stream.getAudioTracks()||[])stream.addTrack(track);
  let chunks=[],bytes=0,startedAt=0,stoppedAt=0,finishing=false,lastTime=video.currentTime,lastFrameAt=performance.now();
  const output=new Promise((resolve,reject)=>{
   const interrupted=()=>reject(localSignal.reason);localSignal.addEventListener('abort',interrupted,{once:true});
   try{
    recorder=startVideoRecorder(stream,r=>{
     r.ondataavailable=e=>{bytes+=e.data.size;if(bytes>SHARE_MAX_BYTES){controller.abort(new Error('This share copy exceeded 20 MiB. Download the full replay instead.'));return;}if(e.data.size)chunks.push(e.data);};
     r.onerror=()=>controller.abort(new Error('This browser could not encode the share copy. Your original replay is safe.'));
     r.onstop=async()=>{localSignal.removeEventListener('abort',interrupted);try{resolve({blob:await recordedBlob(chunks,r.mimeType),duration:(stoppedAt-startedAt)/1000});}catch(error){reject(error);}finally{chunks=[];}};
    },{videoBitsPerSecond:1800000});startedAt=performance.now();
   }catch(error){localSignal.removeEventListener('abort',interrupted);reject(error);return;}
   const finish=()=>{
    if(finishing)return;finishing=true;video.pause();
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
     ctx.drawImage(video,0,0,CLIP_WIDTH,CLIP_HEIGHT);
     onProgress(`Making your share copy · ${Math.floor(video.currentTime-range.start)} / ${Math.ceil(range.end-range.start)} seconds`);
     if(video.currentTime>=range.end-.04||video.ended||performance.now()-startedAt>=55000)finish();
    }
    raf=requestAnimationFrame(paint);
   }
   video.play().then(()=>{raf=requestAnimationFrame(paint);},error=>controller.abort(new Error('Replay playback could not start. Please retry from the clip button.',{cause:error})));
  });
  const encoded=await output;localSignal.throwIfAborted();
  if(!fitsWebsiteShare(encoded))throw new Error('The share copy exceeded the website limits. Your full replay is still saved.');
  return {id:crypto.randomUUID(),parentId:clip.id,title:`${clip.gameTitle||clip.title.split(' · ')[0]} · share copy`,game:clip.game,createdAt:Date.now(),source:clip.source,includesCamera:clip.includesCamera,includesAudio:!!clip.includesAudio,brand:clip.brand,website:clip.website,shareCopy:true,hasEnding:true,finalScore:clip.finalScore,...encoded};
 }finally{
  clearTimeout(deadline);clearTimeout(endTimer);cancelAnimationFrame(raf);
  if(recorder){recorder.ondataavailable=recorder.onstop=recorder.onerror=null;if(recorder.state!=='inactive')recorder.stop();}
  stream?.getTracks().forEach(track=>track.stop());audioOutput?.stream.getTracks().forEach(track=>track.stop());audioContext?.close().catch(()=>{});video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
  signal?.removeEventListener('abort',abort);window.removeEventListener('pagehide',abort);document.removeEventListener('visibilitychange',visibility);
 }
}
