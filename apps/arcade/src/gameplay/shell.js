import {mountRecording} from './recording.js';
import './shell.css';

export function mountGame(container,game){
 document.body.classList.add('game-mode');
 container.innerHTML=`<main id="main" class="game-play" aria-label="${game.title}">
  <iframe id="game-frame" src="${game.path}" title="${game.title} game" allow="camera; fullscreen" referrerpolicy="same-origin"></iframe>
  <div class="game-replay-tools"><a class="back" href="/#arcade">← Back to the arcade</a><div class="record-bar" id="record-panel"></div></div>
  <section class="local-result" id="local-result" hidden></section></main>`;
 const frame=container.querySelector('#game-frame');
 let recorder=null;const reload=()=>recorder?.onGameReload();frame.addEventListener('load',reload);
 const runtime=game.createAdapter(frame);
 runtime.configureHost({homeURL:'/#arcade',recordingNote:'Your game and camera view record automatically during gameplay, with game sound when available. Conversation recording is optional. Nothing is uploaded unless you choose to share.'});
 recorder=mountRecording(game,runtime,{panel:container.querySelector('#record-panel'),result:container.querySelector('#local-result')});
 function controls(){
  const doc=frame.contentDocument;if(!doc?.body)return;
  const element=doc.createElement('div');element.className='hopmodo-conversation';
  element.innerHTML='<button type="button" aria-pressed="false">Record conversation</button><span role="status" hidden>Microphone off</span>';
  const style=doc.createElement('style');
  style.textContent='.hopmodo-conversation{position:fixed;right:12px;bottom:12px;z-index:100;max-width:min(280px,calc(100vw - 24px));padding:0;border:0;border-radius:22px;color:#182346;font:12px Arial,sans-serif}.hopmodo-conversation button{display:block;min-height:44px;box-shadow:0 2px 12px #0003;border:0;border-radius:20px;background:#2347ee;color:#fff;padding:6px 12px;font:600 12px Arial,sans-serif}.hopmodo-conversation button[aria-pressed=true]{background:#a92020}.hopmodo-conversation span{position:absolute;right:0;bottom:calc(100% + 6px);width:max-content;max-width:240px;padding:8px;border:1px solid #18234655;border-radius:8px;background:#fff;line-height:1.4}.hopmodo-conversation span[hidden]{display:none}.hopmodo-conversation button:focus-visible{outline:3px solid #ff795e;outline-offset:2px}';
  Object.assign(element.style,game.recordingControlPosition||{});doc.head.append(style);doc.body.append(element);recorder.connectControls(element);
 }
 frame.addEventListener('load',controls);if(frame.contentDocument?.readyState==='complete')controls();
 let disposed=false;
 function dispose(){if(disposed)return;disposed=true;frame.removeEventListener('load',controls);frame.removeEventListener('load',reload);recorder.dispose();runtime.dispose();window.removeEventListener('pagehide',dispose);frame.src='about:blank';document.body.classList.remove('game-mode');}
 window.addEventListener('pagehide',dispose);return {runtime,dispose};
}
