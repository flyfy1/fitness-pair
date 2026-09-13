import {translateText} from '../../../packages/gameplay/i18n.js';
import {subscribeLanguage} from '../../../packages/gameplay/locale.js';
// Keep the source out of the media element until an explicit playback action.
export function mountClipPreview(container,{src,poster,title,width=640,height=400}){
 const frame=document.createElement('div');frame.className='clip-preview';
 // Reserve the recorded shape before the poster loads, so replay navigation
 // measures the final card height instead of a temporarily collapsed player.
 frame.style.width=`min(100%, ${width}px, ${65*width/height}vh)`;
 frame.style.aspectRatio=`${width} / ${height}`;
 const video=document.createElement('video');video.playsInline=true;video.preload='none';
 video.style.width='100%';video.style.height='100%';
 video.width=width;video.height=height;video.setAttribute('aria-label',title);video.setAttribute('translate','no');
 const button=document.createElement('button');button.type='button';button.className='clip-preview-play';
 button.dataset.noI18nAttributes='aria-label';
 const label=()=>button.setAttribute('aria-label',translateText('Play replay')+': '+title);label();
 const releaseLanguage=subscribeLanguage(label);
 button.innerHTML='<span aria-hidden="true">▶</span><span data-play-label>Play replay</span>';
 frame.append(video,button);container.prepend(frame);
 function select(next){
  video.pause();video.removeAttribute('src');video.load();video.controls=false;
  src=next.src;
  if(next.poster)video.poster=next.poster;else video.removeAttribute('poster');
  button.hidden=false;button.querySelector('[data-play-label]').textContent='Play replay';
 }
 button.onclick=()=>{
  button.hidden=true;video.controls=true;
  if(!video.hasAttribute('src'))video.src=src;
  video.focus({preventScroll:true});
  video.play().catch(()=>{
   button.hidden=false;button.querySelector('[data-play-label]').textContent='Retry playback';
  });
 };
 function dispose(){releaseLanguage();video.pause();video.removeAttribute('src');video.removeAttribute('poster');video.load();window.removeEventListener('pagehide',dispose);}
 window.addEventListener('pagehide',dispose,{once:true});
 select({src,poster});
 return {video,select,dispose,setPoster:poster=>{video.poster=poster;}};
}

export function mountSharedPreview(container,clip){
 const query=clip.visibility==='private'?new URL(clip.url,location.origin).search:'';
 return mountClipPreview(container,{src:'/api/media/'+clip.id+query,poster:'/api/posters/'+clip.id+query,title:clip.title,width:clip.width,height:clip.height});
}
