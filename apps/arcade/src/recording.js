import {createShareCopy,fitsWebsiteShare} from './share-copy.js';
import {startVideoRecorder,recordedBlob,videoExtension,formatLabel} from './video-format.js';
import {BRAND_NAME,SITE_URL} from './brand.js';
import {CLIP_WIDTH,CLIP_HEIGHT,loadRecordingLogo,drawClipFrame,drawClipEnding} from './clip-compositor.js';
import {saveClip,listClips,deleteClip,updateClip,MAX_BYTES} from './local-clips.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const urls=new Set();function objectURL(blob){const u=URL.createObjectURL(blob);urls.add(u);return u;}function releaseURL(u){URL.revokeObjectURL(u);urls.delete(u);}
window.addEventListener('pagehide',()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();});
async function api(path,options){const r=await fetch(path,options);const data=await r.json();if(!r.ok)throw new Error(data.error||'Please try again.');return data;}
export function mountRecording(game,frame){
 const panel=document.querySelector('#record-panel');
 panel.innerHTML='<div><strong>Play now. Replay after.</strong><p id="record-status" role="status">Your game records automatically when you start. It stays on this device.</p><p class="record-note">Game + enabled camera · game sound when available · no microphone · nothing shared automatically</p></div><a href="/library">My clips →</a>';
 const status=panel.querySelector('#record-status');
 const cameraLive=video=>!!(video?.srcObject&&video.readyState>=2&&video.videoWidth>0&&video.srcObject.getVideoTracks().some(track=>track.readyState==='live'));
 const supported=typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function';
 let logo=null,active=null,handledRound=null,watcher=0,unloading=false;
 const sessions=new Set();
 function setState(next,message){panel.dataset.state=next;if(message&&status.textContent!==message)status.textContent=message;}
 function readGame(){
  const doc=frame.contentDocument;
  if(game.id==='dino-ar'){
   const state=frame.contentWindow.dinoAR?.getState(),canvas=doc?.querySelector('#world');if(!state||!canvas?.width)return null;
   return {canvas,video:doc.querySelector('#camera'),skeleton:doc.querySelector('#debug')?.checked?doc.querySelector('#skeleton'):null,skeletonMirrored:true,isAR:true,round:state.roundId,ready:state.status==='running',done:state.status==='over',score:`${state.score} points`};
  }
  if(game.id==='plank-flight'){
   const state=frame.contentWindow.plankFlight?.getState(),canvas=doc?.querySelector('#scene');if(!state||!canvas?.width)return null;
   return {canvas,video:doc.querySelector('#video'),isAR:true,round:state.sessionId,ready:state.status==='flying',ending:state.status==='crashing',done:state.finished,score:`${Math.floor(state.flightSeconds)}s · ${state.passed} gates`};
  }
  if(game.id==='camera-start'){
   const state=frame.contentWindow.cameraSetup?.getState(),canvas=doc?.querySelector('#game-world');if(!state?.game||!canvas?.width)return null;
   const stage=doc.querySelector('#setup').getBoundingClientRect(),rect=canvas.getBoundingClientRect();
   return {canvas,video:doc.querySelector('#camera'),skeleton:doc.querySelector('#show-body')?.checked?doc.querySelector('#body-overlay'):null,isAR:true,layout:{width:stage.width,height:stage.height,x:rect.x-stage.x,y:rect.y-stage.y,canvasWidth:rect.width,canvasHeight:rect.height},round:state.game.roundId,ready:state.game.status==='running'&&state.testing,done:state.stage==='complete'||state.game.status==='over',score:`${state.game.score} points`};
  }
  const canvas=doc?.querySelector('#game'),video=doc?.querySelector('#camera');
  if(!canvas?.width)return null;
  if(game.id==='motion-quest'){
   const state=frame.contentWindow.motionQuest?.getReplayState();
   if(!state)return null;
   const reps=Number(doc.querySelector('#rep-count')?.textContent||0);
   return {canvas,video,skeleton:doc.querySelector('#skeleton'),isAR:!!doc.querySelector('.camera-stage'),round:state.roundId,done:state.phase==='complete',stopped:state.phase==='idle',ending:state.phase==='ending',ready:state.phase==='playing',audio:frame.contentWindow.motionQuest.getAudioStream?.(),score:`${reps} / 5 squats`,hud:{health:doc.querySelector('#hp-label')?.textContent,cue:doc.querySelector('#arena-title')?.textContent,charge:doc.querySelector('#charge-value')?.textContent,elapsed:doc.querySelector('#elapsed')?.textContent}};
  }
  const snapshot=frame.contentWindow.dinoGame?.getState();
  return {canvas,video,isAR:false,round:snapshot?.roundId,done:snapshot?.status==='over',ready:snapshot?.status==='running',score:`${snapshot?.score||0} points`};
 }
 function showResult(clip){
  if(unloading)return;
  const result=document.querySelector('#local-result');
  if(result.hidden){result.hidden=false;result.innerHTML='<h2 tabindex="-1">Your replay is ready.</h2><p>Watch it, then send it to a friend or keep it for yourself. Nothing has been uploaded.</p><div class="clip-grid"></div>';}
  // Keep every in-memory fallback until the player deletes it or leaves this page.
  mountClipCard(result.querySelector('.clip-grid'),clip);
  const now=readGame();
  if(!document.hidden&&!active&&!(now?.ready&&!now.done)){
   if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
   result.querySelector('h2').focus({preventScroll:true});result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  }
 }
 function start(snapshot){
  const session={round:snapshot.round,phase:'recording',hadCamera:cameraLive(snapshot.video),cameraTime:snapshot.video?.currentTime,lastCameraAt:performance.now(),startAt:performance.now(),raf:0,endTimer:0,bytes:0,chunks:[],capture:null,recorder:null,failed:false};
  sessions.add(session);active=session;handledRound=snapshot.round;
  function stopTracks(){cancelAnimationFrame(session.raf);clearTimeout(session.endTimer);session.capture?.getTracks().forEach(t=>t.stop());}
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
   session.stopReason=reason;session.hasEnding=true;session.finalScore=score;
   session.phase='finishing';session.capture?.getAudioTracks().forEach(track=>{track.enabled=false;});if(active===session)active=null;cancelAnimationFrame(session.raf);
   if(!active)setState('finishing','Round complete. Saving your replay…');
   drawClipEnding(session.context,game.title,score,logo,session.hadCamera,reason);
   function hold(){if(session.phase!=='finishing')return;session.context.fillRect(0,0,1,1);session.capture?.getVideoTracks()[0]?.requestFrame?.();session.raf=requestAnimationFrame(hold);}
   session.raf=requestAnimationFrame(hold);session.endTimer=setTimeout(saveNow,3000);
  }
  session.saveNow=saveNow;session.finish=finish;
  try{
   session.lastCamera=document.createElement('canvas');
   const canvas=document.createElement('canvas');canvas.width=CLIP_WIDTH;canvas.height=CLIP_HEIGHT;session.context=canvas.getContext('2d');session.capture=canvas.captureStream(24);
   // Own only cloned game-audio tracks; never stop the game's audio bus.
   for(const track of snapshot.audio?.getAudioTracks()||[])if(track.readyState==='live')session.capture.addTrack(track.clone());
   session.includesAudio=session.capture.getAudioTracks().length>0;
   drawClipFrame(session.context,{...snapshot,includesCamera:session.hadCamera,title:game.title,logo});
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
    const clip={id:crypto.randomUUID(),title:`${game.title} · my replay${session.limited?' (file limit)':''}`,game:game.id,gameTitle:game.title,createdAt:Date.now(),duration:(session.stoppedAt-session.startAt)/1000,source:session.hadCamera?'replay':'synthetic',includesCamera:session.hadCamera,includesAudio:session.includesAudio,brand:BRAND_NAME,website:SITE_URL,hasEnding:!!session.hasEnding,finalScore:session.finalScore,stopReason:session.stopReason,blob};
    let message=session.limited?'File limit reached. The replay up to that point is saved below.':session.stopReason==='Camera interrupted'?'Camera interrupted. Saved the camera replay captured so far below.':'Saved on this device. Your replay is ready below.';
    try{await saveClip(clip);}catch(error){clip.unsaved=true;message=`${error.message||'Could not save on this device.'} Download the clip below before leaving.`;}
    if(!active)setState(sessions.size?'finishing':'idle',message);
    showResult(clip);
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
     if(now.done){finish(now.score);return;}
     if(now.stopped&&!session.hadCamera){finish(now.score,'Preview ended');return;}
     if(session.hadCamera&&!now.ending){
      if(now.video?.currentTime!==session.cameraTime){session.cameraTime=now.video?.currentTime;session.lastCameraAt=performance.now();}
      if(!cameraLive(now.video)||performance.now()-session.lastCameraAt>8000){finish(now.score,'Camera interrupted');return;}
     }
     if(!session.hadCamera&&now.video?.srcObject){handledRound=null;finish(now.score,'Preview ended');return;}
     if(session.hadCamera&&now.video?.srcObject&&now.video.readyState>=2){const cache=session.lastCamera;cache.width=640;cache.height=Math.round(640*now.video.videoHeight/now.video.videoWidth);cache.getContext('2d').drawImage(now.video,0,0,cache.width,cache.height);}
     if(now.ending&&!now.video?.srcObject&&session.lastCamera.height)now.video=session.lastCamera;
     drawClipFrame(session.context,{...now,includesCamera:session.hadCamera,title:game.title,logo});snapshot=now;
     setState('recording',`Recording ${Math.floor((performance.now()-session.startAt)/1000)} seconds · ${session.hadCamera?'game + camera':'synthetic game preview'} · stays on this device`);
     session.raf=requestAnimationFrame(paint);
    }catch{finish('Game closed');}
   }
   session.raf=requestAnimationFrame(paint);
  }catch(error){stopTracks();sessions.delete(session);if(active===session)active=null;setState('idle',error.message);}
 }
 function watchForStart(){
  if(unloading||document.hidden)return;
  try{
   const snapshot=readGame();
   if(active&&snapshot&&snapshot.round!==active.round)active.finish('Round restarted');
   if(!active&&logo&&snapshot?.ready&&!snapshot.done&&snapshot.round!==handledRound)start(snapshot);
  }catch{/* Wait for the same-origin game to finish loading. */}
 }
 if(!supported)setState('unavailable','Recording is unavailable in this browser. You can still play.');
 else loadRecordingLogo().then(img=>{logo=img;watcher=setInterval(watchForStart,100);watchForStart();}).catch(()=>setState('unavailable','The replay logo could not load. Reload to try again; you can still play.'));
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){handledRound=null;for(const session of sessions)session.saveNow();}
  else watchForStart();
 });
 window.addEventListener('pagehide',()=>{unloading=true;clearInterval(watcher);for(const session of sessions)session.saveNow();});
 function connectGame(){
  if(active)active.finish('Game reloaded');handledRound=null;
  try{frame.contentWindow.addEventListener('motionquest:replay-state',watchForStart);const note=frame.contentDocument?.querySelector('#privacy-note, .camera-note, .privacy');if(note)note.textContent=game.id==='motion-quest'?'Your game and camera view record automatically after standing calibration, with game sound and no microphone. Nothing is uploaded unless you choose to share.':'Your game and camera view record automatically on this device. Nothing is uploaded unless you choose to share.';}catch{/* A failed frame still leaves arcade navigation available. */}
 }
 frame.addEventListener('load',connectGame);if(frame.contentDocument?.readyState==='complete')connectGame();
}
function mountClipCard(container,clip){
 let copyController=null;
 const card=document.createElement('article');card.className='clip-card';const url=objectURL(clip.blob);
 card.innerHTML=`<video controls playsinline preload="metadata" src="${url}" aria-label="${escape(clip.title)}"></video><h3>${escape(clip.title)}</h3><p>${clip.source==='synthetic'?'Synthetic gameplay':'Player recording'} · ${Math.round(clip.duration)} seconds · ${formatLabel(clip.blob)} · ${clip.unsaved?'Not saved — download before leaving':'Saved on this device'}</p>${formatLabel(clip.blob)==='WebM'?'<p>This browser saved WebM. For MP4 recording, use an updated Chrome or Edge on a supported device.</p>':''}<div class="clip-actions"><button class="share-file" data-friend>Share with a friend</button><a href="${url}" download="hopmodo-${clip.game}.${videoExtension(clip.blob)}">Download</a><button data-link>Copy game link</button>${clip.shareCopy?'':'<button data-copy>Make short share copy</button>'}<button data-cancel-copy hidden>Cancel copy</button><button data-share>Publish to gallery</button><button data-delete>Delete local clip</button></div><p class="clip-share-status" data-share-status role="status"></p><div data-publish></div>`;
 card.querySelector('[data-delete]').onclick=async()=>{copyController?.abort();try{if(!clip.unsaved)await deleteClip(clip.id);releaseURL(url);card.remove();if(!container.children.length)container.innerHTML='<p>No local clips yet. Open a game to record a clip.</p>';}catch{card.querySelector('[data-publish]').textContent='Could not delete this clip. Please retry.';}};
 const copyButton=card.querySelector('[data-copy]'),cancelCopy=card.querySelector('[data-cancel-copy]');
 if(copyButton)copyButton.onclick=async()=>{
  if(copyController)return;copyController=new AbortController();copyButton.disabled=true;cancelCopy.hidden=false;
  const status=card.querySelector('[data-share-status]');status.textContent='Preparing the final 55 seconds of gameplay plus an invitation. Keep this tab open; nothing is uploaded.';
  try{
   const copy=await createShareCopy(clip,{signal:copyController.signal,onProgress:text=>{status.textContent=text+' · stays on this device';}});
   try{await saveClip(copy);}catch{copy.unsaved=true;}
   const copyCard=mountClipCard(container,copy),heading=copyCard.querySelector('h3');heading.tabIndex=-1;heading.focus({preventScroll:true});copyCard.scrollIntoView({block:'start',behavior:'instant'});status.textContent='Share copy ready below. Preview it, then choose whether to publish it.';
  }catch(error){status.textContent=error.name==='AbortError'?'Share copy cancelled. Your original replay is safe.':error.message;}
  finally{copyController=null;copyButton.disabled=false;cancelCopy.hidden=true;}
 };
 cancelCopy.onclick=()=>copyController?.abort();
 mountFriendSharing(card,clip);
 card.querySelector('[data-share]').onclick=()=>publishForm(card.querySelector('[data-publish]'),clip);
 container.append(card);return card;
}
function mountFriendSharing(card,clip){
 const status=card.querySelector('[data-share-status]'),button=card.querySelector('[data-friend]');
 const gameURL=`${SITE_URL}/play/${encodeURIComponent(clip.game)}`;
 const file=new File([clip.blob],`hopmodo-${clip.game}.${videoExtension(clip.blob)}`,{type:clip.blob.type});
 button.onclick=async()=>{
  try{
   if(!navigator.share||!navigator.canShare?.({files:[file]})){
    status.textContent='This browser cannot share video files directly. Download your clip, then attach it in your messaging app. Copy game link invites friends to play.';
    card.querySelector('[download]').focus();return;
   }
   button.disabled=true;
   // Keep this call in the click event, before any await, to retain user activation.
   await navigator.share({files:[file],title:clip.title,text:`I played ${BRAND_NAME}. Try this game: ${gameURL}`});
   status.textContent='Share dialog completed. Your clip is still saved here.';
  }catch(error){status.textContent=error.name==='AbortError'?'Sharing cancelled. Your clip is still here.':'Could not share this file. Download your clip and attach it in your messaging app.';}
  finally{button.disabled=false;}
 };
 card.querySelector('[data-link]').onclick=async()=>{
  try{await navigator.clipboard.writeText(gameURL);status.textContent='Game link copied. This invites friends to play; it does not include your private clip.';}
  catch{status.textContent='Copy this game link. Your clip stays on this device.';const input=document.createElement('input');input.className='copy-fallback';input.readOnly=true;input.value=gameURL;input.setAttribute('aria-label','Game link');status.append(input);input.select();}
 };
}
async function publishForm(container,clip){
 container.innerHTML='<p role="status">Checking gallery availability…</p>';
 try{const config=await api('/api/config');if(!config.sharingEnabled){container.innerHTML='<p class="notice">Gallery sharing isn’t available yet. Your clip stays on this device. You can download it now.</p>';return;}
 if(!fitsWebsiteShare(clip)){container.innerHTML='<p class="notice">Website sharing accepts up to 60 seconds / 20 MiB. Make a short share copy, preview it, then publish that copy. Your full replay stays here.</p><button data-prepare-copy>Make short share copy</button>';container.querySelector('[data-prepare-copy]').onclick=()=>container.closest('.clip-card').querySelector('[data-copy]')?.click();return;}
 if(clip.shared){container.innerHTML=`<p>Already shared. <a class="text-link" href="/clips/${clip.id}">Open your gallery page →</a></p>`;return;}
 container.innerHTML=`<form class="publish-form"><h3>Share this clip in the gallery?</h3><label>Clip title<input name="title" maxlength="90" required value="${escape(clip.title)}"></label><label>Early-access upload code<input name="code" type="password" autocomplete="off" required minlength="12"></label><label><input type="checkbox" name="consent" required>I agree to publish this clip in the gallery and have permission from everyone shown.</label><p>People who can access this site can view and copy shared clips. You can remove yours using this device’s management key. Clips expire after 7 days.</p><button class="button primary" type="submit">Publish this clip ↗</button><p data-status role="status"></p></form>`;
 const form=container.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button'),status=form.querySelector('[data-status]');button.disabled=true;status.textContent='Publishing your clip…';
 try{clip.manageToken??=crypto.randomUUID()+crypto.randomUUID();if(clip.unsaved)throw new Error('Save this clip on the device before publishing so its management key is retained.');await updateClip(clip);
 const values=new FormData(form);const result=await api(`/api/clips/${clip.id}?title=${encodeURIComponent(values.get('title'))}&game=${encodeURIComponent(clip.game)}&source=${clip.source}&duration=${clip.duration}`,{method:'PUT',headers:{'Content-Type':clip.blob.type,'Authorization':`Bearer ${values.get('code')}`,'X-Sharing-Consent':'gallery-v1','X-Management-Key':clip.manageToken},body:clip.blob});
 clip.shared=true;clip.title=String(values.get('title'));await updateClip(clip);container.innerHTML=`<p>Published. <a class="text-link" href="${escape(result.url)}">Open your gallery page →</a></p>`;
 }catch(error){status.textContent=error.message;status.className='error';button.disabled=false;}};
 }catch(error){container.innerHTML=`<p class="error">${escape(error.message)} Your clip is still on this device.</p>`;}
}
export async function renderLibrary(container){
 container.innerHTML='<div class="utility-head"><div><p class="kicker">Saved on this device</p><h1>MY CLIPS.</h1><p>Saved on this device. Nothing is shared automatically.</p></div><a class="button primary" href="/#arcade">Choose a game ↗</a></div><div class="clip-grid" role="status">Loading your clips…</div>';
 const grid=container.querySelector('.clip-grid');try{const clips=await listClips();grid.innerHTML='';if(!clips.length){grid.className='empty-state';grid.innerHTML='<span class="empty-icon" aria-hidden="true">↻</span><h2>NO CLIPS YET.</h2><p>Start a game. Your replay saves here automatically when the round ends.</p><a class="text-link" href="/#arcade">Choose a game →</a>';}else clips.forEach(c=>mountClipCard(grid,c));}catch{grid.innerHTML='<p>Local storage is unavailable. Allow site storage in your browser and reload. You can still play games.</p>';}
}
export async function renderGallery(container){
 container.innerHTML='<div class="utility-head"><div><p class="kicker">Player recordings</p><h1>THE GALLERY.</h1><p class="lead">Watch shared game clips, then try a game yourself.</p></div><a class="button outline" href="/library">My local clips ↗</a></div><div id="gallery-body" role="status">Loading the gallery…</div>';
 const body=container.querySelector('#gallery-body');try{const data=await api('/api/clips'+location.search);
 if(data.enabled&&data.nextPageToken){const next=document.createElement('a');next.className='text-link';next.href='/gallery?page='+encodeURIComponent(data.nextPageToken);next.textContent='More clips →';body.after(next);}
 if(!data.enabled||!data.clips.length){body.innerHTML=`<div class="empty-state"><span class="empty-icon" aria-hidden="true">↗</span><h2>${data.enabled?(data.nextPageToken?'NO CLIPS ON THIS PAGE.':'NO SHARED CLIPS YET.'):'SHARING IS COMING SOON.'}</h2><p>${data.enabled?(data.nextPageToken?'Continue to the next page to find more shared clips.':'Record a game, then choose whether to share your clip here.'):'Gallery sharing isn’t available yet. In the meantime, play a game and keep your favorite moments on this device.'}</p><a class="button primary" href="/#arcade">Take me to the arcade ↗</a></div>`;return;}
 body.className='clip-grid';body.innerHTML=data.clips.map(c=>`<article class="clip-card"><video preload="none" controls playsinline src="/api/media/${c.id}" aria-label="${escape(c.title)}"></video><h3><a href="/clips/${c.id}">${escape(c.title)}</a></h3><p>${c.source==='synthetic'?'Synthetic gameplay':'Player recording'}</p><a class="text-link" href="/clips/${c.id}">Watch clip →</a></article>`).join('');
 }catch(error){body.innerHTML=`<div class="empty-state"><h2>COULDN’T LOAD THE GALLERY.</h2><p>${escape(error.message)}</p><a class="text-link" href="/gallery">Try again ↻</a></div>`;}
}
export async function renderClip(container,id){
 container.innerHTML='<p role="status">Loading clip…</p>';
 try{const clip=await api('/api/clips/'+encodeURIComponent(id));container.innerHTML=`<article class="clip-view"><a href="/gallery" class="back">← The gallery</a><h1>${escape(clip.title)}</h1><p>${clip.source==='synthetic'?'Synthetic gameplay':'Player recording'} · Shared until ${new Date(clip.expiresAt).toLocaleDateString()}</p><video controls playsinline src="/api/media/${clip.id}" aria-label="${escape(clip.title)}"></video><div class="clip-actions"><button id="copy-link">Copy link</button><button id="native-share">Share</button><button id="remove-shared" hidden>Remove shared clip</button></div><p id="share-status" role="status"></p><a class="button primary" href="/play/${encodeURIComponent(clip.game)}">Try this game ↗</a></article>`;
 const url=location.origin+'/clips/'+clip.id,status=container.querySelector('#share-status');document.title=clip.title+' · '+BRAND_NAME;
 container.querySelector('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(url);status.textContent='Link copied.';}catch{status.textContent='Copy this link: '+url;}};
 const share=container.querySelector('#native-share');share.hidden=!navigator.share;share.onclick=async()=>{try{await navigator.share({title:clip.title,url});}catch(error){if(error.name!=='AbortError')status.textContent='Sharing is unavailable. Use Copy link.';}};
 try{const local=(await listClips()).find(c=>c.id===clip.id&&c.manageToken);if(local){const remove=container.querySelector('#remove-shared');remove.hidden=false;remove.onclick=async()=>{remove.disabled=true;try{await api('/api/clips/'+clip.id,{method:'DELETE',headers:{Authorization:'Bearer '+local.manageToken}});local.shared=false;await updateClip(local);container.innerHTML='<h1>SHARED CLIP REMOVED.</h1><p>The shared clip has been removed. Your local copy is still in My clips.</p><a class="button primary" href="/library">My clips →</a>';}catch(error){status.textContent=error.message;remove.disabled=false;}};}}catch{/* Viewing a shared clip does not require local storage. */}
 }catch{container.innerHTML='<div class="empty-state"><h1>CLIP UNAVAILABLE.</h1><p>This clip may have expired, been removed, or isn’t available yet.</p><a class="button primary" href="/#arcade">Choose a game ↗</a></div>';}
}
