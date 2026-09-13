import {translateText as t} from '../../../packages/gameplay/i18n.js';
import {subscribeLanguage} from '../../../packages/gameplay/locale.js';
import {BRAND_NAME,SITE_URL} from './brand.js';
import {gameCatalog} from '../game-catalog.js';

export function shareMessage(clip,{origin=SITE_URL,local=false}={}){
 const game=gameCatalog.find(game=>game.id===clip.game||game.aliases?.includes(clip.game));
 const gameURL=new URL('/play/'+encodeURIComponent(game?.id||clip.game),local?SITE_URL:origin).href;
 const intro=t(clip.source==='synthetic'?`Check out my ${game?.title||'game'} demo on ${BRAND_NAME}!`:`I played ${game?.title||'a game'} on ${BRAND_NAME}!`);
 if(local)return {url:gameURL,text:`${intro}\n${t("I'm sending you my video as an attachment.")}\n${t('Try the game:')} ${gameURL}`,intro};
 // Share the viewer URL, including only its private access token, never media or management URLs.
 const provided=new URL(clip.url||'/clips/'+clip.id,origin);
 const url=new URL('/clips/'+encodeURIComponent(clip.id),origin);
 if(clip.visibility==='private'){
  const token=provided.searchParams.get('share');
  if(!token)throw new Error('The private sharing link is unavailable. Open it from My shared clips and try again.');
  url.searchParams.set('share',token);
 }
 const expiry=Number.isFinite(clip.expiresAt)?`\n${t('Available until')} ${new Date(clip.expiresAt).toISOString().slice(0,10)} (UTC).`:'';
 const privacy=clip.visibility==='private'?'\n'+t('This is a private link. Anyone with it can watch; please keep it between us.'):'';
 return {url:url.href,intro,text:`${intro}\n${t('Watch my video:')} ${url.href}${expiry}${privacy}\n${t('Try the game:')} ${gameURL}`};
}

export function socialLinks({url,intro}){
 const link=(base,params)=>base+'?'+new URLSearchParams(params);
 return [
  ['LinkedIn',link('https://www.linkedin.com/sharing/share-offsite/',{url})],
  ['X (Twitter)',link('https://x.com/intent/tweet',{text:intro,url})],
  ['Facebook',link('https://www.facebook.com/sharer/sharer.php',{u:url})],
 ];
}

export function mountShareMessage(container,clip,{local=false,origin=location.origin}={}){
 const panel=document.createElement('section');panel.className='share-message';
 const heading=document.createElement('h3');heading.textContent=local?'Send your video to a friend':clip.visibility==='private'?'Share privately with friends':'Share your video';
 panel.append(heading);
 let message;
 try{message=shareMessage(clip,{local,origin});}catch(error){const note=document.createElement('p');note.textContent=error.message;panel.append(note);container.append(panel);return;}
 const note=document.createElement('p');note.textContent=local?'Copy this message, then attach your video using Share with a friend or Download. The game link does not include your video.':clip.visibility==='private'?'Hidden from the gallery. Anyone with this complete link can watch without logging in.':'Copy the message for your post. LinkedIn and Facebook open with the video link; paste your message there. X includes a short caption.';
 const label=document.createElement('label');label.textContent='Message to share';
 const field=document.createElement('textarea');field.readOnly=true;field.rows=local?4:7;field.value=message.text;label.append(field);
 const actions=document.createElement('div');actions.className='clip-actions';
 const status=document.createElement('p');status.setAttribute('role','status');
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copy message';
 copy.onclick=async()=>{
  try{await navigator.clipboard.writeText(message.text);status.textContent=local?'Message copied. Attach your video before sending.':'Message copied, including the complete video link.';}
  catch{field.focus();field.select();status.textContent='Select and copy the message above. Automatic copying is unavailable.';}
 };
 actions.append(copy);
 if(!local){
  const copyLink=document.createElement('button');copyLink.type='button';copyLink.textContent='Copy link';
  copyLink.onclick=async()=>{
   try{await navigator.clipboard.writeText(message.url);status.textContent='Link copied.';}
   catch{field.focus();field.select();status.textContent='Copy the complete video link from the message above.';}
  };
  actions.append(copyLink);
  if(navigator.share){
   const native=document.createElement('button');native.type='button';native.textContent='Share';
   native.onclick=async()=>{
    try{await navigator.share({title:clip.title,text:message.text,url:message.url});status.textContent='Share dialog completed.';}
    catch(error){status.textContent=error.name==='AbortError'?'Sharing cancelled.':'Sharing is unavailable. Use Copy message.';}
   };
   actions.append(native);
  }
  if(clip.visibility!=='private')for(const [name,href] of socialLinks(message)){
   const link=document.createElement('a');link.textContent=name;link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','Share on '+name+' (opens a new tab)');actions.append(link);
  }
 }
 panel.append(note,label,actions,status);container.append(panel);
 const refresh=()=>{
  if(!panel.isConnected){unsubscribe();return;}
  message=shareMessage(clip,{local,origin});field.value=message.text;
  const links=actions.querySelectorAll('a');socialLinks(message).forEach(([,href],index)=>{if(links[index])links[index].href=href;});
 };
 const unsubscribe=subscribeLanguage(refresh);window.addEventListener('pagehide',unsubscribe,{once:true});
 return message;
}
