import {message} from '../../../../packages/gameplay/i18n.js';

const activePhase = phase => ['playing','paused','ending'].includes(phase);

export function mountGameFeedback(game, runtime, {container, stopGame}) {
 let startedAt=null, round=null, controls=null, stopped=false, disposed=false;
 const sourcePage=`/play/${game.id}`;
 function observe(){
  if(disposed||stopped)return;
  const snapshot=runtime.readFrame();
  if(snapshot?.phase==='playing'&&(round!==snapshot.round||startedAt===null)){round=snapshot.round;startedAt=Date.now();}
  if(controls){const button=controls.querySelector('[data-stop-game]');button.hidden=startedAt===null||!activePhase(snapshot?.phase);}
 }
 const interval=setInterval(observe,100),unsubscribe=runtime.subscribe(observe);observe();
 function showPrompt(snapshot,stoppedAt){
  const feedbackId=crypto.randomUUID();
  const overlay=document.createElement('section');overlay.className='game-feedback';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','game-feedback-title');
  overlay.innerHTML=`<div class="game-feedback-card"><p class="kicker">${message('gameFeedback.kicker')}</p><h1 id="game-feedback-title"></h1><p>${message('gameFeedback.detail')}</p><div class="game-feedback-rating" role="group"></div><p class="game-feedback-status" role="status"></p><div class="game-feedback-actions"><button type="button" data-play-again>${message('common.playAgain')}</button><a href="/#arcade">${message('gameFeedback.back')}</a></div></div>`;
  overlay.querySelector('h1').textContent=message('gameFeedback.title',[game.title]);
  const group=overlay.querySelector('.game-feedback-rating');
  for(const [rating,label,icon] of [['up',message('gameFeedback.like'),'👍'],['down',message('gameFeedback.dislike'),'👎']]){
   const button=document.createElement('button');button.type='button';button.dataset.rating=rating;button.setAttribute('aria-label',label);button.innerHTML=`<span aria-hidden="true">${icon}</span><b>${label}</b>`;group.append(button);
  }
  const status=overlay.querySelector('[role=status]');
  overlay.querySelector('[data-play-again]').onclick=()=>location.reload();
  for(const button of group.querySelectorAll('button'))button.onclick=async()=>{
   for(const choice of group.querySelectorAll('button'))choice.disabled=true;
   status.textContent=message('gameFeedback.saving');
   try{
    const response=await fetch('/api/feedback',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({
     version:1,id:feedbackId,rating:button.dataset.rating,gameId:game.id,sourcePage,
     durationMs:Math.max(0,stoppedAt-startedAt),stoppedAt,inputSource:snapshot?.source?.kind||null,score:snapshot?.score||null,
    })});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||message('gameFeedback.failed'));
    button.dataset.selected='true';status.textContent=message('gameFeedback.saved');overlay.querySelector('[data-play-again]').focus();
   }catch(error){status.textContent=error.message||message('gameFeedback.failed');for(const choice of group.querySelectorAll('button'))choice.disabled=false;button.focus();}
  };
  container.append(overlay);group.querySelector('button').focus();
 }
 async function stop(){
  if(stopped||startedAt===null)return;
  const snapshot=runtime.readFrame(),stoppedAt=Date.now();stopped=true;
  clearInterval(interval);unsubscribe();
  await document.exitFullscreen?.().catch(()=>{});
  stopGame();showPrompt(snapshot,stoppedAt);
 }
 return {
  connectControls(element){controls=element;controls.querySelector('[data-stop-game]').onclick=stop;observe();},
  dispose(){if(disposed)return;disposed=true;clearInterval(interval);unsubscribe();},
 };
}
