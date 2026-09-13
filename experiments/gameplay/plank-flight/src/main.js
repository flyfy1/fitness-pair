import './style.css';
import { PoseCamera } from './camera.js';
import { PlankRecognizer } from './recognizer.js';
import { createFlight, consumeAction, stepFlight, COAST_SECONDS } from './engine.js';
import { render } from './render.js';
import { setupFullscreen } from './fullscreen.js';

document.querySelector('#app').innerHTML = `
<main class="shell"><section class="stage" aria-label="Live video AR flight"><video id="video" muted playsinline aria-label="Your mirrored local camera"></video><canvas id="scene" aria-label="Helicopter and obstacles over the camera"></canvas>
<div class="hud"><div><h1 class="brand">Plank Flight <small>A little lift.</small></h1><span class="badge" id="mode">LOCAL CAMERA AR</span><p class="mode-note" id="demo-note"></p></div><div class="stats"><strong id="seconds">0.0 s</strong>support detected · <span id="gates">0</span> gates</div></div>
<div class="panel" id="panel"><h2 id="title">Your next little adventure.</h2><p id="message">Set the camera to your side so your whole body is visible. Your head becomes the pilot; your plank gives the helicopter lift.</p><p class="instructions">Hold support for 1.2 seconds to take off. Hold to rise, rest briefly to descend. After 3 seconds of rest, your flight comes to a gentle end.</p><button class="primary" id="start">Enable camera</button><button id="demo">Try a demo</button></div>
<div class="cue"><span id="cue" role="status">A side view works best. Keep your head, arms and feet in frame.</span><progress id="calibration" max="1" value="0" hidden aria-label="Support calibration"></progress></div>
<div class="toolbar"><div class="flight-controls"><button id="stop" hidden>Stop camera</button><button id="lift" class="demo-lift" hidden>Hold to lift · Space</button></div><button id="fullscreen" aria-label="Enter fullscreen" aria-pressed="false">⛶</button></div>
<span class="privacy">Local camera · No recording or uploads</span><span id="view-status" role="status"></span></section></main>`;

