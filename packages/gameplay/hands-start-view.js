import {HandsStartGate} from './hands-start.js';
import './hands-start.css';
import {poseArtwork} from './pose-art.js';
export function createHandsStart(root,{translate=text=>text,countdownMs=0,gesture='left-hand'}={}){
 const gate=new HandsStartGate({countdownMs,gesture}),view=document.createElement('section');view.className='hands-start';view.dataset.gesture=gesture;view.hidden=true;view.setAttribute('aria-label','Get ready to play');
 view.innerHTML='<img class="hands-start-art" alt=""/><div class="hands-start-copy"><h1 class="hands-start-title" aria-live="polite"></h1><p class="hands-start-detail"></p><progress class="hands-start-progress" max="1" value="0" aria-label="Start gesture hold"></progress><p class="hands-start-status" role="status"></p></div>';
 root.append(view);const hide=()=>{view.hidden=true;root.classList.remove('awaiting-hands-start');};
 return {
  get open(){return gate.open;},
  reset(session){gate.reset(session);hide();},
  update(frame,ready,hands){const open=gate.update(frame,ready,performance.now(),hands);view.hidden=open||!ready;root.classList.toggle('awaiting-hands-start',!view.hidden);
   const title=translate(gate.stage==='countdown'?String(gate.remaining):gate.stage==='lower'?'Now lower both hands.':gesture==='hands-together'?'Bring your hands together.':'Raise your LEFT hand.');
   const artwork=poseArtwork[['lower','countdown','open'].includes(gate.stage)?(gesture==='hands-together'?'upper-neutral':'stand'):(gesture==='hands-together'?'together':'raise')];
   if(view.querySelector('img').getAttribute('src')!==artwork)view.querySelector('img').src=artwork;
   const heading=view.querySelector('h1');if(heading.textContent!==title)heading.textContent=title;
   view.querySelector('.hands-start-detail').textContent=translate(gate.stage==='countdown'?'Stand steady. Get ready to play.':gate.stage==='lower'?(gesture==='hands-together'?'Separate and lower your hands. Get ready to play.':'Get ready to play.'):gesture==='hands-together'?'Near your chest or face. Hold for one second.':'Above your shoulder. Keep your right hand down. Hold for one second.');
   const progress=view.querySelector('progress');progress.value=gate.progress;progress.hidden=!['raise','waiting'].includes(gate.stage);
   const feedback=!hands?.tracked?(hands?.missingJoints?.some(name=>name.endsWith('Shoulder'))?'Keep both shoulders visible.':'Keep both hands visible.')
    :gate.stage==='lower'?'Gesture recognized. Separate and lower your hands.'
    :gate.stage==='countdown'?'Stand steady. Get ready to play.'
    :hands.latched?'Lower and separate your hands first, then try again.'
    :gate.progress>0?'Hold steady. Recognizing your gesture…':'Waiting for your start gesture.';
   const status=view.querySelector('.hands-start-status'),text=translate(feedback);if(status.textContent!==text)status.textContent=text;
   return open;},
  hide,
 };
}
