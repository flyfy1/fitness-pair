import {gameGuides} from './game-guides.js';
import {movementArt} from './movement-art.js';
import './game-guides.css';

const skipKey=id=>`hopmodo:game-guide-skipped:v1:${id}`;
const wasSkipped=id=>{
 try{return localStorage.getItem(skipKey(id))==='1';}catch{return false;}
};
const rememberSkip=id=>{
 try{localStorage.setItem(skipKey(id),'1');}catch{}
};

export function installGameGuides(container,games){
 const dialog=document.createElement('dialog');dialog.className='game-guide';dialog.setAttribute('aria-labelledby','guide-title');
 document.body.append(dialog);
 let previousOverflow='';
 function close(){document.body.style.overflow=previousOverflow;dialog.close();}
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{if(!dialog.open)document.body.style.overflow=previousOverflow;});
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
 for(const link of container.querySelectorAll('a[href^="/play/"]')){
  const game=games.find(g=>link.getAttribute('href')===`/play/${g.id}`);
  if(gameGuides[game?.id]&&!wasSkipped(game.id))link.setAttribute('aria-haspopup','dialog');
 }
 container.addEventListener('click',event=>{
  const link=event.target.closest('a[href^="/play/"]');
  if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const game=games.find(g=>link.getAttribute('href')===`/play/${g.id}`),guide=gameGuides[game?.id];
  if(!guide||wasSkipped(game.id))return;
  event.preventDefault();
  dialog.innerHTML=`<div class="guide-heading"><div><p class="guide-eyebrow">HOW TO PLAY · ${game.kind==='concept'?'POINTER PREVIEW':'MOVEMENT GAME'}</p><h2 id="guide-title" translate="no">${game.title}</h2><p class="guide-goal">${guide.goal}</p></div><button class="guide-close" aria-label="Close instructions" autofocus>×</button></div>
  <div class="guide-scroll">${movementArt(guide)}<p class="guide-view">Movement diagrams · match the labeled hand to your own hand. Your camera view is mirrored.</p><section class="guide-setup"><h3>First, set up</h3><p>${guide.setup}</p></section><ol class="guide-steps">${guide.steps.map(([title,copy])=>`<li><h3>${title}</h3><p>${copy}</p></li>`).join('')}</ol><div class="guide-pause"><h3>Pause & finish</h3><p>${guide.pause}</p></div></div>
  <div class="guide-footer"><p>${game.kind==='concept'?'No camera needed.':'Camera starts only when you enable it inside the game. Gameplay and camera replay stay on this device unless you choose to share.'}</p><div class="guide-actions"><a class="button outline guide-skip" href="/play/${game.id}">Skip tutorial</a><a class="button primary" href="/play/${game.id}">Let’s play <span aria-hidden="true">→</span></a></div></div>`;
  dialog.querySelector('.guide-close').onclick=close;
  dialog.querySelector('.guide-skip').onclick=()=>rememberSkip(game.id);
  previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();
 });
}
