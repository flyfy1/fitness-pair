import {createFrameRuntime} from '../gameplay/runtime.js';

function legacy(frame,read,eventName){
 return createFrameRuntime(frame,window=>({
  getFrame(){
   const value=read(window,window.document);if(!value)return null;
   const {ready,done,ending,stopped,paused,...capture}=value;
   return {...capture,phase:done?'complete':ending?'ending':ready?'playing':stopped?'idle':paused?'paused':'setup'};
  },
  subscribe(changed){if(eventName)window.addEventListener(eventName,changed);return()=>{if(eventName)window.removeEventListener(eventName,changed);};},
  configureHost({homeURL,recordingNote}){
   const doc=window.document,brand=doc.querySelector('.brand');
   if(brand&&homeURL){let home=brand;if(brand.tagName!=='A'){home=doc.createElement('a');brand.replaceWith(home);home.append(brand);}home.classList.add('arcade-home');home.href=homeURL;home.target='_top';home.title='Back to the Hopmodo arcade';home.setAttribute('aria-label','Back to the Hopmodo arcade');
    if(!doc.querySelector('[data-arcade-home-style]')){const style=doc.createElement('style');style.dataset.arcadeHomeStyle='';style.textContent='.arcade-home{color:inherit;text-decoration:none;pointer-events:auto}.arcade-home:focus-visible{outline:3px solid currentColor;outline-offset:5px}';doc.head.append(style);}}
   const note=doc.querySelector('#privacy-note, .camera-note, .privacy');if(note&&recordingNote)note.textContent=recordingNote;
  },
 }));
}

export const motionQuestAdapter=frame=>legacy(frame,(window,doc)=>{
 const state=window.motionQuest?.getReplayState(),canvas=doc.querySelector('#game');if(!state||!canvas?.width)return null;
 const reps=Number(doc.querySelector('#rep-count')?.textContent||0);
 return {canvas,video:doc.querySelector('#camera'),skeleton:doc.querySelector('#skeleton'),isAR:!!doc.querySelector('.camera-stage'),round:state.roundId,done:state.phase==='complete',stopped:state.phase==='idle',ending:state.phase==='ending',ready:state.phase==='playing',audio:window.motionQuest.getAudioStream?.(),score:`${reps} / 5 squats`,hud:{health:doc.querySelector('#hp-label')?.textContent,cue:doc.querySelector('#arena-title')?.textContent,charge:doc.querySelector('#charge-value')?.textContent,elapsed:doc.querySelector('#elapsed')?.textContent}};
},'motionquest:replay-state');

export const dinoARAdapter=frame=>legacy(frame,(window,doc)=>{
 const state=window.dinoAR?.getState(),canvas=doc.querySelector('#world');if(!state||!canvas?.width)return null;
 return {canvas,video:doc.querySelector('#camera'),skeleton:doc.querySelector('#debug')?.checked?doc.querySelector('#skeleton'):null,skeletonMirrored:true,isAR:true,round:state.roundId,ready:state.status==='running',paused:state.status==='paused',done:state.status==='over',score:`${state.score} points`};
});

export const plankFlightAdapter=frame=>legacy(frame,(window,doc)=>{
 const state=window.plankFlight?.getState(),canvas=doc.querySelector('#scene');if(!state||!canvas?.width)return null;
 return {canvas,video:doc.querySelector('#video'),isAR:true,round:state.sessionId,ready:state.status==='flying',paused:state.status==='paused',ending:state.status==='crashing'||(state.finished&&state.audio?.playing),done:state.finished&&!state.audio?.playing,audio:window.plankFlight.getAudioStream?.(),score:`${Math.floor(state.flightSeconds)}s · ${state.passed} gates`};
});

export const cameraStartAdapter=frame=>legacy(frame,(window,doc)=>{
 const state=window.cameraSetup?.getState(),canvas=doc.querySelector('#game-world');if(!state?.game||!canvas?.width)return null;
 const stage=doc.querySelector('#setup').getBoundingClientRect(),rect=canvas.getBoundingClientRect();
 return {canvas,video:doc.querySelector('#camera'),skeleton:doc.querySelector('#show-body')?.checked?doc.querySelector('#body-overlay'):null,isAR:true,layout:{width:stage.width,height:stage.height,x:rect.x-stage.x,y:rect.y-stage.y,canvasWidth:rect.width,canvasHeight:rect.height},round:state.game.roundId,ready:state.game.status==='running'&&state.testing,done:state.stage==='complete'||state.game.status==='over',score:`${state.game.score} points`};
});
