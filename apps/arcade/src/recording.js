import {saveClip,listClips,deleteClip,updateClip,MAX_BYTES} from './local-clips.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const urls=new Set();function objectURL(blob){const u=URL.createObjectURL(blob);urls.add(u);return u;}function releaseURL(u){URL.revokeObjectURL(u);urls.delete(u);}
window.addEventListener('pagehide',()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();});
async function api(path,options){const r=await fetch(path,options);const data=await r.json();if(!r.ok)throw new Error(data.error||'Please try again.');return data;}
export function mountRecording(game,frame){
 const panel=document.querySelector('#record-panel');
 panel.innerHTML=`<div><strong>Your game. Your choice.</strong><p id="record-status" role="status">Recording is off. Record up to 60 seconds of the game and your camera if already enabled. No audio. Nothing uploads.</p></div><button id="record" class="button outline" disabled>Record game + camera</button><a href="/library">My clips →</a>`;
 const button=document.querySelector('#record'),status=document.querySelector('#record-status');
 let recorder=null,capture=null,raf=0,timer=0,startAt=0,bytes=0,chunks=[],hadCamera=false,exceeded=false,unloading=false;
 const supported=typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function';
 if(!supported){status.textContent='Recording is unavailable in this browser. You can still play.';button.hidden=true;}
 frame.addEventListener('load',()=>{button.disabled=!supported;try{const note=frame.contentDocument.querySelector('.camera-note');if(note)note.textContent='On-device tracking · optional recording controlled above · relative jump height';}catch{status.textContent='The game could not be connected for recording.';button.disabled=true;}});
 function stop(reason='Clip finished. Saving on this device…'){if(!recorder||recorder.state==='inactive')return;clearTimeout(timer);cancelAnimationFrame(raf);status.textContent=reason;button.disabled=true;recorder.stop();capture?.getTracks().forEach(t=>t.stop());}
 async function start(){
  try{
   const doc=frame.contentDocument,gameCanvas=doc?.querySelector('#game'),camera=doc?.querySelector('#camera');if(!gameCanvas?.width)throw new Error('Wait for the game to load, then try again.');
   if(game.id==='motion-quest'&&doc.querySelector('#rep-count')?.textContent==='5')throw new Error('Start a new round before recording.');
   hadCamera=!!camera?.srcObject;const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw new Error('This browser cannot create a supported clip.');
   const canvas=document.createElement('canvas');canvas.width=960;canvas.height=600;const c=canvas.getContext('2d');chunks=[];bytes=0;exceeded=false;startAt=performance.now();capture=canvas.captureStream(24);recorder=new MediaRecorder(capture,{mimeType:mime,videoBitsPerSecond:1800000});
   recorder.ondataavailable=e=>{if(e.data.size){bytes+=e.data.size;if(bytes>MAX_BYTES){exceeded=true;stop('Recording reached the file limit.');}else chunks.push(e.data);}};
   recorder.onerror=()=>{exceeded=true;stop('Recording failed. Please try a shorter clip.');};
   recorder.onstop=async()=>{
    clearTimeout(timer);cancelAnimationFrame(raf);capture?.getTracks().forEach(t=>t.stop());capture=null;button.disabled=false;button.textContent='Record game + camera';
    if(exceeded){chunks=[];status.textContent='This clip could not be saved. Try a shorter recording.';return;}
    const blob=new Blob(chunks,{type:mime.split(';')[0]});chunks=[];const clip={id:crypto.randomUUID(),title:`${game.title} · my move`,game:game.id,createdAt:Date.now(),duration:Math.min(60,(performance.now()-startAt)/1000),source:hadCamera?'replay':'synthetic',includesCamera:hadCamera,blob};
    try{await saveClip(clip);status.textContent='Saved on this device. Preview your clip below or open My clips.';}catch(error){status.textContent=`${error.message||'Could not save on this device.'} Download your clip below before leaving.`;clip.unsaved=true;}
    if(!unloading){const result=document.querySelector('#local-result');result.hidden=false;result.innerHTML='<h2>Your little replay.</h2><p>Only on this device. Take a look before choosing what to do next.</p><div class="clip-grid"></div>';mountClipCard(result.querySelector('.clip-grid'),clip);}
   };
   function paint(){
    try{const doc=frame.contentDocument,source=doc?.querySelector('#game'),video=doc?.querySelector('#camera');if(!source)throw new Error('Game closed');const cameraNow=!!video?.srcObject;if(cameraNow!==hadCamera){stop('Camera state changed. Saving this clip; start a new recording to continue.');return;}
    c.fillStyle='#182346';c.fillRect(0,0,960,600);const ratio=Math.min(960/source.width,540/source.height);c.drawImage(source,(960-source.width*ratio)/2,(540-source.height*ratio)/2,source.width*ratio,source.height*ratio);
    if(hadCamera&&video.readyState>=2){c.save();c.translate(940,350);c.scale(-1,1);c.drawImage(video,0,0,220,165);c.restore();}
    c.fillStyle='#eeff41';c.fillRect(0,540,960,60);c.fillStyle='#182346';c.font='bold 21px Arial';c.fillText('fitness pair  /  '+game.title,25,578);c.font='15px Arial';c.fillText(hadCamera?'Player recording':'Synthetic gameplay preview',660,577);
    const done=game.id==='motion-quest'?doc.querySelector('#rep-count')?.textContent==='5':frame.contentWindow.dinoGame?.getState()?.status==='over';
    if(done){stop();return;}status.textContent=`Recording ${Math.floor((performance.now()-startAt)/1000)} / 60 seconds · ${hadCamera?'game + camera':'game only, synthetic preview'} · stays on this device`;raf=requestAnimationFrame(paint);
    }catch{stop('Game closed. Saving your clip…');}
   }
   recorder.start(500);button.textContent='Stop & save clip';button.disabled=false;timer=setTimeout(()=>stop(),60000);paint();
  }catch(error){capture?.getTracks().forEach(t=>t.stop());status.textContent=error.message;button.disabled=false;}
 }
 button.onclick=()=>recorder?.state==='recording'?stop():start();
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('Paused. Saving your clip…');});
 window.addEventListener('pagehide',()=>{unloading=true;stop();capture?.getTracks().forEach(t=>t.stop());});
}
function mountClipCard(container,clip){
 const card=document.createElement('article');card.className='clip-card';const url=objectURL(clip.blob);
 card.innerHTML=`<video controls playsinline preload="metadata" src="${url}" aria-label="${escape(clip.title)}"></video><h3>${escape(clip.title)}</h3><p>${clip.source==='synthetic'?'Synthetic gameplay':'Player recording'} · ${Math.round(clip.duration)} seconds · ${clip.unsaved?'Not saved — download before leaving':'Saved on this device'}</p><div class="clip-actions"><a href="${url}" download="fitness-pair-${clip.game}.${clip.blob.type==='video/mp4'?'mp4':'webm'}">Download</a><button data-share>Share to gallery</button><button data-delete>Delete local clip</button></div><div data-publish></div>`;
 card.querySelector('[data-delete]').onclick=async()=>{try{if(!clip.unsaved)await deleteClip(clip.id);releaseURL(url);card.remove();if(!container.children.length)container.innerHTML='<p>No local clips yet. Your next little replay starts in the arcade.</p>';}catch{card.querySelector('[data-publish]').textContent='Could not delete this clip. Please retry.';}};
 card.querySelector('[data-share]').onclick=()=>publishForm(card.querySelector('[data-publish]'),clip);
 container.append(card);
}
async function publishForm(container,clip){
 container.innerHTML='<p role="status">Checking gallery availability…</p>';
 try{const config=await api('/api/config');if(!config.sharingEnabled){container.innerHTML='<p class="notice">Community publishing is being connected. Your clip stays on this device. You can download it now.</p>';return;}
 if(clip.shared){container.innerHTML=`<p>Already shared. <a class="text-link" href="/clips/${clip.id}">Open your gallery page →</a></p>`;return;}
 container.innerHTML=`<form class="publish-form"><h3>Put this move in the gallery?</h3><label>Clip title<input name="title" maxlength="90" required value="${escape(clip.title)}"></label><label>Early-access upload code<input name="code" type="password" autocomplete="off" required minlength="12"></label><label><input type="checkbox" name="consent" required>I agree to publish this clip in the gallery and have permission from everyone shown.</label><p>People who can access this site can view and copy shared clips. You can remove yours using this device’s management key. Clips expire after 7 days.</p><button class="button primary" type="submit">Publish this clip ↗</button><p data-status role="status"></p></form>`;
 const form=container.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button'),status=form.querySelector('[data-status]');button.disabled=true;status.textContent='Publishing your clip…';
 try{clip.manageToken??=crypto.randomUUID()+crypto.randomUUID();if(clip.unsaved)throw new Error('Save this clip on the device before publishing so its management key is retained.');await updateClip(clip);
 const values=new FormData(form);const result=await api(`/api/clips/${clip.id}?title=${encodeURIComponent(values.get('title'))}&game=${encodeURIComponent(clip.game)}&source=${clip.source}&duration=${clip.duration}`,{method:'PUT',headers:{'Content-Type':clip.blob.type,'Authorization':`Bearer ${values.get('code')}`,'X-Sharing-Consent':'gallery-v1','X-Management-Key':clip.manageToken},body:clip.blob});
 clip.shared=true;clip.title=String(values.get('title'));await updateClip(clip);container.innerHTML=`<p>Published. <a class="text-link" href="${escape(result.url)}">Open your gallery page →</a></p>`;
 }catch(error){status.textContent=error.message;status.className='error';button.disabled=false;}};
 }catch(error){container.innerHTML=`<p class="error">${escape(error.message)} Your clip is still on this device.</p>`;}
}
export async function renderLibrary(container){
 container.innerHTML='<div class="utility-head"><div><p class="kicker">The local replay collection</p><h1>YOUR GOOD MOVES.</h1><p>Saved on this device. Nothing is shared automatically.</p></div><a class="button primary" href="/#arcade">Play something ↗</a></div><div class="clip-grid" role="status">Loading your clips…</div>';
 const grid=container.querySelector('.clip-grid');try{const clips=await listClips();grid.innerHTML='';if(!clips.length){grid.className='empty-state';grid.innerHTML='<span class="empty-icon" aria-hidden="true">↻</span><h2>A REPLAY STARTS WITH PLAY.</h2><p>Open a game and choose “Record game + camera” when you’re ready. Your finished clips will live right here.</p><a class="text-link" href="/#arcade">Find your first game →</a>';}else clips.forEach(c=>mountClipCard(grid,c));}catch{grid.innerHTML='<p>Local storage is unavailable. Allow site storage in your browser and reload. You can still play games.</p>';}
}
export async function renderGallery(container){
 container.innerHTML='<div class="utility-head"><div><p class="kicker">A little play, passed around</p><h1>THE GOOD-MOVE GALLERY.</h1><p class="lead">Player-selected moments. New reasons to give it a go.</p></div><a class="button outline" href="/library">My local clips ↗</a></div><div id="gallery-body" role="status">Loading the gallery…</div>';
 const body=container.querySelector('#gallery-body');try{const data=await api('/api/clips'+location.search);if(!data.enabled||!data.clips.length){body.innerHTML=`<div class="empty-state"><span class="empty-icon" aria-hidden="true">↗</span><h2>${data.enabled?'THE FIRST MOVE IS YOURS.':'GOOD MOVES ARE ON THEIR WAY.'}</h2><p>${data.enabled?'No shared clips yet. Make a little replay and choose whether to publish it.':'Community publishing is being connected. In the meantime, play a game and keep your favorite moments on this device.'}</p><a class="button primary" href="/#arcade">Take me to the arcade ↗</a></div>`;return;}
 body.className='clip-grid';body.innerHTML=data.clips.map(c=>`<article class="clip-card"><video preload="none" controls playsinline src="/api/media/${c.id}" aria-label="${escape(c.title)}"></video><h3><a href="/clips/${c.id}">${escape(c.title)}</a></h3><p>${c.source==='synthetic'?'Synthetic gameplay':'Player recording'}</p><a class="text-link" href="/clips/${c.id}">See this move →</a></article>`).join('');
 if(data.nextPageToken){const next=document.createElement('a');next.className='text-link';next.href='/gallery?page='+encodeURIComponent(data.nextPageToken);next.textContent='More moves →';body.after(next);}
 }catch(error){body.innerHTML=`<div class="empty-state"><h2>THE GALLERY IS TAKING A BREATHER.</h2><p>${escape(error.message)}</p><a class="text-link" href="/gallery">Try again ↻</a></div>`;}
}
export async function renderClip(container,id){
 container.innerHTML='<p role="status">Finding that move…</p>';
 try{const clip=await api('/api/clips/'+encodeURIComponent(id));container.innerHTML=`<article class="clip-view"><a href="/gallery" class="back">← The gallery</a><h1>${escape(clip.title)}</h1><p>${clip.source==='synthetic'?'Synthetic gameplay':'Player recording'} · Shared until ${new Date(clip.expiresAt).toLocaleDateString()}</p><video controls playsinline src="/api/media/${clip.id}" aria-label="${escape(clip.title)}"></video><div class="clip-actions"><button id="copy-link">Copy link</button><button id="native-share">Share</button><button id="remove-shared" hidden>Remove shared clip</button></div><p id="share-status" role="status"></p><a class="button primary" href="/play/${encodeURIComponent(clip.game)}">Try this game ↗</a></article>`;
 const url=location.origin+'/clips/'+clip.id,status=container.querySelector('#share-status');document.title=clip.title+' · Fitness Pair';
 container.querySelector('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(url);status.textContent='Link copied.';}catch{status.textContent='Copy this link: '+url;}};
 const share=container.querySelector('#native-share');share.hidden=!navigator.share;share.onclick=async()=>{try{await navigator.share({title:clip.title,url});}catch(error){if(error.name!=='AbortError')status.textContent='Sharing is unavailable. Use Copy link.';}};
 try{const local=(await listClips()).find(c=>c.id===clip.id&&c.manageToken);if(local){const remove=container.querySelector('#remove-shared');remove.hidden=false;remove.onclick=async()=>{remove.disabled=true;try{await api('/api/clips/'+clip.id,{method:'DELETE',headers:{Authorization:'Bearer '+local.manageToken}});local.shared=false;await updateClip(local);container.innerHTML='<h1>THAT MOVE IS YOURS AGAIN.</h1><p>The shared clip has been removed. Your local copy is still in My clips.</p><a class="button primary" href="/library">My clips →</a>';}catch(error){status.textContent=error.message;remove.disabled=false;}};}}catch{/* Viewing a shared clip does not require local storage. */}
 }catch{container.innerHTML='<div class="empty-state"><h1>THAT MOMENT HAS MOVED ON.</h1><p>This clip may have expired, been removed, or isn’t available yet.</p><a class="button primary" href="/#arcade">Make your own move ↗</a></div>';}
}
