import {HandsStartGate} from './hands-start.js';
import './hands-start.css';
export function createHandsStart(root,{translate=text=>text,countdownMs=0}={}){
 const gate=new HandsStartGate({countdownMs}),view=document.createElement('section');view.className='hands-start';view.hidden=true;view.setAttribute('aria-label','Get ready to play');
 view.innerHTML='<h1 class="hands-start-title" aria-live="polite"></h1><p class="hands-start-detail"></p>';
 root.append(view);const hide=()=>{view.hidden=true;root.classList.remove('awaiting-hands-start');};
 return {
  get open(){return gate.open;},
  reset(session){gate.reset(session);hide();},
  update(frame,ready,hands){const open=gate.update(frame,ready,performance.now(),hands);view.hidden=open||!ready;root.classList.toggle('awaiting-hands-start',!view.hidden);
   const title=translate(gate.stage==='countdown'?String(gate.remaining):gate.stage==='lower'?'Now lower both hands.':'Raise your LEFT hand.');
   const heading=view.querySelector('h1');if(heading.textContent!==title)heading.textContent=title;
   view.querySelector('p').textContent=translate(gate.stage==='countdown'?'Stand steady. Get ready to play.':gate.stage==='lower'?'Get ready to play.':'Above your shoulder. Keep your right hand down. Hold for one second.');return open;},
  hide,
 };
}
