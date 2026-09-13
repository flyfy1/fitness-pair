import {mountClipPreview,mountSharedPreview} from './clip-preview.js';
import {thumbnailFromVideo} from './clip-thumbnail.js';
import {attachConversationPlayback} from './conversation-playback.js';
import {games} from './games.js';
import {getSession,loginURL,accountAPI,storageLabel,removeSharedClip,confirmRemoval} from './account.js';
import {createShareCopy,fitsWebsiteShare} from './share-copy.js';
import {videoExtension,formatLabel} from './video-format.js';
import {BRAND_NAME,SITE_URL} from './brand.js';
import {saveClip,listClips,deleteClip,updateClip,updateClipThumbnail,MAX_CLIPS} from './local-clips.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const urls=new Set();function objectURL(blob){const u=URL.createObjectURL(blob);urls.add(u);return u;}function releaseURL(u){URL.revokeObjectURL(u);urls.delete(u);}
window.addEventListener('pagehide',()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();});
window.addEventListener('local-clips:changed',event=>{
 document.querySelectorAll('.clip-card[data-clip-id]').forEach(card=>{if(!card.dataset.unsaved&&!event.detail.includes(card.dataset.clipId))card.dispose?.();});
});
const api=accountAPI;
function playClipGame(clip, className='button primary'){
 const game=games.find(game=>(game.id===clip.game||game.aliases?.includes(clip.game))&&game.kind==='playable');
 return game?`<a class="${className}" href="/play/${game.id}">Play ${escape(game.title)} ↗</a>`:'';
}
export function mountClipCard(container,clip){
 let copyController=null,thumbnailController=null,selectedClip=clip,mixedClip=null,voicePlayback=null;
 const card=document.createElement('article');card.className='clip-card';card.dataset.clipId=clip.id;card.dataset.createdAt=clip.createdAt;if(clip.unsaved)card.dataset.unsaved='true';const url=objectURL(clip.blob),ownedURLs=[url];
 card.innerHTML=`<h3 translate="no">${escape(clip.title)}</h3><p>${clip.source==='synthetic'?'Synthetic gameplay':'Player recording'} · ${Math.round(clip.duration)} seconds${clip.playbackRate===2?' · 2× speed':''} · ${formatLabel(clip.blob)} · ${clip.unsaved?'Not saved — download before leaving':'Saved on this device'}</p>${formatLabel(clip.blob)==='WebM'?'<p>This browser saved WebM. For MP4 recording, use an updated Chrome or Edge on a supported device.</p>':''}${clip.conversation?'<div class="conversation-choice"><label><input type="checkbox" data-voice-preview checked> Listen to recorded voice in replay</label><label><input type="checkbox" data-conversation> Include conversation in video downloads &amp; sharing</label><p data-conversation-status>Video downloads exclude voice until selected above. The recorded voice stays on this device.</p><a data-conversation-download>Download conversation track</a></div>':clip.conversationEmbedded?'<p>Conversation included in this version. The original video is kept separately.</p>':''}<div class="clip-actions"><button class="share-file" data-friend>Share with a friend</button><a href="${url}" download="hopmodo-${clip.game}.${videoExtension(clip.blob)}">Download</a><button data-link>Copy game link</button>${clip.shareCopy?'':'<button data-copy>Make short share copy</button>'}<button data-cancel-copy hidden>Cancel copy</button><button data-share>Upload &amp; share</button><button data-delete>Delete local clip</button><button data-thumbnail ${clip.thumbnail?'hidden':''}>Generate thumbnail</button></div><p class="clip-share-status" data-share-status role="status"></p><div data-publish></div>`;
 const posterURL=value=>{if(!(value.thumbnail instanceof Blob))return null;const poster=objectURL(value.thumbnail);ownedURLs.push(poster);return poster;};
 const preview=mountClipPreview(card,{src:url,poster:posterURL(clip),title:clip.title,width:clip.width,height:clip.height});
 card.dispose=()=>{thumbnailController?.abort();copyController?.abort();voicePlayback?.dispose();preview.dispose();ownedURLs.forEach(releaseURL);card.remove();};
 const thumbnailButton=card.querySelector('[data-thumbnail]');
 thumbnailButton.onclick=async()=>{
  if(thumbnailController){thumbnailController.abort();return;}
  thumbnailController=new AbortController();thumbnailButton.textContent='Cancel thumbnail';
  const status=card.querySelector('[data-share-status]');status.textContent='Generating the first-frame thumbnail on this device…';
  try{
   await prepareThumbnail(clip,thumbnailController.signal);
   if(selectedClip===clip)preview.setPoster(posterURL(clip));
   thumbnailButton.hidden=true;status.textContent='Thumbnail saved. Your original video is unchanged.';
  }catch(error){status.textContent=error.message;}
  finally{thumbnailController=null;thumbnailButton.textContent='Generate thumbnail';}
 };
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
  preview.select({src:mediaURL,poster:posterURL(value)});thumbnailButton.hidden=!!value.thumbnail||value!==clip;
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
async function prepareThumbnail(clip,signal){
 clip.thumbnail??=await thumbnailFromVideo(clip.blob,{signal});
 if(!clip.unsaved)await updateClipThumbnail(clip.id,clip.thumbnail);
}
async function publishThumbnail(clip,session){
 await prepareThumbnail(clip);
 await api('/api/posters/'+clip.id,{method:'PUT',headers:{'Content-Type':'image/jpeg',...uploadHeaders(clip,session),'X-Sharing-Consent':'gallery-v1'},body:clip.thumbnail});
}
function uploadHeaders(clip,session){
 return {...(session.csrfToken?{'X-CSRF-Token':session.csrfToken}:{}),...(clip.manageToken?{'X-Management-Key':clip.manageToken}:{})};
}
async function publishForm(container,clip){
 container.innerHTML='<p role="status">Checking shared storage…</p>';
 try{
  const config=await api('/api/config');
  if(!config.sharingEnabled){container.innerHTML='<p class="notice">Gallery sharing isn’t available yet. Your clip stays on this device. You can download it now.</p>';return;}
  if(!fitsWebsiteShare(clip)){container.innerHTML='<p class="notice">Website sharing accepts up to 90 seconds / 20 MiB. Make a short share copy, preview it, then upload that copy. Your full replay stays here.</p><button data-prepare-copy>Make short share copy</button>';container.querySelector('[data-prepare-copy]').onclick=()=>container.closest('.clip-card').querySelector('[data-copy]')?.click();return;}
  if(clip.unsaved){container.innerHTML='<p class="notice">Save or download this clip before uploading. It has not been saved on this device yet.</p>';return;}
  const session=await getSession();
  if(clip.shared){
   try{const existing=await api('/api/clips/'+clip.id+new URL(clip.sharedURL||'/',location.origin).search);await publishThumbnail(clip,session);container.innerHTML=`<p>Already shared. <a class="text-link" href="${escape(existing.url)}">Open shared video →</a></p>`;return;}
   catch(error){if(error.status!==404)throw error;clip.shared=false;await updateClip(clip);}
  }
  const account=session.user?await api('/api/account/clips'):config.anonymous;
  if(!account)throw new Error('Shared storage is unavailable. Please try again shortly.');
  const remaining=Math.max(0,account.limitBytes-account.usedBytes),full=clip.blob.size>remaining;
  const fullMessage=session.user?'Your 2 GB storage is full. Delete older videos from My shared clips to free space.':'The shared 10 GB anonymous storage is full. Log in to use your own 2 GB, or try again later.';
  container.innerHTML=`<form class="publish-form"><h3>Upload and share this clip?</h3>${session.user?`<p>Uploading as <strong translate="no">${escape(session.user.email)}</strong> · <a class="text-link" href="/shared">My shared clips</a></p>`:`<p>Upload without an account: public videos only. Anonymous uploads share a 10 GB pool across all visitors.</p><p><a class="text-link" href="${loginURL('/library?publish='+clip.id)}">Log in with Integ.Life ↗</a> for private links and your own 2 GB.</p>`}<label>Clip title<input name="title" maxlength="90" required value="${escape(clip.title)}"></label>${session.user?'<label>Visibility<select name="visibility"><option value="public">Public — gallery</option><option value="private">Private — link access</option></select></label>':'<p><strong>Public — visible in the gallery</strong></p>'}<p>${storageLabel(clip.blob.size)} to upload · ${storageLabel(remaining)} available ${session.user?'of your 2 GB':'in the shared 10 GB anonymous pool'}</p><p data-visibility-info></p><label><input type="checkbox" name="consent" required>I agree to upload this clip with the visibility shown above and have permission from everyone shown.</label><p>${session.user?'Remove videos from My shared clips on any device.':'Keep this local clip on this browser to remove its public upload later.'} Shared clips expire after 7 days.</p><button class="button primary" type="submit" ${full?'disabled':''}>Upload this clip ↗</button><p data-status role="status">${full?fullMessage:''}</p><div data-cleanup></div></form>`;
  const form=container.querySelector('form'),visibility=form.elements.visibility;
  const explainVisibility=()=>{form.querySelector('[data-visibility-info]').textContent=visibility?.value==='private'?'Private: hidden from the public gallery. Anyone with your sharing link can watch and copy it, including friends without an account.':'Public: anyone can find this video in the gallery, watch it and copy it.';form.elements.consent.checked=false;};
  explainVisibility();if(visibility)visibility.onchange=explainVisibility;
  form.onsubmit=async event=>{
   event.preventDefault();const button=form.querySelector('button'),status=form.querySelector('[data-status]');button.disabled=true;status.textContent='Uploading your clip…';
   const title=String(new FormData(form).get('title')),access=visibility?.value||'public';
   // Freeze the consented visibility while encoding and uploading.
   if(visibility)visibility.disabled=true;
   try{
    if(!session.user){
     clip.manageToken||=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
     const saved=await updateClip(clip);
     if(!saved.some(item=>item.id===clip.id&&item.manageToken===clip.manageToken))throw new Error('This local clip is no longer saved. Download it before leaving; upload was not started.');
    }
    await prepareThumbnail(clip);
    const result=await api(`/api/clips/${clip.id}?title=${encodeURIComponent(title)}&game=${encodeURIComponent(clip.game)}&source=${clip.source}&duration=${clip.duration}&visibility=${access}`,{method:'PUT',headers:{'Content-Type':clip.blob.type,...uploadHeaders(clip,session),'X-Sharing-Consent':access==='private'?'private-v1':'gallery-v1'},body:clip.blob});
    clip.shared=true;clip.title=title;clip.sharedURL=result.url;clip.visibility=result.visibility;
    try{await updateClip(clip);}catch{/* Cloud ownership and device key have already been persisted. */}
    await publishThumbnail(clip,session);
    container.innerHTML=`<p>Uploaded. ${result.visibility==='private'?'Private link ready.':'Public in the gallery.'} <a class="text-link" href="${escape(result.url)}">Open shared video →</a>${session.user?' · <a class="text-link" href="/shared">Manage my shared clips</a>':''}</p>`;
   }catch(error){
    status.textContent=error.message;status.className='error';button.disabled=error.status===413;
    if(!session.user&&clip.manageToken){const cleanup=form.querySelector('[data-cleanup]');cleanup.innerHTML='<button type="button">Remove unfinished upload</button>';cleanup.querySelector('button').onclick=()=>confirmRemoval(cleanup,async()=>{await removeSharedClip(clip.id,clip.manageToken);clip.shared=false;await publishForm(container,clip);});}
    if(error.status===401){const link=document.createElement('a');link.className='text-link';link.href=loginURL('/library?publish='+clip.id);link.textContent='Log in again →';status.append(' ',link);}
   }finally{if(visibility)visibility.disabled=false;}
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
 body.className='clip-grid';body.innerHTML=data.clips.map(c=>`<article class="clip-card"><h3 translate="no"><a href="/clips/${c.id}">${escape(c.title)}</a></h3><p>${c.source==='synthetic'?'Synthetic gameplay':'Player recording'}</p><div class="clip-actions"><a href="/clips/${c.id}">Watch clip →</a>${playClipGame(c,'play-clip-game')}</div></article>`).join('');
 data.clips.forEach((clip,index)=>mountSharedPreview(body.children[index],clip));
 }catch(error){body.innerHTML=`<div class="empty-state"><h2>COULDN’T LOAD THE GALLERY.</h2><p>${escape(error.message)}</p><a class="text-link" href="/gallery">Try again ↻</a></div>`;}
}
export async function renderClip(container,id){
 container.innerHTML='<p role="status">Loading clip…</p>';
 try{const clip=await api('/api/clips/'+encodeURIComponent(id)+(new URLSearchParams(location.search).has('share')?'?share='+encodeURIComponent(new URLSearchParams(location.search).get('share')):''));container.innerHTML=`<article class="clip-view"><a href="/gallery" class="back">← The gallery</a><h1 translate="no">${escape(clip.title)}</h1><div class="clip-game-invite">${playClipGame(clip)}<p>No login needed to play.</p></div><p>${clip.source==='synthetic'?'Synthetic gameplay':'Player recording'} · ${clip.visibility==='private'?'Private — people with the link can watch':'Public'} · Shared until <time datetime="${new Date(clip.expiresAt).toISOString()}">${new Date(clip.expiresAt).toLocaleDateString()}</time></p><div data-shared-preview></div><div class="clip-actions"><button id="copy-link">Copy link</button><button id="native-share">Share</button><button id="remove-shared" hidden>Remove shared clip</button></div><div id="remove-confirmation"></div><p id="share-status" role="status"></p></article>`;
 mountSharedPreview(container.querySelector('[data-shared-preview]'),clip);
 const url=location.origin+(clip.url||'/clips/'+clip.id),status=container.querySelector('#share-status');document.querySelector('title').setAttribute('translate','no');document.title=clip.title+' · '+BRAND_NAME;
 container.querySelector('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(url);status.textContent='Link copied.';}catch{status.textContent='Copy this link: '+url;}};
 const share=container.querySelector('#native-share');share.hidden=!navigator.share;share.onclick=async()=>{try{await navigator.share({title:clip.title,url});}catch(error){if(error.name!=='AbortError')status.textContent='Sharing is unavailable. Use Copy link.';}};
 let legacyKey=null;
 if(clip.legacy){try{legacyKey=(await listClips()).find(c=>c.id===clip.id)?.manageToken;}catch{/* Public viewing does not require local storage. */}}
 if(clip.canDelete||legacyKey){const remove=container.querySelector('#remove-shared');remove.hidden=false;remove.onclick=()=>confirmRemoval(container.querySelector('#remove-confirmation'),async()=>{await removeSharedClip(clip.id,legacyKey);container.innerHTML='<h1>SHARED CLIP REMOVED.</h1><p>The shared link is no longer available. Your local video is kept on this device.</p><a class="button primary" href="/shared">My shared clips →</a>';});}

 }catch{container.innerHTML='<div class="empty-state"><h1>CLIP UNAVAILABLE.</h1><p>This clip may have expired, been removed, or isn’t available yet.</p><a class="button primary" href="/#arcade">Choose a game ↗</a></div>';}
}
