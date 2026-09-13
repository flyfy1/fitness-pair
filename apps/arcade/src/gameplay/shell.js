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
 function controls(){
  const doc=frame.contentDocument;if(!doc?.body)return;
  const element=doc.createElement('div');element.className='hopmodo-conversation';
  element.innerHTML='<button type="button" aria-label="Record conversation" title="Record conversation" aria-pressed="false"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/><path class="mic-off" d="m3 3 18 18"/></svg></button><span role="status" hidden>Microphone off</span>';
  const style=doc.createElement('style');
  style.textContent='.hopmodo-conversation{position:fixed;right:12px;top:12px;z-index:100;color:#182346;font:12px Arial,sans-serif}.hopmodo-conversation button{display:grid;place-items:center;width:40px;height:40px;padding:0;box-shadow:0 2px 12px #0003;border:1px solid #18234633;border-radius:50%;background:#fff;color:#182346}.hopmodo-conversation[data-state=recording] button{background:#a92020;color:#fff}.hopmodo-conversation[data-state=ready] button,.hopmodo-conversation[data-state=pending] button{background:#2347ee;color:#fff}.hopmodo-conversation button[aria-pressed=true] .mic-off{display:none}.hopmodo-conversation span{position:absolute;right:0;top:calc(100% + 6px);width:max-content;max-width:min(260px,calc(100vw - 24px));padding:8px;border:1px solid #18234655;border-radius:8px;background:#fff;line-height:1.4}.hopmodo-conversation span[hidden]{display:none}.hopmodo-conversation button:focus-visible{outline:3px solid #ff795e;outline-offset:2px}';
  doc.head.append(style);doc.body.append(element);recorder.connectControls(element);
 }
 frame.addEventListener('load',controls);if(frame.contentDocument?.readyState==='complete')controls();
 let disposed=false;
 function dispose(){if(disposed)return;disposed=true;frame.removeEventListener('load',controls);frame.removeEventListener('load',reload);recorder.dispose();runtime.dispose();window.removeEventListener('pagehide',dispose);frame.src='about:blank';document.body.classList.remove('game-mode');}
 window.addEventListener('pagehide',dispose);return {runtime,dispose};
}
