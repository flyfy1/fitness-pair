import {movementArt} from '../../arcade/src/movement-art.js';
import './tutorial.css';
const copy={
 intro:['LEARN THE CONTROLS','Move. Shoot. Try it.','Move sideways to steer. Left hand fires.','sway','Move your torso'],
 requesting:['CAMERA SETUP','Allow your camera.','Show your shoulders, hips and hands.','stand','Stand in view'],
 loading:['CAMERA SETUP','Getting ready to see you.','Keep your body in view.','stand','Hands down'],
 calibrating:['CAMERA SETUP','Stand still. Hands down.','Face the camera. Hold your position.','stand','Stand centered'],
 left:['TRY 1 OF 3 · STEERING','Move your body left.','Hands down. Move left and hold.','sway-left','← Move your torso'],
 right:['TRY 2 OF 3 · STEERING','Now move right.','Move right. The ship follows you.','sway-right','Move your torso →'],
 fire:['TRY 3 OF 3 · FIRING','Raise your LEFT hand.','LEFT hand above your shoulder. Right hand down.','raise','LEFT hand fires'],
 lower:['TRY 3 OF 3 · RESET','Shot! Lower your LEFT hand.','Below your shoulder. Ready for another shot.','lower','Lower to fire again'],
 ready:['CONTROLS CONFIRMED','Raise BOTH hands to start.','Hold for one second. Then lower both hands.','stand','Ready to play'],
};
export function mountTutorial(root,{onStart,onSkip,onCancel}){
 const section=document.createElement('section');section.id='tutorial';section.hidden=true;section.setAttribute('aria-labelledby','tutorial-title');
 section.innerHTML=`<div class="tutorial-copy"><p id="tutorial-step"></p><h1 id="tutorial-title" aria-live="polite" aria-atomic="true"></h1><p id="tutorial-detail"></p><div class="tutorial-progress" aria-label="Practice checklist"><span data-check="left">1 · Left</span><span data-check="right">2 · Right</span><span data-check="fire">3 · Fire & lower</span></div><p id="tutorial-feedback" role="status"></p><progress id="tutorial-hold" max="1" value="0" aria-label="Hold this movement" hidden></progress><div class="tutorial-actions"><button id="tutorial-start" class="primary">Enable camera & practice</button><button id="tutorial-skip">Skip tutorial</button><button id="tutorial-cancel" hidden>Turn camera off</button></div><p id="tutorial-privacy">Practice first. The game and replay begin after the tutorial.</p></div><div class="tutorial-visual"><div id="tutorial-diagram"></div><div id="practice-lane" aria-label="Practice ship controlled by your torso"><span>Practice · no enemies · no score</span><div id="practice-shot" hidden></div><svg id="practice-ship" viewBox="0 0 80 55" aria-label="Your practice ship" role="img"><path d="M40 4L54 29 74 43V50H6V43L26 29Z" fill="#a8ffe1" stroke="#183c44" stroke-width="3"/><path d="M40 16L47 34H33Z" fill="#2347ee"/></svg></div></div>`;
 root.append(section);const $=id=>section.querySelector('#'+id);let stage=null,shotAnimation=null;
 $('tutorial-start').onclick=onStart;$('tutorial-skip').onclick=onSkip;$('tutorial-cancel').onclick=onCancel;
 return {
  show(value){section.hidden=!value;root.classList.toggle('tutorial-active',value);},
  update(next,{feedback='',progress=0,horizontal=0,camera=false,error=false}={}){
   if(stage!==next){stage=next;section.dataset.step=next;const [step,title,detail,pose,label]=copy[next];$('tutorial-step').textContent=step;$('tutorial-title').textContent=title;$('tutorial-detail').textContent=detail;$('tutorial-diagram').innerHTML=movementArt({tiles:[[pose,label]]});}
   $('tutorial-feedback').textContent=feedback;$('tutorial-feedback').classList.toggle('is-error',error);
   $('tutorial-start').hidden=next!=='intro';$('tutorial-cancel').hidden=!camera;
   $('tutorial-skip').textContent=next==='ready'?'Continue without more practice':'Skip tutorial';
   $('tutorial-hold').hidden=!['left','right','lower','calibrating'].includes(next);$('tutorial-hold').value=progress;
   const index=['left','right','fire','lower','ready'].indexOf(next);
   section.querySelectorAll('[data-check]').forEach((el,i)=>{const done=index>(i===2?3:i);el.dataset.done=String(done);el.textContent=(done?'✓ ':`${i+1} · `)+['Left','Right','Fire & lower'][i];});
   $('practice-ship').style.left=`${50+horizontal*38}%`;
   $('practice-lane').hidden=!['left','right','fire','lower','ready'].includes(next);
  },
  shoot(horizontal){const shot=$('practice-shot');shotAnimation?.cancel();shot.hidden=false;shot.style.left=`${50+horizontal*38}%`;shotAnimation=shot.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(-100px)',opacity:0}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?1:450,fill:'forwards'});},
  dispose(){shotAnimation?.cancel();section.remove();},
 };
}