const $ = id => document.getElementById(id);
const video=$('video'),canvas=$('scene'),ctx=canvas.getContext('2d');
const recognizer=new PlankRecognizer();
let mode='camera',pose=null,pilot=null,state=createFlight({sessionId:'idle',source:{kind:'synthetic',id:'idle'}});
let lastAction=null,lastFrame=performance.now(),demoHeld=false,demoSeq=0,starting=false,halted=false;
const headCanvas=document.createElement('canvas');headCanvas.width=headCanvas.height=100;
function panel(title,message,label='Try again') { document.querySelector('.instructions').hidden=true; $('panel').hidden=false;$('title').textContent=title;$('message').textContent=message;$('start').textContent=label;$('start').disabled=false;$('demo').hidden=false; }
function clearHead() { pose=null;pilot=null;headCanvas.getContext('2d').clearRect(0,0,100,100); }
function interrupt(message) {
  if (halted || state.finished) return;
  halted=true;state.status='paused';demoHeld=false;starting=false;
  camera.stop('interrupted');clearHead();$('stop').hidden=true;$('calibration').hidden=true;
  $('cue').textContent='Flight paused. Start a fresh attempt when you are ready.';
  panel('Let’s find you again.',message,'Start a fresh flight');
}
const camera=new PoseCamera({video,
  onStatus(status){
    if(status.state==='requesting') {$('cue').textContent='Waiting for camera permission…';recognizer.reset(status);state=createFlight(status);}
    if(status.state==='loading') $('cue').textContent='Preparing the local pose model…';
    if(status.state==='ready') {$('cue').textContent='Get into a side-on support pose. Hold steady to take off.';starting=false;}
  },
  onPose(frame){
    if(halted || state.status==='crashing' || state.finished)return;
    if(performance.now()-frame.tMs>250) {interrupt('Tracking arrived too slowly. Check your camera and lighting, then try again.');return;}
    pose=frame;
    const action=recognizer.update(frame);if(!action)return;
    lastAction=action;
    if(action.phase==='missing'&&state.status==='flying'){interrupt('Your body moved out of view. Tracking loss does not count as giving up.');return;}
    consumeAction(state,action);
    $('calibration').hidden=action.phase!=='calibrating';$('calibration').value=action.calibrationProgress??0;
    if(frame.head&&video.readyState>=2){
      const {x,y,sizePx}=frame.head,s=Math.min(sizePx,video.videoWidth,video.videoHeight);
      const sx=Math.max(0,Math.min(video.videoWidth-s,x*video.videoWidth-s/2));
      const sy=Math.max(0,Math.min(video.videoHeight-s,y*video.videoHeight-s/2));
      const c=headCanvas.getContext('2d');c.save();c.translate(100,0);c.scale(-1,1);c.drawImage(video,sx,sy,s,s,0,0,100,100);c.restore();pilot=headCanvas;
    } else pilot=null;
  },
  onError(error){
    const message=error.name==='NotAllowedError'?'Camera permission was denied. Allow camera access and try again, or explore the demo.':error.message;
    if(halted)panel('Let’s try that again.',message,'Start a fresh flight');else interrupt(message);
  },
  onStop({reason}){if(!['finished','interrupted','restart','error'].includes(reason)&&!halted)interrupt('The camera stopped. Your next flight starts with a new calibration.');}
});
async function startCamera(){
  halted=true;camera.stop('restart');clearHead();mode='camera';demoHeld=false;lastAction=null;halted=false;starting=true;
  $('mode').textContent='LOCAL CAMERA AR';$('demo-note').textContent='';$('panel').hidden=true;$('stop').hidden=false;$('stop').textContent='Stop camera';$('lift').hidden=true;
  await camera.start();
}
function startDemo(){
  halted=true;camera.stop('restart');clearHead();mode='synthetic';halted=false;starting=false;lastAction=null;demoHeld=false;demoSeq=0;
  state=createFlight({sessionId:crypto.randomUUID(),source:{kind:'synthetic',id:'keyboard-demo'}});
  $('mode').textContent='SYNTHETIC DEMO';$('demo-note').textContent='Keyboard input · no camera recognition';$('panel').hidden=true;$('stop').hidden=false;$('stop').textContent='End demo';$('lift').hidden=false;$('calibration').hidden=true;
  $('cue').textContent='Hold Space or the lift button to take off.';
}
setupFullscreen(document.querySelector('.stage'),$('fullscreen'),message=>{$('view-status').textContent=message;});
$('start').onclick=startCamera;$('demo').onclick=startDemo;$('stop').onclick=()=>interrupt(mode==='camera'?'Camera and model stopped. Take your time.':'Demo stopped. Camera play starts a separate flight.');
$('lift').onpointerdown=e=>{e.preventDefault();$('lift').setPointerCapture(e.pointerId);demoHeld=true;};
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('lift').addEventListener(name,()=>{demoHeld=false;});
window.addEventListener('keydown',e=>{if(e.code==='Space'&&mode==='synthetic'&&!halted){e.preventDefault();demoHeld=true;}if(e.code==='Escape')interrupt('You paused the flight. Take your time.');});
window.addEventListener('keyup',e=>{if(e.code==='Space'){demoHeld=false;if(mode==='synthetic')e.preventDefault();}});
window.addEventListener('blur',()=>{if(camera.active||state.status==='flying')interrupt('The window lost focus. Your camera has been stopped.');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(camera.active||state.status==='flying'))interrupt('The tab was hidden. Your camera has been stopped.');});
function tick(now){
  const dt=(now-lastFrame)/1000;lastFrame=now;
  if(!halted&&mode==='synthetic'&&!state.finished&&state.status!=='crashing'){
    const action={version:1,sessionId:state.sessionId,source:state.source,inputSeq:++demoSeq,tMs:now,recognizerId:'synthetic-keyboard',action:'plank-hold',phase:demoHeld?'active':'ready',progress:demoHeld?1:0,calibrationProgress:null,cue:'Synthetic lift input',completion:null};consumeAction(state,action);
  }
  if(!halted&&mode==='camera'&&state.status==='flying'&&now-state.lastTMs>250)interrupt('Tracking was interrupted. Adjust the camera and start a fresh flight.');
  if(!halted)stepFlight(state,dt,now);
  if(!halted&&state.status==='flying')$('cue').textContent=state.active?'You’re doing beautifully. One breath at a time.':`Coasting · ${Math.max(0,COAST_SECONDS-state.releasedSeconds).toFixed(1)} s to settle back into support`;
  else if(!halted&&state.status==='waiting'&&lastAction)$('cue').textContent=lastAction.cue;
  else if(!halted&&state.status==='crashing'){$('cue').textContent='It’s okay. We’ve got you.';$('calibration').hidden=true;}
  if(state.finished&&!halted){
    halted=true;camera.stop('finished');clearHead();$('stop').hidden=true;$('lift').hidden=true;
    panel('You did so well.',mode==='synthetic'?`Demo complete. In camera play, this is where your effort is celebrated: “You’re amazing. You did a wonderful job. Rest for a moment — the sky can wait.”`:`${state.holdSeconds.toFixed(1)} seconds of showing up. That effort was real. You’re amazing, and you did a wonderful job. Rest for a moment — the sky can wait.`, 'Fly again with camera');
    $('cue').textContent=state.reason==='obstacle'?'A little bump in the sky. Your effort still counts.':'A soft ending. You have already done something good for yourself.';
  }
  $('seconds').textContent=`${state.holdSeconds.toFixed(1)} s`;$('gates').textContent=state.passed;
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);render(ctx,state,{width:rect.width,height:rect.height,pose,pilot,time:now,mode});
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
// Read-only diagnostics contain no camera pixels or raw landmarks.
window.plankFlight={getState:()=>({...structuredClone(state),mode,cameraActive:camera.active,starting,headVisible:!!pilot,phase:lastAction?.phase??null})};
