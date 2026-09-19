import './entry-view.css';
import {languageControl} from './localize-dom.js';
// Reuse the game's real buttons and their handlers; this view has no camera or
// recognition lifecycle and cannot calibrate or infer a pose a second time.
export function mountGameEntry({root,title,description,buttons,options=[],automatic=false,collapsibleOptions=false}){
 const view=document.createElement('section');view.className='game-entry';view.setAttribute('aria-label','Game setup');
 view.innerHTML='<a class="game-entry-back" href="/#arcade" target="_top">← All games</a><div class="game-entry-card"><p class="game-entry-eyebrow">READY TO PLAY</p><h1 translate="no"></h1><p class="game-entry-description"></p><ol class="game-entry-steps"><li><strong>1 · Camera</strong><span>Enable your camera when you are ready.</span></li><li><strong>2 · Set up</strong><span>Follow the game’s positioning guide once.</span></li><li><strong>3 · Start</strong><span data-entry-start></span></li></ol><div class="game-entry-options"></div><div class="game-entry-actions"></div><p class="game-entry-note">Camera processing stays on this device. Anonymous play counts and active time are sent to this site.</p></div>';
 view.querySelector('.game-entry-back').after(languageControl(root.ownerDocument,'entry-language'));
 view.querySelector('h1').textContent=title;view.querySelector('.game-entry-description').textContent=description;
 view.querySelector('[data-entry-start]').textContent=automatic?'Keep your head and one shoulder in view for the countdown.':'Raise your LEFT hand for one second, then lower it for the countdown.';
 const originals=[];
 for(const [items,target] of [[buttons,'.game-entry-actions'],[options,'.game-entry-options']])for(const element of items.filter(Boolean)){
  const marker=document.createComment('entry-control');element.before(marker);originals.push({element,marker});view.querySelector(target).append(element);
 }
 if(collapsibleOptions&&options.length){const controls=view.querySelector('.game-entry-options'),details=document.createElement('details'),summary=document.createElement('summary');details.className='game-entry-settings';summary.textContent='Game settings';controls.before(details);details.append(summary,controls);}
 // The camera view and original introduction remain inaccessible until entry.
 const inert=[...root.children].map(element=>[element,element.inert]);for(const [element] of inert)element.inert=true;
 root.append(view);root.classList.add('game-entry-pending');document.documentElement.classList.add('game-entry-pending');let disposed=false;
 function close(){if(disposed)return;disposed=true;for(const {element,marker} of originals){marker.replaceWith(element);element.removeEventListener('click',close,true);}for(const [element,value] of inert)element.inert=value;view.remove();root.classList.remove('game-entry-pending');document.documentElement.classList.remove('game-entry-pending');}
 for(const button of buttons.filter(Boolean))button.addEventListener('click',close,true);
 return {dispose:close};
}
