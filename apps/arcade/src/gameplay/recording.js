import {createConversationCapture} from './conversation.js';
import {startVideoRecorder,recordedBlob} from '../video-format.js';
import {BRAND_NAME,SITE_URL} from '../brand.js';
import {CLIP_WIDTH,CLIP_HEIGHT,drawClipFrame} from '../clip-compositor.js';
import {createShareCopy} from '../share-copy.js';
import {saveClip,updateClip,listClips,MAX_BYTES} from '../local-clips.js';
import {mountClipCard} from '../clips.js';
export function mountRecording(game,runtime,{panel,result}){
 panel.innerHTML='<div><strong>Play now. Replay after.</strong><p id="record-status" role="status">Your game records automatically when you start. Only your two latest videos stay on this device. Videos over 30 seconds are saved at 2× speed.</p><p class="record-note">Game + enabled camera · game sound when available · optional conversation track · nothing shared automatically</p></div><a href="/library">My clips →</a>';
 const status=panel.querySelector('#record-status');
 let conversationControls=null;
 const conversation=createConversationCapture({onChange:state=>{
  if(!conversationControls)return;
  const button=conversationControls.querySelector('button');
  button.textContent=state.pending?'Cancel microphone request':state.enabled?'Stop conversation recording':'Record conversation';
  button.setAttribute('aria-pressed',String(state.enabled));
  conversationControls.querySelector('[role=status]').hidden=!state.enabled&&!state.pending;
  conversationControls.querySelector('[role=status]').textContent=state.pending?'Waiting for microphone permission…':state.enabled?(state.recording?'Microphone on · separate local track':'Microphone ready · starts with the game'):'Microphone off';
 },onError:message=>{if(conversationControls){const status=conversationControls.querySelector('[role=status]');status.hidden=false;status.textContent=message;}}});

 const cameraLive=video=>!!(video?.srcObject&&video.readyState>=2&&video.videoWidth>0&&video.srcObject.getVideoTracks().some(track=>track.readyState==='live'));
 const supported=typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function';
 let active=null,handledRound=null,watcher=0,unloading=false;
 const sessions=new Set(),readyRounds=new Map();let shareRound=null,shareButton=null;
 async function revealResult(){
  if(unloading||shareRound===null||!readyRounds.has(shareRound)||document.hidden)return;
  const round=shareRound;
  if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
  const current=readGame();
  if(shareRound!==round||current?.round!==round||current.phase!=='complete')return;
  shareRound=null;
  const card=result.querySelector(`[data-clip-id="${readyRounds.get(round)}"]`);
  const heading=card?.querySelector("h3");
  if(!heading)return;heading.tabIndex=-1;heading.focus({preventScroll:true});
  (card||result).scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
 }
 function setState(next,message){panel.dataset.state=next;if(next==='unavailable'&&conversationControls)conversationControls.querySelector('button').disabled=true;if(message&&status.textContent!==message)status.textContent=message;}
 const readGame=()=>{const value=runtime.readFrame();return value?{...value}:null;};
 function showResult(clip){
  if(unloading)return;
  if(result.hidden){result.hidden=false;result.innerHTML='<h2 tabindex="-1">Your replay is ready.</h2><p>Watch it, then send it to a friend or keep it for yourself. Nothing has been uploaded.</p><div class="clip-grid"></div>';}
  if(!result.querySelector(`[data-clip-id="${clip.id}"]`))mountClipCard(result.querySelector('.clip-grid'),clip);
  revealResult();
 }
 function start(snapshot){
  const session={round:snapshot.round,createdAt:Date.now(),phase:'recording',hadCamera:cameraLive(snapshot.video),cameraTime:snapshot.video?.currentTime,lastCameraAt:performance.now(),startAt:performance.now(),raf:0,endTimer:0,bytes:0,chunks:[],capture:null,recorder:null,failed:false};
  sessions.add(session);active=session;handledRound=snapshot.round;
  session.conversation=conversation.begin(session.startAt);
  function stopTracks(){session.conversationResult??=session.conversation.finish();cancelAnimationFrame(session.raf);clearTimeout(session.endTimer);session.capture?.getTracks().forEach(t=>t.stop());}
  function saveNow(){
   if(session.phase==='saving')return;
   cancelAnimationFrame(session.raf);clearTimeout(session.endTimer);session.phase='saving';session.stoppedAt=performance.now();
   if(active===session)active=null;
   if(!active)setState('saving','Saving your clip on this device…');
   if(session.recorder?.state!=='inactive')session.recorder?.stop();
   stopTracks();
  }
  function finish(score,reason='Round complete'){
   if(session.phase!=='recording')return;
   session.conversationResult??=session.conversation.finish();
   session.stopReason=reason;session.hasEnding=false;session.finalScore=score;
   saveNow();
  }
  session.saveNow=saveNow;session.finish=finish;
  try{
   session.lastCamera=document.createElement('canvas');
   const canvas=document.createElement('canvas');canvas.width=CLIP_WIDTH;canvas.height=CLIP_HEIGHT;session.context=canvas.getContext('2d');session.capture=canvas.captureStream(24);
   // Own only cloned game-audio tracks; never stop the game's audio bus.
   for(const track of snapshot.audio?.getAudioTracks()||[])if(track.readyState==='live')session.capture.addTrack(track.clone());
   session.includesAudio=session.capture.getAudioTracks().length>0;
   drawClipFrame(session.context,{...snapshot,includesCamera:session.hadCamera,title:game.title,branded:false});
   session.recorder=startVideoRecorder(session.capture,recorder=>{
   session.recorder=recorder;
   session.recorder.ondataavailable=e=>{
    if(!e.data.size)return;
    session.bytes+=e.data.size;
    if(session.bytes>MAX_BYTES){session.failed=true;session.chunks=[];saveNow();return;}
    session.chunks.push(e.data);
    if(session.bytes>=MAX_BYTES-2*1024*1024&&session.phase==='recording'){
     session.limited=true;finish('Recording file limit reached');
     if(!active)setState('finishing','Recording reached the device file limit. Saving what you played so far…');
    }
   };
   session.recorder.onerror=()=>{session.failed=true;saveNow();};
   session.recorder.onstop=async()=>{
    stopTracks();sessions.delete(session);
    if(session.failed){session.chunks=[];if(!active)setState('idle','This replay could not be saved. Your next round will record automatically.');return;}
    let blob;
    try{blob=await recordedBlob(session.chunks,session.recorder.mimeType);}
    catch(error){if(!active)setState('idle',error.message);return;}finally{session.chunks=[];}
    const clip={id:crypto.randomUUID(),title:`${game.title} · my replay${session.limited?' (file limit)':''}`,game:game.id,gameTitle:game.title,createdAt:session.createdAt,duration:(session.stoppedAt-session.startAt)/1000,source:session.hadCamera?'replay':'synthetic',includesCamera:session.hadCamera,includesAudio:session.includesAudio,brand:BRAND_NAME,website:SITE_URL,branded:false,hasEnding:!!session.hasEnding,finalScore:session.finalScore,stopReason:session.stopReason,blob};
    clip.conversation=await session.conversationResult;
    let message=session.limited?'File limit reached. The replay up to that point is saved below.':session.stopReason==='Camera interrupted'?'Camera interrupted. Saved the camera replay captured so far below.':'Saved on this device. Your replay is ready below.';
    try{await saveClip(clip);}catch(error){clip.unsaved=true;message=`${error.message||'Could not save on this device.'} Download the clip below before leaving.`;}
    if(clip.duration>30&&!unloading&&!document.hidden){
     if(!active)setState('saving','Saving your replay at 2× speed on this device…');
     try{
      const fast=await createShareCopy(clip,{fullLength:true,playbackRate:2});
      clip.sourceDuration=clip.duration;clip.duration=fast.duration;clip.blob=fast.blob;clip.playbackRate=2;clip.endingSeconds=fast.endingSeconds;
      if(!clip.unsaved)await updateClip(clip);
     }catch{message+=' The 2× copy could not finish. This replay is kept at its original speed.';}
    }else if(clip.duration>30){message+=' The 2× copy could not finish while this tab was hidden. This replay is kept at its original speed.';}
    readyRounds.set(session.round,clip.id);
    while(readyRounds.size>2)readyRounds.delete(readyRounds.keys().next().value);
    if(!active)setState(sessions.size?'finishing':'idle',message);
    if(clip.unsaved||(await listClips().catch(()=>[clip])).some(item=>item.id===clip.id))showResult(clip);
   };
   });
   setState('recording','Recording your game · stays on this device');
   function paint(){
    if(session.phase!=='recording')return;
    try{
     const now=readGame();
     if(!now){finish('Game closed');return;}
     if(now.round!==session.round){finish(snapshot.score);return;}
     // Completion can turn off the game's camera in the same frame.
     if(now.phase==='complete'){finish(now.score);return;}
     if(now.phase==='idle'&&!session.hadCamera){finish(now.score,'Preview ended');return;}
     if(session.hadCamera&&now.phase!=='ending'){
      if(now.video?.currentTime!==session.cameraTime){session.cameraTime=now.video?.currentTime;session.lastCameraAt=performance.now();}
      if(!cameraLive(now.video)||performance.now()-session.lastCameraAt>8000){finish(now.score,'Camera interrupted');return;}
     }
     if(!session.hadCamera&&now.video?.srcObject){handledRound=null;finish(now.score,'Preview ended');return;}
     if(session.hadCamera&&now.video?.srcObject&&now.video.readyState>=2){const cache=session.lastCamera;cache.width=640;cache.height=Math.round(640*now.video.videoHeight/now.video.videoWidth);cache.getContext('2d').drawImage(now.video,0,0,cache.width,cache.height);}
     if(now.phase==='ending'&&!now.video?.srcObject&&session.lastCamera.height)now.video=session.lastCamera;
     drawClipFrame(session.context,{...now,includesCamera:session.hadCamera,title:game.title,branded:false});snapshot=now;
     setState('recording',`Recording ${Math.floor((performance.now()-session.startAt)/1000)} seconds · ${session.hadCamera?'game + camera':'synthetic game preview'} · stays on this device`);
     session.raf=requestAnimationFrame(paint);
    }catch{finish('Game closed');}
   }
   session.raf=requestAnimationFrame(paint);
  }catch(error){stopTracks();sessions.delete(session);if(active===session)active=null;setState('idle',error.message);}
 }
 function watchForStart(){
  if(unloading||document.hidden||!supported)return;
  try{
   const snapshot=readGame();
   if(shareButton){shareButton.hidden=snapshot?.phase!=='complete';shareButton.textContent=shareRound===snapshot?.round&&!readyRounds.has(snapshot.round)?'Preparing video…':'Share';}
   if(snapshot?.phase!=='complete')shareRound=null;
   if(active&&snapshot&&snapshot.round!==active.round)active.finish('Round restarted');
   if(!active&&snapshot?.phase==='playing'&&snapshot.round!==handledRound)start(snapshot);
  }catch{/* Wait for the same-origin game to finish loading. */}
 }
 listClips().then(clips=>{for(const clip of clips)showResult(clip);}).catch(()=>{});
 if(!supported)setState('unavailable','Recording is unavailable in this browser. You can still play.');
 else{watcher=setInterval(watchForStart,100);watchForStart();}
 function visibility(){
  if(document.hidden){conversation.disable();handledRound=null;for(const session of sessions)session.saveNow();}
  else watchForStart();
 }
 document.addEventListener('visibilitychange',visibility);
 const unsubscribe=runtime.subscribe(watchForStart);
 return {
  connectControls(element){
   conversationControls=element;shareButton=element.querySelector('[data-replay-share]');
   shareButton.onclick=()=>{const snapshot=readGame();if(snapshot?.phase!=='complete')return;shareRound=snapshot.round;shareButton.textContent='Preparing video…';revealResult();};
   element.querySelector('button').disabled=!supported||panel.dataset.state==='unavailable';element.querySelector('button').onclick=()=>conversation.toggle();watchForStart();
  },
  onGameReload(){if(active)active.finish('Game reloaded');conversation.disable();handledRound=null;},
  dispose(){if(unloading)return;unloading=true;document.removeEventListener('visibilitychange',visibility);conversation.disable();clearInterval(watcher);unsubscribe();for(const session of sessions)session.saveNow();},
 };
}
