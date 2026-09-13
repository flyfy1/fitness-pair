import './style.css';
import { PoseCamera } from './camera.js';
import { HeadFlightController } from './recognizer.js';
import { createFlight, consumeAction, stepFlight, crash } from './engine.js';
import { render } from './render.js';
import { setupFullscreen } from './fullscreen.js';

document.querySelector('#app').innerHTML = `
<main class="shell"><section class="stage" aria-label="Live video AR flight"><video id="video" muted playsinline aria-label="Your mirrored local camera"></video><canvas id="scene" aria-label="Helicopter follows your head over the camera"></canvas>
<div class="hud"><div><h1 class="brand">Push-up Flight <small>You are the pilot.</small></h1><span class="badge" id="mode">HEAD & SHOULDERS</span><p class="mode-note" id="demo-note">Push-up play · head tracking</p></div><div class="stats"><strong id="seconds">0.0 s</strong>flight time · <span id="gates">0</span> gates</div></div>
<div class="panel" id="panel"><h2 id="title">Your head is the helicopter.</h2><p id="message">Get into your push-up position with your head and either shoulder visible. The helicopter follows your head down and up, right on the video.</p><p class="instructions">Keep your head and either shoulder in view for a moment to take off automatically. Move at your own pace and fly through the gates.</p><button class="primary" id="start">Enable camera</button><button id="demo">Try a demo</button></div>
<div class="cue"><span id="cue" role="status">Head and one shoulder are enough. Lower down, then push up.</span><progress id="calibration" max="1" value="0" hidden aria-label="Automatic takeoff"></progress></div>
<div class="toolbar"><div class="flight-controls"><button id="stop" hidden>Stop camera</button></div><button id="fullscreen" aria-label="Enter fullscreen" aria-pressed="false">⛶</button></div>
<span class="privacy">Local camera · No recording or uploads</span><span id="view-status" role="status"></span></section></main>`;

