import {mountConversationControls} from './controls.js';
import {mountRecording} from './recording.js';
import './shell.css';

export function mountGame(container,game){
 document.body.classList.add('game-mode');
 container.innerHTML=`<main id="main" class="game-play" aria-label="${game.title}">
  <iframe id="game-frame" src="${game.path}" title="${game.title} game" allow="camera; microphone; fullscreen" referrerpolicy="same-origin"></iframe>
  <div class="game-replay-tools"><a class="back" href="/#arcade">← Back to the arcade</a><div class="record-bar" id="record-panel"></div></div>
  <section class="local-result" id="local-result" hidden></section></main>`;
 const frame=container.querySelector('#game-frame');
 let recorder=null;const reload=()=>recorder?.onGameReload();frame.addEventListener('load',reload);
 const runtime=game.createAdapter(frame);
 runtime.configureHost({homeURL:'/#arcade',recordingNote:'Your game and camera view record automatically during gameplay, with game sound when available. Conversation recording is optional. Nothing is uploaded unless you choose to share.'});
 recorder=mountRecording(game,runtime,{panel:container.querySelector('#record-panel'),result:container.querySelector('#local-result')});
 let disposeControls=()=>{};
 function controls(){
  disposeControls();
  const doc=frame.contentDocument;if(!doc?.body)return;
  disposeControls=mountConversationControls(doc,element=>recorder.connectControls(element));
 }
 frame.addEventListener('load',controls);if(frame.contentDocument?.readyState==='complete')controls();
 let disposed=false;
 function dispose(){if(disposed)return;disposed=true;frame.removeEventListener('load',controls);frame.removeEventListener('load',reload);disposeControls();recorder.dispose();runtime.dispose();window.removeEventListener('pagehide',dispose);frame.src='about:blank';document.body.classList.remove('game-mode');}
 window.addEventListener('pagehide',dispose);return {runtime,dispose};
}
