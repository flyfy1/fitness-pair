import {createConversationCapture} from './conversation.js';
import {captureClipThumbnail} from '../clip-thumbnail.js';
import {startRollingRecorder,REPLAY_SECONDS} from './rolling-media.js';
import {BRAND_NAME,SITE_URL} from '../brand.js';
import {recordingSize,drawClipFrame} from '../clip-compositor.js';
import {saveClip,listClips} from '../local-clips.js';
import {mountClipCard} from '../clips.js';
export function mountRecording(game,runtime,{panel,result,onReturnToGame}){
 panel.innerHTML='<div><strong>Play now. Replay after.</strong><p id="record-status" role="status">Your game records automatically when you start. Only your two latest videos stay on this device. Replays keep the latest 90 seconds at normal speed.</p><p class="record-note">Game + enabled camera · game sound when available · optional conversation track · nothing shared automatically</p></div><a href="/library">My clips →</a>';
 const status=panel.querySelector('#record-status');
 let conversationControls=null;
 const conversation=createConversationCapture({onChange:state=>{
  if(!conversationControls)return;
  const button=conversationControls.querySelector('button');
  const label=state.pending?'Cancel microphone request':state.enabled?'Stop conversation recording':'Record conversation';
  button.setAttribute('aria-label',label);button.title=label;
  conversationControls.dataset.state=state.pending?'pending':state.recording?'recording':state.enabled?'ready':'off';
  button.setAttribute('aria-pressed',String(state.enabled));
  if(state.pending||state.enabled)delete conversationControls.dataset.error;
  if(conversationControls.dataset.error)return;
  conversationControls.querySelector('[role=status]:not([data-replay-status])').hidden=true;
  conversationControls.querySelector('[role=status]:not([data-replay-status])').textContent=state.pending?'Waiting for microphone permission…':state.enabled?(state.recording?'Microphone on · separate local track':'Microphone ready · starts with the game'):'Microphone off';
 },onError:message=>{if(conversationControls){conversationControls.dataset.error='true';const status=conversationControls.querySelector('[role=status]:not([data-replay-status])');status.hidden=false;status.textContent=message;}}});

 const cameraActive=video=>!!video?.srcObject?.getVideoTracks().some(track=>track.readyState==='live');
 const cameraLive=video=>cameraActive(video)&&video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0;
 const supported=typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function';
 let active=null,handledRound=null,watcher=0,unloading=false;
 const sessions=new Set(),readyRounds=new Map(),failedRounds=new Map();let shareRound=null,shareButton=null,completedRound=null,revealing=false;
 async function revealResult(){
  if(unloading||revealing||shareRound===null||!readyRounds.has(shareRound)||document.hidden)return;
  const round=shareRound;
  revealing=true;
  try{
   if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
   const current=readGame();
   if(unloading||document.hidden||shareRound!==round||current?.round!==round||current.phase!=='complete')return;
   const card=result.querySelector(`[data-clip-id="${readyRounds.get(round)}"]`);
   const heading=card?.querySelector('h3');
   if(!heading)return;
   shareRound=null;
   heading.tabIndex=-1;heading.focus({preventScroll:true});
   card.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  }finally{revealing=false;}
 }
 function recordingFailed(session,error){
  sessions.delete(session);
  failedRounds.set(session.round,error.message||'The browser could not finish this recording.');
  while(failedRounds.size>2)failedRounds.delete(failedRounds.keys().next().value);
  if(!active)setState('idle',failedRounds.get(session.round));
  watchForStart();
 }
 function setState(next,message){panel.dataset.state=next;if(next==='unavailable'&&conversationControls)conversationControls.querySelector('button').disabled=true;if(message&&status.textContent!==message)status.textContent=message;}
 const readGame=()=>{const value=runtime.readFrame();return value?{...value}:null;};
 function showResult(clip){
  if(unloading)return;
  if(result.hidden){result.hidden=false;result.innerHTML='<h2 tabindex="-1">Your replay is ready.</h2><p>Watch it, then send it to a friend or keep it for yourself. Nothing has been uploaded.</p><div class="clip-grid"></div>';}
  if(!result.querySelector(`[data-clip-id="${clip.id}"]`)){
   const card=mountClipCard(result.querySelector('.clip-grid'),clip);
   const back=document.createElement('button');back.type='button';back.className='replay-return';back.textContent='Back to game';
   back.onclick=()=>{result.querySelectorAll('video').forEach(video=>video.pause());onReturnToGame();};
   card.prepend(back);
  }
  revealResult();
 }
 function start(snapshot){
  const session={round:snapshot.round,createdAt:Date.now(),phase:'recording',hadCamera:cameraLive(snapshot.video),cameraTime:snapshot.video?.currentTime,lastCameraAt:performance.now(),startAt:performance.now(),raf:0,endTimer:0,capture:null,recorder:null,failed:false};
  sessions.add(session);active=session;handledRound=snapshot.round;
  session.conversation=conversation.begin(session.startAt);
  function stopTracks(){session.conversationResult??=session.conversation.finish();cancelAnimationFrame(session.raf);clearTimeout(session.endTimer);session.capture?.getTracks().forEach(t=>t.stop());}
  function saveNow(){
   if(session.phase==='saving')return;
   cancelAnimationFrame(session.raf);clearTimeout(session.endTimer);session.phase='saving';session.stoppedAt=performance.now();
   if(active===session)active=null;
   if(!active)setState('saving','Saving your clip on this device…');
   if(session.recorder?.state!=='inactive')session.recorder?.stop().then(saveRecording).catch(error=>recordingFailed(session,error));
   stopTracks();
  }
  async function saveRecording(recorded){
   const clip={id:crypto.randomUUID(),title:`${game.title} · my replay`,game:game.id,gameTitle:game.title,createdAt:session.createdAt,width:session.context.canvas.width,height:session.context.canvas.height,duration:recorded.duration,playbackRate:1,source:session.hadCamera?'replay':'synthetic',includesCamera:session.hadCamera,includesAudio:session.includesAudio,brand:BRAND_NAME,website:SITE_URL,branded:false,hasEnding:false,finalScore:session.finalScore,stopReason:session.stopReason,blob:recorded.blob};
   clip.conversation=await session.conversationResult;
   clip.thumbnail=recorded.trimmed?recorded.thumbnail:await session.thumbnail;
   if(clip.conversation)clip.conversation.offsetSeconds-=recorded.startSeconds;
   let message=session.stopReason==='Camera interrupted'?'Camera interrupted. Saved the latest camera replay below.':'Saved on this device. Your replay is ready below.';
   try{await saveClip(clip);}catch(error){clip.unsaved=true;message=`${error.message||'Could not save on this device.'} Download the clip below before leaving.`;}
   sessions.delete(session);
   readyRounds.set(session.round,clip.id);
   while(readyRounds.size>2)readyRounds.delete(readyRounds.keys().next().value);
   if(!active)setState(sessions.size?'finishing':'idle',message);
   if(clip.unsaved||(await listClips().catch(()=>[clip])).some(item=>item.id===clip.id))showResult(clip);
  }
  function finish(score,reason='Round complete'){
   if(session.phase!=='recording')return;
   session.conversationResult??=session.conversation.finish();
   session.stopReason=reason;session.hasEnding=false;session.finalScore=score;
   saveNow();
  }
  session.saveNow=saveNow;session.finish=finish;
  try{
   session.lastCamera=document.createElement('canvas');session.lastCamera.width=0;session.lastCamera.height=0;
   const canvas=document.createElement('canvas');const size=recordingSize(runtime.getViewport?.()||snapshot.layout||snapshot.canvas);canvas.width=size.width;canvas.height=size.height;session.context=canvas.getContext('2d');session.capture=canvas.captureStream(24);
   // Own only cloned game-audio tracks; never stop the game's audio bus.
   for(const track of snapshot.audio?.getAudioTracks()||[])if(track.readyState==='live')session.capture.addTrack(track.clone());
   session.includesAudio=session.capture.getAudioTracks().length>0;
   drawClipFrame(session.context,{...snapshot,includesCamera:session.hadCamera,title:game.title,branded:false});
   session.thumbnail=captureClipThumbnail(canvas);
   session.recorder=startRollingRecorder(session.capture,{onError:()=>saveNow()});
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
     const cameraReady=cameraLive(now.video);
     if(session.hadCamera&&now.phase!=='ending'){
      // A live phone camera can briefly lose drawable frames while the game
      // keeps the round. Only fresh, drawable video resets the stall deadline.
      if(cameraReady&&now.video.currentTime!==session.cameraTime){session.cameraTime=now.video.currentTime;session.lastCameraAt=performance.now();}
      if(!cameraActive(now.video)||performance.now()-session.lastCameraAt>8000){finish(now.score,'Camera interrupted');return;}
     }
     if(!session.hadCamera&&now.video?.srcObject){handledRound=null;finish(now.score,'Preview ended');return;}
     if(session.hadCamera&&cameraReady){
      const cache=session.lastCamera,height=Math.max(1,Math.round(640*now.video.videoHeight/now.video.videoWidth));
      if(cache.width!==640||cache.height!==height){cache.width=640;cache.height=height;}
      cache.getContext('2d').drawImage(now.video,0,0,cache.width,cache.height);
     }
     if(session.hadCamera&&!cameraReady&&session.lastCamera.height)now.video=session.lastCamera;
     drawClipFrame(session.context,{...now,includesCamera:session.hadCamera,title:game.title,branded:false});snapshot=now;
     setState('recording',`Recording ${Math.min(REPLAY_SECONDS,Math.floor((performance.now()-session.startAt)/1000))} / 90 seconds${performance.now()-session.startAt>=REPLAY_SECONDS*1000?' · keeping the latest 90 seconds':''} · ${session.hadCamera?'game + camera':'synthetic game preview'} · stays on this device`);
     session.raf=requestAnimationFrame(paint);
    }catch{finish('Game closed');}
   }
   session.raf=requestAnimationFrame(paint);
  }catch(error){stopTracks();if(active===session)active=null;recordingFailed(session,error);}
 }
 function watchForStart(){
  if(unloading||document.hidden)return;
  try{
   const snapshot=readGame();
   const complete=snapshot?.phase==='complete';
   if(complete&&completedRound!==snapshot.round){completedRound=snapshot.round;shareRound=snapshot.round;}
   if(!complete)shareRound=null;
   if(shareButton){
    const ready=readyRounds.has(snapshot?.round);
    const pending=[...sessions].some(session=>session.round===snapshot?.round);
    const error=failedRounds.get(snapshot?.round)||(!supported?'Recording is unavailable in this browser.':!ready&&!pending?'No replay was recorded for this round.':'');
    shareButton.hidden=!complete;shareButton.disabled=!ready;
    const label=ready?'View replay':error?'Video unavailable':'Preparing video…';
    if(shareButton.textContent!==label)shareButton.textContent=label;
    const notice=conversationControls.querySelector('[data-replay-status]');
    notice.hidden=!complete;
    const message=ready?'Your replay is ready.':error||'Preparing your replay on this device…';
    if(notice.textContent!==message)notice.textContent=message;
   }
   if(complete)revealResult();
   if(active&&snapshot&&snapshot.round!==active.round)active.finish('Round restarted');
   if(supported&&!active&&snapshot?.phase==='playing'&&snapshot.round!==handledRound)start(snapshot);
  }catch{/* Wait for the same-origin game to finish loading. */}
 }
 listClips().then(clips=>{for(const clip of clips)showResult(clip);}).catch(()=>{});
 if(!supported)setState('unavailable','Recording is unavailable in this browser. You can still play.');
 watcher=setInterval(watchForStart,100);watchForStart();
 function visibility(){
  if(document.hidden){conversation.disable();handledRound=null;for(const session of sessions)session.saveNow();}
  else watchForStart();
 }
 document.addEventListener('visibilitychange',visibility);
 const unsubscribe=runtime.subscribe(watchForStart);
 return {
  connectControls(element){
   conversationControls=element;shareButton=element.querySelector('[data-replay-share]');
   shareButton.onclick=()=>{const snapshot=readGame();if(snapshot?.phase!=='complete'||!readyRounds.has(snapshot.round))return;shareRound=snapshot.round;revealResult();};
   element.querySelector('button').disabled=!supported||panel.dataset.state==='unavailable';element.querySelector('button').onclick=()=>conversation.toggle();watchForStart();
  },
  onGameReload(){if(active)active.finish('Game reloaded');conversation.disable();handledRound=null;completedRound=null;shareRound=null;},
  dispose(){if(unloading)return;unloading=true;document.removeEventListener('visibilitychange',visibility);conversation.disable();clearInterval(watcher);unsubscribe();for(const session of sessions)session.saveNow();},
 };
}
