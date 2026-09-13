import {HandsStartGate} from './hands-start.js';
import './hands-start.css';
export function createHandsStart(root,{translate=text=>text}={}){
 const gate=new HandsStartGate(),view=document.createElement('section');view.className='hands-start';view.hidden=true;view.setAttribute('aria-label','Start with both hands');
 view.innerHTML='<h1 class="hands-start-title" aria-live="polite"></h1><p class="hands-start-detail"></p>';
 root.append(view);const hide=()=>{view.hidden=true;root.classList.remove('awaiting-hands-start');};
 return {
  get open(){return gate.open;},
  reset(session){gate.reset(session);hide();},
  update(frame,ready){const open=gate.update(frame,ready,performance.now());view.hidden=open||!ready;root.classList.toggle('awaiting-hands-start',!view.hidden);
   const lower=gate.stage==='lower';const title=translate(lower?'Now lower both hands.':'Raise BOTH hands to start.');
   const heading=view.querySelector('h1');if(heading.textContent!==title)heading.textContent=title;
   view.querySelector('p').textContent=translate(lower?'Get ready to play.':'Above your shoulders. Hold for one second.');return open;},
  hide,
 };
}
