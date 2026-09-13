import {BRAND_NAME,SITE_URL} from './brand.js';
import {CLIP_WIDTH,CLIP_HEIGHT,loadRecordingLogo,drawClipFrame,drawClipEnding} from './clip-compositor.js';
import {saveClip,listClips,deleteClip,updateClip,MAX_BYTES} from './local-clips.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const urls=new Set();function objectURL(blob){const u=URL.createObjectURL(blob);urls.add(u);return u;}function releaseURL(u){URL.revokeObjectURL(u);urls.delete(u);}
window.addEventListener('pagehide',()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();});
async function api(path,options){const r=await fetch(path,options);const data=await r.json();if(!r.ok)throw new Error(data.error||'Please try again.');return data;}
export function mountRecording(game,frame){
 const panel=document.querySelector('#record-panel');
 panel.innerHTML=`<div><strong>Keep a replay?</strong><p id="record-status" role="status">Recording is off. Choose to record, then start your game.</p><p class="record-note">Up to 60 seconds · game and enabled camera · no audio · saved on this device</p></div><button id="record" class="button outline" disabled>Record my game</button><a href="/library">My clips →</a>`;
 const button=panel.querySelector('#record'),status=panel.querySelector('#record-status');
 const supported=typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function';
 let state='idle',logo=null,recorder=null,capture=null,raf=0,timer=0,endTimer=0,startAt=0,bytes=0,chunks=[],hadCamera=false,exceeded=false,unloading=false,context=null;
 function setState(next,message){state=next;panel.dataset.state=next;if(message&&status.textContent!==message)status.textContent=message;button.disabled=['finishing','saving'].includes(next)||!logo;button.textContent=next==='armed'?'Cancel recording':next==='recording'?'Stop & save clip':['finishing','saving'].includes(next)?'Saving clip…':'Record my game';}
 function readGame(){
  const doc=frame.contentDocument,canvas=doc?.querySelector('#game'),video=doc?.querySelector('#camera');
  if(!canvas?.width)return null;
  if(game.id==='motion-quest'){
   const reps=Number(doc.querySelector('#rep-count')?.textContent||0),demo=doc.querySelector('#demo-action');
   return {canvas,video,skeleton:doc.querySelector('#skeleton'),isAR:!!doc.querySelector('.camera-stage'),done:reps>=5,ready:!!(demo&&!demo.hidden||video?.srcObject&&doc.querySelector('#start')?.hidden),score:`${reps} / 5 squats`};
  }
  const snapshot=frame.contentWindow.dinoGame?.getState();
  return {canvas,video,isAR:false,done:snapshot?.status==='over',ready:snapshot?.status==='running',score:`${snapshot?.score||0} points`};
 }
 function stopCapture(){clearTimeout(timer);clearTimeout(endTimer);cancelAnimationFrame(raf);capture?.getTracks().forEach(t=>t.stop());capture=null;}
 function saveNow(message='Saving your clip on this device…'){
  clearTimeout(timer);clearTimeout(endTimer);cancelAnimationFrame(raf);
  if(!recorder||recorder.state==='inactive'){stopCapture();return;}
  setState('saving',message);recorder.stop();capture?.getTracks().forEach(t=>t.stop());
 }
 function finishRound(snapshot){
  setState('finishing','Round complete. Saving your replay…');cancelAnimationFrame(raf);clearTimeout(timer);
  drawClipEnding(context,game.title,snapshot.score,logo,hadCamera);
  // Canvas streams emit changed frames; keep the end card present in the encoded timeline.
  function holdEndFrame(){if(state!=='finishing')return;context.fillStyle='#182346';context.fillRect(0,0,1,1);capture?.getVideoTracks()[0]?.requestFrame?.();raf=requestAnimationFrame(holdEndFrame);}
  raf=requestAnimationFrame(holdEndFrame);
  endTimer=setTimeout(()=>saveNow(),Math.min(900,Math.max(0,60000-(performance.now()-startAt))));
 }
 function showResult(clip){
  if(unloading)return;
  const result=document.querySelector('#local-result');
  result.querySelectorAll('video').forEach(v=>{v.pause();releaseURL(v.src);});
  result.hidden=false;result.innerHTML='<h2 tabindex="-1">Your replay is ready.</h2><p>Watch it, then send it to a friend or keep it for yourself. Nothing has been uploaded.</p><div class="clip-grid"></div>';
  mountClipCard(result.querySelector('.clip-grid'),clip);
  if(!document.hidden){
   if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
   result.querySelector('h2').focus({preventScroll:true});result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  }
 }
 function start(snapshot){
  try{
   hadCamera=!!snapshot.video?.srcObject;
   const mime=['video/mp4;codecs=avc1','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mime)throw new Error('This browser cannot record a supported video. You can still play.');
   const canvas=document.createElement('canvas');canvas.width=CLIP_WIDTH;canvas.height=CLIP_HEIGHT;context=canvas.getContext('2d');
   chunks=[];bytes=0;exceeded=false;startAt=performance.now();capture=canvas.captureStream(24);
   recorder=new MediaRecorder(capture,{mimeType:mime,videoBitsPerSecond:2200000});
   recorder.ondataavailable=e=>{if(e.data.size){bytes+=e.data.size;if(bytes>MAX_BYTES){exceeded=true;saveNow('The recording reached the file limit.');}else chunks.push(e.data);}};
   recorder.onerror=()=>{exceeded=true;saveNow('Recording failed. Please try a shorter clip.');};
   recorder.onstop=async()=>{
    stopCapture();
    if(exceeded){chunks=[];setState('idle','This clip could not be saved. Try a shorter recording.');return;}
    const blob=new Blob(chunks,{type:mime.split(';')[0]});chunks=[];
    const clip={id:crypto.randomUUID(),title:`${game.title} · my replay`,game:game.id,createdAt:Date.now(),duration:Math.min(60,(performance.now()-startAt)/1000),source:hadCamera?'replay':'synthetic',includesCamera:hadCamera,brand:BRAND_NAME,website:SITE_URL,blob};
    try{await saveClip(clip);setState('idle','Saved on this device. Your replay is ready below.');}catch(error){clip.unsaved=true;setState('idle',`${error.message||'Could not save on this device.'} Download the clip below before leaving.`);}
    showResult(clip);
   };
   drawClipFrame(context,{...snapshot,includesCamera:hadCamera,title:game.title,logo});
   recorder.start(500);setState('recording','Recording your game…');timer=setTimeout(()=>saveNow('60-second limit reached. Saving your clip…'),60000);
   function paint(){
    try{
     const now=readGame();if(!now){saveNow('Game closed. Saving your clip…');return;}
     // Completion turns off the game's camera in the same frame. Keep the last camera frame for the end card.
     if(now.done){finishRound(now);return;}
     if(!!now.video?.srcObject!==hadCamera){saveNow('Camera changed. Saving your clip…');return;}
     drawClipFrame(context,{...now,includesCamera:hadCamera,title:game.title,logo});
     const message=`Recording ${Math.floor((performance.now()-startAt)/1000)} / 60 seconds · ${hadCamera?'game + camera':'synthetic game preview'} · stays on this device`;
     if(status.textContent!==message)status.textContent=message;raf=requestAnimationFrame(paint);
    }catch{saveNow('Game closed. Saving your clip…');}
   }
   raf=requestAnimationFrame(paint);
  }catch(error){stopCapture();if(recorder?.state==='recording')recorder.stop();setState('idle',error.message);}
 }
 function watchForStart(){
  if(state!=='armed')return;
  try{const snapshot=readGame();if(snapshot?.ready&&!snapshot.done){clearTimeout(timer);start(snapshot);return;}}catch{/* Wait for the same-origin game to finish loading. */}
  raf=requestAnimationFrame(watchForStart);
 }
 button.onclick=()=>{
  if(state==='recording'){saveNow();return;}
  if(state==='armed'){clearTimeout(timer);cancelAnimationFrame(raf);setState('idle','Recording cancelled. Nothing was recorded.');return;}
  if(state!=='idle'||!logo)return;
  setState('armed','Recording is ready. Start a new game below; your replay will save when the round ends.');
  timer=setTimeout(()=>{cancelAnimationFrame(raf);setState('idle','Recording timed out before the game started. Choose Record my game to try again.');},180000);
  watchForStart();
 };
 if(!supported){setState('idle','Recording is unavailable in this browser. You can still play.');button.hidden=true;}
 else loadRecordingLogo().then(img=>{logo=img;setState('idle');}).catch(()=>setState('idle','The recording logo could not load. Reload to try recording again; you can still play.'));
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)return;
  if(state==='armed'){clearTimeout(timer);cancelAnimationFrame(raf);setState('idle','Recording cancelled when you left the game.');}
  else if(['recording','finishing'].includes(state))saveNow('Game hidden. Saving your clip…');
 });
 window.addEventListener('pagehide',()=>{unloading=true;clearTimeout(timer);cancelAnimationFrame(raf);if(['recording','finishing'].includes(state))saveNow();else stopCapture();});
 function connectGame(){
  if(state==='recording')saveNow('Game reloaded. Saving your clip…');
  try{const doc=frame.contentDocument;const note=doc?.querySelector('#privacy-note, .camera-note');if(note)note.textContent='Tracking stays on this device. Optional recording is controlled above the game.';}catch{/* A failed frame still leaves arcade navigation available. */}
 }
 frame.addEventListener('load',connectGame);if(frame.contentDocument?.readyState==='complete')connectGame();
}
function mountClipCard(container,clip){
 const card=document.createElement('article');card.className='clip-card';const url=objectURL(clip.blob);
 card.innerHTML=`<video controls playsinline preload="metadata" src="${url}" aria-label="${escape(clip.title)}"></video><h3>${escape(clip.title)}</h3><p>${clip.source==='synthetic'?'Synthetic gameplay':'Player recording'} · ${Math.round(clip.duration)} seconds · ${clip.unsaved?'Not saved — download before leaving':'Saved on this device'}</p><div class="clip-actions"><button class="share-file" data-friend>Share with a friend</button><a href="${url}" download="hopmodo-${clip.game}.${clip.blob.type==='video/mp4'?'mp4':'webm'}">Download</a><button data-link>Copy game link</button><button data-share>Publish to gallery</button><button data-delete>Delete local clip</button></div><p class="clip-share-status" data-share-status role="status"></p><div data-publish></div>`;
 card.querySelector('[data-delete]').onclick=async()=>{try{if(!clip.unsaved)await deleteClip(clip.id);releaseURL(url);card.remove();if(!container.children.length)container.innerHTML='<p>No local clips yet. Open a game to record a clip.</p>';}catch{card.querySelector('[data-publish]').textContent='Could not delete this clip. Please retry.';}};
 mountFriendSharing(card,clip);
 card.querySelector('[data-share]').onclick=()=>publishForm(card.querySelector('[data-publish]'),clip);
 container.append(card);
}
function mountFriendSharing(card,clip){
 const status=card.querySelector('[data-share-status]'),button=card.querySelector('[data-friend]');
 const gameURL=`${SITE_URL}/play/${encodeURIComponent(clip.game)}`;
 const file=new File([clip.blob],`hopmodo-${clip.game}.${clip.blob.type==='video/mp4'?'mp4':'webm'}`,{type:clip.blob.type});
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
 const grid=container.querySelector('.clip-grid');try{const clips=await listClips();grid.innerHTML='';if(!clips.length){grid.className='empty-state';grid.innerHTML='<span class="empty-icon" aria-hidden="true">↻</span><h2>NO CLIPS YET.</h2><p>Open a game and choose “Record my game” when you’re ready. Your recordings will appear here.</p><a class="text-link" href="/#arcade">Choose a game →</a>';}else clips.forEach(c=>mountClipCard(grid,c));}catch{grid.innerHTML='<p>Local storage is unavailable. Allow site storage in your browser and reload. You can still play games.</p>';}
}
export async function renderGallery(container){
 container.innerHTML='<div class="utility-head"><div><p class="kicker">Player recordings</p><h1>THE GALLERY.</h1><p class="lead">Watch shared game clips, then try a game yourself.</p></div><a class="button outline" href="/library">My local clips ↗</a></div><div id="gallery-body" role="status">Loading the gallery…</div>';
 const body=container.querySelector('#gallery-body');try{const data=await api('/api/clips'+location.search);if(!data.enabled||!data.clips.length){body.innerHTML=`<div class="empty-state"><span class="empty-icon" aria-hidden="true">↗</span><h2>${data.enabled?'NO SHARED CLIPS YET.':'SHARING IS COMING SOON.'}</h2><p>${data.enabled?'Record a game, then choose whether to share your clip here.':'Gallery sharing isn’t available yet. In the meantime, play a game and keep your favorite moments on this device.'}</p><a class="button primary" href="/#arcade">Take me to the arcade ↗</a></div>`;return;}
 body.className='clip-grid';body.innerHTML=data.clips.map(c=>`<article class="clip-card"><video preload="none" controls playsinline src="/api/media/${c.id}" aria-label="${escape(c.title)}"></video><h3><a href="/clips/${c.id}">${escape(c.title)}</a></h3><p>${c.source==='synthetic'?'Synthetic gameplay':'Player recording'}</p><a class="text-link" href="/clips/${c.id}">Watch clip →</a></article>`).join('');
 if(data.nextPageToken){const next=document.createElement('a');next.className='text-link';next.href='/gallery?page='+encodeURIComponent(data.nextPageToken);next.textContent='More clips →';body.after(next);}
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
