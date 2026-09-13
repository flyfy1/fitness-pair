import {attachConversationPlayback} from './conversation-playback.js';
import {games} from './games.js';
import {getSession,loginURL,accountAPI,storageLabel,removeSharedClip,confirmRemoval} from './account.js';
import {createShareCopy,fitsWebsiteShare} from './share-copy.js';
import {videoExtension,formatLabel} from './video-format.js';
import {BRAND_NAME,SITE_URL} from './brand.js';
import {saveClip,listClips,deleteClip,updateClip,MAX_CLIPS} from './local-clips.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const urls=new Set();function objectURL(blob){const u=URL.createObjectURL(blob);urls.add(u);return u;}function releaseURL(u){URL.revokeObjectURL(u);urls.delete(u);}
window.addEventListener('pagehide',()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();});
window.addEventListener('local-clips:changed',event=>{
 document.querySelectorAll('.clip-card[data-clip-id]').forEach(card=>{if(!card.dataset.unsaved&&!event.detail.includes(card.dataset.clipId))card.dispose?.();});
});
const api=accountAPI;
function playClipGame(clip, className='button primary'){
 const game=games.find(game=>game.id===clip.game&&game.kind==='playable');
 return game?`<a class="${className}" href="/play/${game.id}">Play ${escape(game.title)} ↗</a>`:'';
}
export function mountClipCard(container,clip){
 let copyController=null,selectedClip=clip,mixedClip=null,voicePlayback=null;
 const card=document.createElement('article');card.className='clip-card';card.dataset.clipId=clip.id;card.dataset.createdAt=clip.createdAt;if(clip.unsaved)card.dataset.unsaved='true';const url=objectURL(clip.blob),ownedURLs=[url];
 card.innerHTML=`<video controls playsinline preload="metadata" src="${url}" aria-label="${escape(clip.title)}"></video><h3>${escape(clip.title)}</h3><p>${clip.source==='synthetic'?'Synthetic gameplay':'Player recording'} · ${Math.round(clip.duration)} seconds${clip.playbackRate===2?' · 2× speed':''} · ${formatLabel(clip.blob)} · ${clip.unsaved?'Not saved — download before leaving':'Saved on this device'}</p>${formatLabel(clip.blob)==='WebM'?'<p>This browser saved WebM. For MP4 recording, use an updated Chrome or Edge on a supported device.</p>':''}${clip.conversation?'<div class="conversation-choice"><label><input type="checkbox" data-voice-preview checked> Listen to recorded voice in replay</label><label><input type="checkbox" data-conversation> Include conversation in video downloads &amp; sharing</label><p data-conversation-status>Video downloads exclude voice until selected above. The recorded voice stays on this device.</p><a data-conversation-download>Download conversation track</a></div>':clip.conversationEmbedded?'<p>Conversation included in this version. The original video is kept separately.</p>':''}<div class="clip-actions"><button class="share-file" data-friend>Share with a friend</button><a href="${url}" download="hopmodo-${clip.game}.${videoExtension(clip.blob)}">Download</a><button data-link>Copy game link</button>${clip.shareCopy?'':'<button data-copy>Make short share copy</button>'}<button data-cancel-copy hidden>Cancel copy</button><button data-share>Publish to gallery</button><button data-delete>Delete local clip</button></div><p class="clip-share-status" data-share-status role="status"></p><div data-publish></div>`;
 card.dispose=()=>{copyController?.abort();voicePlayback?.dispose();card.querySelector('video').pause();ownedURLs.forEach(releaseURL);card.remove();};
 card.querySelector('[data-delete]').onclick=async()=>{copyController?.abort();try{if(!selectedClip.unsaved)await deleteClip(selectedClip.id);if(selectedClip!==clip){mixedClip=null;card.querySelector('[data-conversation]').checked=false;selectClip(clip);return;}card.dispose();if(!container.children.length)container.innerHTML='<p>No local clips yet. Open a game to record a clip.</p>';}catch{card.querySelector('[data-publish]').textContent='Could not delete this clip. Please retry.';}};
 const download=card.querySelector('.clip-actions [download]');let downloadClip=null;
 download.onclick=async event=>{
  if(selectedClip.branded!==false)return;
  event.preventDefault();if(copyController)return;
  const source=selectedClip,status=card.querySelector('[data-share-status]');
  copyController=new AbortController();card.querySelector('[data-cancel-copy]').hidden=false;
  status.textContent='Preparing your download with a Hopmodo banner and ending. Keep this tab open.';
  try{
   if(downloadClip?.parentId!==source.id)downloadClip=await createShareCopy(source,{fullLength:true,brandedDownload:true,signal:copyController.signal,onProgress:text=>{status.textContent=text;}});
   const exportURL=objectURL(downloadClip.blob);ownedURLs.push(exportURL);
   const link=document.createElement('a');link.href=exportURL;link.download=`hopmodo-${clip.game}${source.conversationEmbedded?'-with-conversation':''}.${videoExtension(downloadClip.blob)}`;document.body.append(link);link.click();link.remove();
   status.textContent='Download ready. Your preview and gallery upload keep the original video without promotional branding.';
  }catch(error){status.textContent=error.name==='AbortError'?'Download cancelled. Your original replay is safe.':error.message;}
  finally{copyController=null;card.querySelector('[data-cancel-copy]').hidden=true;}
 };
 const copyButton=card.querySelector('[data-copy]'),cancelCopy=card.querySelector('[data-cancel-copy]');
 if(copyButton)copyButton.onclick=async()=>{
  if(copyController)return;copyController=new AbortController();copyButton.disabled=true;cancelCopy.hidden=false;
  const status=card.querySelector('[data-share-status]');status.textContent='Preparing the final 55 seconds of gameplay without a promotional banner or ending. Keep this tab open; nothing is uploaded.';
  try{
   const copy=await createShareCopy(selectedClip,{signal:copyController.signal,onProgress:text=>{status.textContent=text+' · stays on this device';}});
   try{await saveClip(copy);}catch{copy.unsaved=true;}
   const copyCard=mountClipCard(container,copy),heading=copyCard.querySelector('h3');heading.tabIndex=-1;heading.focus({preventScroll:true});copyCard.scrollIntoView({block:'start',behavior:'instant'});status.textContent='Share copy ready below. Preview it, then choose whether to publish it.';
  }catch(error){status.textContent=error.name==='AbortError'?'Share copy cancelled. Your original replay is safe.':error.message;}
  finally{copyController=null;copyButton.disabled=false;cancelCopy.hidden=true;}
 };
 cancelCopy.onclick=()=>copyController?.abort();
 mountFriendSharing(card,clip);
 card.querySelector('[data-share]').onclick=()=>publishForm(card.querySelector('[data-publish]'),selectedClip);

 function selectClip(value){
  selectedClip=value;const mediaURL=value===clip?url:objectURL(value.blob);if(value!==clip)ownedURLs.push(mediaURL);
  const video=card.querySelector('video');video.pause();video.src=mediaURL;
  const listen=card.querySelector('[data-voice-preview]');if(listen)listen.disabled=value!==clip;
  const download=card.querySelector('.clip-actions [download]');download.href=mediaURL;download.download=`hopmodo-${clip.game}${value.conversationEmbedded?'-with-conversation':''}.${videoExtension(value.blob)}`;
  const note=card.querySelector('[data-conversation-status]');if(note)note.textContent=value===clip?'Video downloads exclude voice until selected above. The recorded voice stays on this device.':'With conversation. Preview this version before sharing.';
  card.querySelector('[data-publish]').innerHTML='';mountFriendSharing(card,value);
 }
 const choice=card.querySelector('[data-conversation]');
 if(choice){
  const video=card.querySelector('video'),listen=card.querySelector('[data-voice-preview]');
  voicePlayback=attachConversationPlayback(video,clip.conversation,{
   enabled:()=>selectedClip===clip&&listen.checked,sourceRate:clip.playbackRate||1,
   onState:playing=>{card.dataset.voicePlaying=String(playing);},
   onError:()=>{card.querySelector('[data-conversation-status]').textContent='Voice was recorded. Use the conversation track download if your browser blocks its playback.';},
  });
  listen.onchange=voicePlayback.sync;
  const track=card.querySelector('[data-conversation-download]'),audioURL=objectURL(clip.conversation.blob);ownedURLs.push(audioURL);
  track.href=audioURL;track.download=`hopmodo-${clip.game}-conversation.${clip.conversation.blob.type.startsWith('audio/mp4')?'m4a':'webm'}`;
  choice.onchange=async()=>{
   if(!choice.checked){selectClip(clip);return;}
   if(mixedClip){selectClip(mixedClip);return;}
   if(copyController){choice.checked=false;return;}
   copyController=new AbortController();choice.disabled=true;cancelCopy.hidden=false;
   const actions=[...card.querySelectorAll('.clip-actions button')].filter(b=>b!==cancelCopy);actions.forEach(b=>b.disabled=true);
   const download=card.querySelector('.clip-actions [download]');download.removeAttribute('href');download.setAttribute('aria-disabled','true');
   const status=card.querySelector('[data-share-status]');status.textContent='Preparing a video with conversation on this device. This takes the replay length. Keep this tab open.';
   try{
    mixedClip=await createShareCopy(clip,{fullLength:true,includeConversation:true,signal:copyController.signal,onProgress:text=>{status.textContent=text;}});
    try{await saveClip(mixedClip);}catch{mixedClip.unsaved=true;}
    selectClip(mixedClip);status.textContent=mixedClip.unsaved?'Ready to download. This version could not be saved; download it before leaving.':'Conversation version ready. The original and separate track are kept in My clips.';
   }catch(error){choice.checked=false;selectClip(clip);status.textContent=error.name==='AbortError'?'Preparation cancelled. Your original and conversation track are safe.':error.message;}
   finally{copyController=null;choice.disabled=false;cancelCopy.hidden=true;actions.forEach(b=>b.disabled=false);download.removeAttribute('aria-disabled');}
  };
 }
 container.append(card);
 [...container.querySelectorAll('.clip-card')].sort((a,b)=>Number(b.dataset.createdAt)-Number(a.dataset.createdAt)).slice(MAX_CLIPS).forEach(old=>old.dispose?.());
 return card;
}
function mountFriendSharing(card,clip){
 const status=card.querySelector('[data-share-status]'),button=card.querySelector('[data-friend]');
 const gameURL=`${SITE_URL}/play/${encodeURIComponent(clip.game)}`;
 const file=new File([clip.blob],`hopmodo-${clip.game}${clip.conversationEmbedded?'-with-conversation':''}.${videoExtension(clip.blob)}`,{type:clip.blob.type});
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
 container.innerHTML='<p role="status">Checking your account…</p>';
 try{
  const config=await api('/api/config');
  if(!config.sharingEnabled){container.innerHTML='<p class="notice">Gallery sharing isn’t available yet. Your clip stays on this device. You can download it now.</p>';return;}
  if(!fitsWebsiteShare(clip)){container.innerHTML='<p class="notice">Website sharing accepts up to 60 seconds / 20 MiB. Make a short share copy, preview it, then publish that copy. Your full replay stays here.</p><button data-prepare-copy>Make short share copy</button>';container.querySelector('[data-prepare-copy]').onclick=()=>container.closest('.clip-card').querySelector('[data-copy]')?.click();return;}
  if(clip.unsaved){container.innerHTML='<p class="notice">Save or download this clip before leaving the page to log in. It has not been saved on this device yet.</p>';return;}
  const session=await getSession();
  if(!session.user){container.innerHTML=`<div class="publish-form"><h3>Log in to publish your clip.</h3><p>Use your Integ.Life account to manage your shared videos from any device. You get 2 GB of shared storage.</p><a class="button primary" href="${loginURL('/library?publish='+clip.id)}">Log in with Integ.Life ↗</a><p>Your saved video stays on this device. After login, you can review it before publishing.</p></div>`;return;}
  if(clip.shared){
   try{await api('/api/clips/'+clip.id);container.innerHTML=`<p>Already shared. <a class="text-link" href="/clips/${clip.id}">Open your gallery page →</a></p>`;return;}
   catch(error){if(error.status!==404)throw error;clip.shared=false;await updateClip(clip);}
  }
  const account=await api('/api/account/clips'),remaining=Math.max(0,account.limitBytes-account.usedBytes);
  container.innerHTML=`<form class="publish-form"><h3>Share this clip in the gallery?</h3><p>Publishing as <strong>${escape(session.user.email)}</strong> · <a href="/shared">My shared clips</a></p><label>Clip title<input name="title" maxlength="90" required value="${escape(clip.title)}"></label><p>${storageLabel(clip.blob.size)} to upload · ${storageLabel(remaining)} available of 2 GB</p><label><input type="checkbox" name="consent" required>I agree to publish this clip in the gallery and have permission from everyone shown.</label><p>Anyone with the link can view and copy this clip. You can remove it from My shared clips on any device. Clips expire after 7 days.</p><button class="button primary" type="submit" ${clip.blob.size>remaining?'disabled':''}>Publish this clip ↗</button><p data-status role="status">${clip.blob.size>remaining?'Your shared storage is full. Remove a clip from My shared clips to free space.':''}</p></form>`;
  const form=container.querySelector('form');
  form.onsubmit=async event=>{
   event.preventDefault();const button=form.querySelector('button'),status=form.querySelector('[data-status]');button.disabled=true;status.textContent='Publishing your clip…';
   try{
    const title=String(new FormData(form).get('title'));
    const result=await api(`/api/clips/${clip.id}?title=${encodeURIComponent(title)}&game=${encodeURIComponent(clip.game)}&source=${clip.source}&duration=${clip.duration}`,{method:'PUT',headers:{'Content-Type':clip.blob.type,'X-CSRF-Token':session.csrfToken,'X-Sharing-Consent':'gallery-v1'},body:clip.blob});
    clip.shared=true;clip.title=title;
    try{await updateClip(clip);}catch{/* Account ownership persists even if local storage becomes unavailable. */}
    container.innerHTML=`<p>Published. <a class="text-link" href="${escape(result.url)}">Open your gallery page →</a> · <a href="/shared">Manage my shared clips</a></p>`;
   }catch(error){
    status.textContent=error.message;status.className='error';button.disabled=false;
    if(error.status===401){const link=document.createElement('a');link.className='text-link';link.href=loginURL('/library?publish='+clip.id);link.textContent='Log in again →';status.append(' ',link);}
   }
  };
 }catch(error){container.innerHTML=`<p class="error">${escape(error.message)} Your clip is still on this device.</p>`;}
}
export async function renderLibrary(container){
 container.innerHTML='<div class="utility-head"><div><p class="kicker">Saved on this device</p><h1>MY CLIPS.</h1><p>Only your two latest videos are kept on this device. Download any you want to keep. Nothing is shared automatically. <a class="text-link" href="/shared">Manage my shared clips →</a></p></div><a class="button primary" href="/#arcade">Choose a game ↗</a></div><div class="clip-grid" role="status">Loading your clips…</div>';
 const grid=container.querySelector('.clip-grid');try{const clips=await listClips();grid.innerHTML='';if(!clips.length){grid.className='empty-state';grid.innerHTML='<span class="empty-icon" aria-hidden="true">↻</span><h2>NO CLIPS YET.</h2><p>Start a game. Your replay saves here automatically when the round ends.</p><a class="text-link" href="/#arcade">Choose a game →</a>';}else{clips.forEach(c=>mountClipCard(grid,c));const resume=new URLSearchParams(location.search).get('publish');if(resume&&!new URLSearchParams(location.search).has('login')){const clip=clips.find(c=>c.id===resume);if(clip){const card=grid.children[clips.indexOf(clip)];await publishForm(card.querySelector('[data-publish]'),clip);card.scrollIntoView({block:'start'});}}}}catch{grid.innerHTML='<p>Local storage is unavailable. Allow site storage in your browser and reload. You can still play games.</p>';}
}
export async function renderGallery(container){
 container.innerHTML='<div class="utility-head"><div><p class="kicker">Player recordings</p><h1>THE GALLERY.</h1><p class="lead">Watch shared game clips, then play the same game. No login needed to play.</p></div><a class="button outline" href="/library">My local clips ↗</a></div><div id="gallery-body" role="status">Loading the gallery…</div>';
 const body=container.querySelector('#gallery-body');try{const data=await api('/api/clips'+location.search);
 if(data.enabled&&data.nextPageToken){const next=document.createElement('a');next.className='text-link';next.href='/gallery?page='+encodeURIComponent(data.nextPageToken);next.textContent='More clips →';body.after(next);}
 if(!data.enabled||!data.clips.length){body.innerHTML=`<div class="empty-state"><span class="empty-icon" aria-hidden="true">↗</span><h2>${data.enabled?(data.nextPageToken?'NO CLIPS ON THIS PAGE.':'NO SHARED CLIPS YET.'):'SHARING IS COMING SOON.'}</h2><p>${data.enabled?(data.nextPageToken?'Continue to the next page to find more shared clips.':'Record a game, then choose whether to share your clip here.'):'Gallery sharing isn’t available yet. In the meantime, play a game and keep your favorite moments on this device.'}</p><a class="button primary" href="/#arcade">Take me to the arcade ↗</a></div>`;return;}
 body.className='clip-grid';body.innerHTML=data.clips.map(c=>`<article class="clip-card"><video preload="none" controls playsinline src="/api/media/${c.id}" aria-label="${escape(c.title)}"></video><h3><a href="/clips/${c.id}">${escape(c.title)}</a></h3><p>${c.source==='synthetic'?'Synthetic gameplay':'Player recording'}</p><div class="clip-actions"><a href="/clips/${c.id}">Watch clip →</a>${playClipGame(c,'play-clip-game')}</div></article>`).join('');
 }catch(error){body.innerHTML=`<div class="empty-state"><h2>COULDN’T LOAD THE GALLERY.</h2><p>${escape(error.message)}</p><a class="text-link" href="/gallery">Try again ↻</a></div>`;}
}
export async function renderClip(container,id){
 container.innerHTML='<p role="status">Loading clip…</p>';
 try{const clip=await api('/api/clips/'+encodeURIComponent(id));container.innerHTML=`<article class="clip-view"><a href="/gallery" class="back">← The gallery</a><h1>${escape(clip.title)}</h1><div class="clip-game-invite">${playClipGame(clip)}<p>No login needed to play.</p></div><p>${clip.source==='synthetic'?'Synthetic gameplay':'Player recording'} · Shared until ${new Date(clip.expiresAt).toLocaleDateString()}</p><video controls playsinline src="/api/media/${clip.id}" aria-label="${escape(clip.title)}"></video><div class="clip-actions"><button id="copy-link">Copy link</button><button id="native-share">Share</button><button id="remove-shared" hidden>Remove shared clip</button></div><div id="remove-confirmation"></div><p id="share-status" role="status"></p></article>`;
 const url=location.origin+'/clips/'+clip.id,status=container.querySelector('#share-status');document.title=clip.title+' · '+BRAND_NAME;
 container.querySelector('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(url);status.textContent='Link copied.';}catch{status.textContent='Copy this link: '+url;}};
 const share=container.querySelector('#native-share');share.hidden=!navigator.share;share.onclick=async()=>{try{await navigator.share({title:clip.title,url});}catch(error){if(error.name!=='AbortError')status.textContent='Sharing is unavailable. Use Copy link.';}};
 let legacyKey=null;
 if(clip.legacy){try{legacyKey=(await listClips()).find(c=>c.id===clip.id)?.manageToken;}catch{/* Public viewing does not require local storage. */}}
 if(clip.canDelete||legacyKey){const remove=container.querySelector('#remove-shared');remove.hidden=false;remove.onclick=()=>confirmRemoval(container.querySelector('#remove-confirmation'),async()=>{await removeSharedClip(clip.id,legacyKey);container.innerHTML='<h1>SHARED CLIP REMOVED.</h1><p>The shared link is no longer available. Your local video is kept on this device.</p><a class="button primary" href="/shared">My shared clips →</a>';});}

 }catch{container.innerHTML='<div class="empty-state"><h1>CLIP UNAVAILABLE.</h1><p>This clip may have expired, been removed, or isn’t available yet.</p><a class="button primary" href="/#arcade">Choose a game ↗</a></div>';}
}