const $ = id => document.getElementById(id);
const video=$('video'),canvas=$('scene'),ctx=canvas.getContext('2d'),stage=document.querySelector('.stage');
const controller=new HeadFlightController();
let mode='camera',pose=null,pilot=null,state=createFlight({sessionId:'idle',source:{kind:'synthetic',id:'idle'}});
let lastAction=null,lastFrame=performance.now(),demoSeq=0,starting=false,halted=false;
let demoHead={x:.65,y:.52,image:{width:1280,height:720}};
const headCanvas=document.createElement('canvas');headCanvas.width=headCanvas.height=100;
function panel(title,message,label='Try again') {
  document.querySelector('.instructions').hidden=true;
  $('panel').hidden=false;$('title').textContent=title;$('message').textContent=message;
  $('start').textContent=label;$('demo').hidden=false;
}
function clearHead() { pose=null;pilot=null;headCanvas.getContext('2d').clearRect(0,0,100,100); }
function interrupt(message) {
  if (halted || state.finished) return;
  halted=true;state.status='paused';starting=false;
  camera.stop('interrupted');clearHead();$('stop').hidden=true;$('calibration').hidden=true;
  $('cue').textContent='Flight paused. Start again when you are ready.';
  panel('Let’s find you again.',message,'Start a fresh flight');
}
const camera=new PoseCamera({video,
  onStatus(status){
    if(status.state==='requesting') {
      $('cue').textContent='Waiting for camera permission…';controller.reset(status);state=createFlight(status);
    }
    if(status.state==='loading') $('cue').textContent='Preparing the local pose model…';
    if(status.state==='ready') {
      $('cue').textContent='Show your head and either shoulder. Takeoff is automatic.';starting=false;
    }
  },
  onPose(frame){
    if(halted || state.status==='crashing' || state.finished)return;
    if(performance.now()-frame.tMs>250) {
      interrupt('Tracking arrived too slowly. Check your camera and lighting, then try again.');return;
    }
    pose=frame;
    const action=controller.update(frame);if(!action)return;
    lastAction=action;
    if(action.phase==='missing'&&state.status==='flying'){
      interrupt('Your head or shoulder moved out of view. Reframe the camera and start again.');return;
    }
    consumeAction(state,action);
    $('calibration').hidden=action.phase!=='calibrating';$('calibration').value=action.calibrationProgress??0;
    if(frame.head&&video.readyState>=2){
      const {x,y,sizePx}=frame.head,s=Math.min(sizePx,video.videoWidth,video.videoHeight);
      const sx=Math.max(0,Math.min(video.videoWidth-s,x*video.videoWidth-s/2));
      const sy=Math.max(0,Math.min(video.videoHeight-s,y*video.videoHeight-s/2));
      const c=headCanvas.getContext('2d');c.save();c.translate(100,0);c.scale(-1,1);
      c.drawImage(video,sx,sy,s,s,0,0,100,100);c.restore();pilot=headCanvas;
    } else pilot=null;
  },
  onError(error){
    const message=error.name==='NotAllowedError'?'Camera permission was denied. Allow camera access and try again, or explore the demo.':error.message;
    if(halted)panel('Let’s try that again.',message,'Start a fresh flight');else interrupt(message);
  },
  onStop({reason}){
    if(!['finished','interrupted','restart','error'].includes(reason)&&!halted)
      interrupt('The camera stopped. Start again with your head and a shoulder in view.');
  }
});
async function startCamera(){
  halted=true;camera.stop('restart');clearHead();mode='camera';lastAction=null;halted=false;starting=true;
  $('mode').textContent='HEAD & SHOULDERS';$('demo-note').textContent='Push-up play · head tracking';
  $('panel').hidden=true;$('stop').hidden=false;$('stop').textContent='Stop camera';
  await camera.start();
}
function startDemo(){
  halted=true;camera.stop('restart');clearHead();mode='synthetic';halted=false;starting=false;lastAction=null;demoSeq=0;
  state=createFlight({sessionId:crypto.randomUUID(),source:{kind:'synthetic',id:'pointer-demo'}});
  const rect=stage.getBoundingClientRect();demoHead={x:.65,y:.52,image:{width:Math.round(rect.width),height:Math.round(rect.height)}};
  $('mode').textContent='SYNTHETIC DEMO';$('demo-note').textContent='Pointer / touch / arrows · no camera';
  $('panel').hidden=true;$('stop').hidden=false;$('stop').textContent='Finish & rest';$('calibration').hidden=true;
}
function finishOrStop(){
  if(state.status==='flying') {
    crash(state,'rest');camera.stop('finished');clearHead();$('stop').hidden=true;
  } else interrupt('Camera and model stopped. Take your time.');
}
setupFullscreen(stage,$('fullscreen'),message=>{$('view-status').textContent=message;});
$('start').onclick=startCamera;$('demo').onclick=startDemo;$('stop').onclick=finishOrStop;
function pointerControl(event){
  if(mode!=='synthetic'||halted||event.target.closest('button'))return;
  const rect=stage.getBoundingClientRect();
  demoHead={x:1-Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),
    y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height)),
    image:{width:Math.round(rect.width),height:Math.round(rect.height)}};
}
stage.addEventListener('pointerdown',pointerControl);stage.addEventListener('pointermove',pointerControl);
window.addEventListener('keydown',event=>{
  if(mode==='synthetic'&&!halted&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)){
    event.preventDefault();
    if(event.code==='ArrowUp')demoHead.y=Math.max(.05,demoHead.y-.04);
    if(event.code==='ArrowDown')demoHead.y=Math.min(.95,demoHead.y+.04);
    if(event.code==='ArrowLeft')demoHead.x=Math.min(.95,demoHead.x+.04);
    if(event.code==='ArrowRight')demoHead.x=Math.max(.05,demoHead.x-.04);
  }
  if(event.code==='Escape')interrupt('You paused the flight. Take your time.');
});
window.addEventListener('blur',()=>{
  if(camera.active||state.status==='flying')interrupt('The window lost focus. Your camera has been stopped.');
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&(camera.active||state.status==='flying'))interrupt('The tab was hidden. Your camera has been stopped.');
});
function tick(now){
  const dt=(now-lastFrame)/1000;lastFrame=now;
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  if(!halted&&mode==='synthetic'&&!state.finished&&state.status!=='crashing'){
    consumeAction(state,{version:1,sessionId:state.sessionId,source:state.source,inputSeq:++demoSeq,tMs:now,
      recognizerId:'synthetic-pointer',action:'head-flight',phase:'active',progress:1,
      calibrationProgress:null,cue:'Synthetic head position',completion:null,headControl:demoHead});
  }
  if(!halted&&mode==='camera'&&state.status==='flying'&&now-state.lastTMs>250)
    interrupt('Tracking was interrupted. Show your head and shoulder, then start again.');
  if(!halted)stepFlight(state,dt,now,rect);
  if(!halted&&state.status==='flying'){
    $('stop').textContent='Finish & rest';
    $('cue').textContent=mode==='camera'?'Your helicopter follows your head. Down, then up — at your own pace.':'Move your pointer, drag on the video, or use the arrow keys.';
  } else if(!halted&&state.status==='waiting'&&lastAction)$('cue').textContent=lastAction.cue;
  else if(!halted&&state.status==='crashing'){$('cue').textContent='It’s okay. We’ve got you.';$('calibration').hidden=true;}
  if(state.finished&&!halted){
    halted=true;camera.stop('finished');clearHead();$('stop').hidden=true;
    panel('You did so well.',mode==='synthetic'?'Demo complete. In camera play, this is where your effort is celebrated: “You’re amazing. You did a wonderful job. Rest for a moment — the sky can wait.”':'You showed up, and that matters. You’re amazing. You did a wonderful job. Rest for a moment — the sky can wait.','Fly again with camera');
    $('cue').textContent=state.reason==='obstacle'?'A little bump in the sky. Your effort still counts.':'A soft ending. Rest for as long as you need.';
  }
  $('seconds').textContent=`${state.flightSeconds.toFixed(1)} s`;$('gates').textContent=state.passed;
  if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){
    canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
  }
  ctx.setTransform(dpr,0,0,dpr,0,0);render(ctx,state,{width:rect.width,height:rect.height,pose,pilot,time:now,mode});
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
// Retain the existing read-only debug handle; never expose camera pixels or raw landmarks.
window.plankFlight={getState:()=>{
  const {headControl,...snapshot}=structuredClone(state);
  return {...snapshot,mode,cameraActive:camera.active,starting,headVisible:!!pilot,phase:lastAction?.phase??null};
}};
