import {subscribeLanguage} from '../../../../packages/gameplay/locale.js';
import '../../../../packages/gameplay/page-language.js';
import {t,getLanguage,setLanguage,localizeDOM} from './i18n.js';
import './style.css';
import {drawBody} from '../../../../apps/camera-start/src/body-overlay.js';
import { FlightAudio } from './audio.js';
import { PoseCamera } from './camera.js';
import { HeadFlightController } from './recognizer.js';
import { createFlight, consumeAction, stepFlight, crash } from './engine.js';
import { render } from './render.js';
import { setupOrientation } from './landscape.js';
import { setupFullscreen } from './fullscreen.js';
import { TrackingGate, FRAME_FRESH_MS } from './tracking-gate.js';
import { DEFAULT_DIFFICULTY, setDifficulty, flightSpeed } from './difficulty.js';
import { projectHead, validHeadControl } from './projection.js';

document.querySelector('#app').innerHTML = `
<main class="shell"><section class="stage" aria-label="Live video AR flight"><video id="video" muted playsinline aria-label="Your mirrored local camera"></video><canvas id="scene" aria-label="Helicopter follows your head over the camera"></canvas><canvas id="body-overlay" aria-label="Recognized body joints"></canvas>
<div class="hud"><div><h1 class="brand">Push-up Flight <small>You are the pilot.</small></h1><span class="badge" id="mode">HEAD & SHOULDERS</span><p class="mode-note" id="demo-note">AI-generated voices</p></div><div class="stats"><strong id="seconds">0.0 s</strong>flight time · <span id="gates">0</span> gates<div class="current-speed">Speed <span id="current-speed">1.0×</span></div></div></div>
<div class="panel" id="panel"><h2 id="title">Your head is the helicopter.</h2><p id="message">Get into your push-up position with your head and either shoulder visible. The helicopter follows your head down and up, right on the video.</p><p class="instructions">Keep your head and either shoulder in view to begin the 3-second countdown. Move at your own pace and fly through the gates.</p><div id="orientation-controls" class="orientation-controls" hidden><label for="orientation">Screen layout <select id="orientation"><option value="device">Follow device</option><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label><p id="orientation-status" role="status">Landscape offers more room. Portrait works too.</p></div><button class="primary" id="start">Enable camera</button><button id="demo">Try a demo</button></div>
<div id="countdown" class="countdown" role="status" aria-live="assertive" hidden></div>
<div class="cue"><span id="cue" role="status">Head and one shoulder are enough. Lower down, then push up.</span><progress id="calibration" max="1" value="0" hidden aria-label="Automatic takeoff"></progress></div>
<div class="difficulty" role="group" aria-label="Difficulty">
<label for="opening"><span>Gate opening <output id="opening-value">4.0× plane</output></span><input id="opening" type="range" min="2" max="6" step="0.1" value="4"></label>
<label for="speed"><span>Speed <output id="speed-value">1.0×</output></span><input id="speed" type="range" min="0.4" max="6" step="0.1" value="1"></label>
<label for="acceleration"><span>Acceleration <output id="acceleration-value">+0.4×/min</output></span><input id="acceleration" type="range" min="0" max="1.5" step="0.1" value="0.4"></label>
</div><div class="toolbar"><div class="flight-controls"><button id="stop" hidden>Stop camera</button></div><label class="language-control" data-no-i18n><select id="language" aria-label="Language / 语言"><option value="en">English</option><option value="zh">中文</option></select></label><button id="sound" aria-pressed="true" aria-label="Mute sound">Sound on</button><button id="fullscreen" aria-label="Enter fullscreen" aria-pressed="false">⛶</button></div>

<span class="privacy">Local camera · No recording or uploads</span><span id="view-status" role="status"></span></section></main>`;

const $ = id => document.getElementById(id);
const video=$('video'),canvas=$('scene'),ctx=canvas.getContext('2d'),stage=document.querySelector('.stage');
const controller=new HeadFlightController();
const sound=new FlightAudio(getLanguage());
$('language').value=getLanguage();
const releaseLanguage=subscribeLanguage(()=>{sound.setLanguage(getLanguage());updateDifficulty();});
window.addEventListener('pagehide',releaseLanguage,{once:true});
$('language').onchange=()=>{setLanguage($('language').value);sound.setLanguage(getLanguage());localizeDOM();updateDifficulty();};
localizeDOM();
const tracking=new TrackingGate();tracking.reset(performance.now());
let difficulty={...DEFAULT_DIFFICULTY};
let mode='camera',pose=null,pilot=null,state=createFlight({sessionId:'idle',source:{kind:'synthetic',id:'idle'}});
let lastAction=null,lastFrame=performance.now(),demoSeq=0,starting=false,halted=false;
let demoHead={x:.65,y:.52,image:{width:1280,height:720}};
const headCanvas=document.createElement('canvas');headCanvas.width=headCanvas.height=100;
function panel(title,message,label=t('Try again')) {
  document.querySelector('.instructions').hidden=true;
  $('panel').hidden=false;$('title').textContent=title;$('message').textContent=message;
  $('start').textContent=label;$('demo').hidden=false;
}
function clearHead() { drawBody($('body-overlay'),null);pose=null;pilot=null;headCanvas.getContext('2d').clearRect(0,0,100,100); }
function interrupt(message) {
  if (halted || state.finished) return;
  halted=true;state.status='paused';starting=false;
  sound.stop();camera.stop('interrupted');clearHead();$('stop').hidden=true;$('calibration').hidden=true;
  $('cue').textContent=t('Flight paused. Start again when you are ready.');
  panel(t('Let’s find you again.'),message,t('Start a fresh flight'));
}
const camera=new PoseCamera({video,
  onStatus(status){
    if(status.state==='requesting') {
      $('cue').textContent=t('Waiting for camera permission…');controller.reset(status);state=createFlight(status,difficulty);tracking.reset(performance.now());
    }
    if(status.state==='loading') $('cue').textContent=t('Preparing the local pose model…');
    if(status.state==='ready') {
      $('cue').textContent=t('Show your head and either shoulder. Takeoff is automatic.');starting=false;tracking.reset(performance.now());
    }
  },
  onPose(frame){
    if(halted || state.status==='crashing' || state.finished)return;
    const now=performance.now();
    if(now-frame.tMs>FRAME_FRESH_MS) {
      if(['countdown','flying'].includes(state.status)){tracking.observe(false,now);state.trackingHeld=true;}
      else $('cue').textContent=t('Camera is catching up. Keep your head in view.');
      return;
    }
    let input=frame;
    const headControl={...frame.head,image:frame.image};
    if(validHeadControl(headControl)) {
      const rect=stage.getBoundingClientRect(),point=projectHead(headControl,rect.width,rect.height);
      if(point.x<0||point.x>1||point.y<0||point.y>1)input={...frame,head:undefined};
    }
    const action=controller.update(input);if(!action)return;
    lastAction=action;
    if(['countdown','flying'].includes(state.status)) {
      state.trackingHeld=tracking.observe(action.phase!=='missing',now).held;
      if(state.trackingHeld)return;
    } else {tracking.reset(now);state.trackingHeld=false;}
    pose=input;
    consumeAction(state,action);
    $('calibration').hidden=action.phase!=='calibrating';$('calibration').value=action.calibrationProgress??0;
    if(input.head&&video.readyState>=2){
      const {x,y,sizePx}=frame.head,s=Math.min(sizePx,video.videoWidth,video.videoHeight);
      const sx=Math.max(0,Math.min(video.videoWidth-s,x*video.videoWidth-s/2));
      const sy=Math.max(0,Math.min(video.videoHeight-s,y*video.videoHeight-s/2));
      const c=headCanvas.getContext('2d');c.save();c.translate(100,0);c.scale(-1,1);
      c.drawImage(video,sx,sy,s,s,0,0,100,100);c.restore();pilot=headCanvas;
    } else pilot=null;
  },
  onError(error){
    if(state.status==='crashing'||state.finished)return;
    if(['countdown','flying'].includes(state.status)&&!halted){tracking.observe(false,performance.now());state.trackingHeld=true;return;}
    const message=error.name==='NotAllowedError'?t('Camera permission was denied. Allow camera access and try again, or explore the demo.'):t(error.message);
    if(halted)panel(t('Let’s try that again.'),message,t('Start a fresh flight'));else interrupt(message);
  },
  onStop({reason}){
    if(!['finished','interrupted','restart','error'].includes(reason)&&!halted)
      interrupt(t('The camera stopped. Start again with your head and a shoulder in view.'));
  }
});
function hideSetupControls(){
  orientation.finishSetup();
  stage.classList.add('session-started');
  // The arcade may move the language selector into its shared control panel.
  for(const control of document.querySelectorAll('.difficulty,.language-control,.current-speed,.orientation-controls'))
    control.hidden=true;
}
async function startCamera(){
  hideSetupControls();
  sound.stop();sound.unlock();
  halted=true;camera.stop('restart');clearHead();mode='camera';lastAction=null;halted=false;starting=true;
  $('mode').textContent=t('HEAD & SHOULDERS');$('demo-note').textContent=t('Camera · AI-generated voices');
  $('panel').hidden=true;$('stop').hidden=false;$('stop').textContent=t('Stop camera');
  await camera.start();
}
function startDemo(){
  hideSetupControls();
  sound.stop();sound.unlock();
  halted=true;camera.stop('restart');clearHead();mode='synthetic';halted=false;starting=false;lastAction=null;demoSeq=0;
  state=createFlight({sessionId:crypto.randomUUID(),source:{kind:'synthetic',id:'pointer-demo'}},difficulty);
  const rect=stage.getBoundingClientRect();demoHead={x:.65,y:.52,image:{width:Math.round(rect.width),height:Math.round(rect.height)}};
  $('mode').textContent=t('SYNTHETIC DEMO');$('demo-note').textContent=t('Pointer demo · AI-generated voices');
  $('panel').hidden=true;$('stop').hidden=false;$('stop').textContent=t('Cancel countdown');$('calibration').hidden=true;
}
function finishOrStop(){
  if(state.status==='flying') {
    crash(state,'rest');camera.stop('finished');clearHead();$('stop').hidden=true;
  } else interrupt(t('Camera and model stopped. Take your time.'));
}
function updateDifficulty(){
  difficulty={opening:Number($('opening').value),speed:Number($('speed').value),acceleration:Number($('acceleration').value)};
  setDifficulty(state,difficulty);
  $('opening-value').textContent=`${difficulty.opening.toFixed(1)}× ${t('plane')}`;
  $('speed-value').textContent=`${difficulty.speed.toFixed(1)}×`;
  $('acceleration-value').textContent=`+${difficulty.acceleration.toFixed(1)}×/${t('min')}`;
}
$('sound').onclick=()=>{
  sound.setMuted(!sound.muted);
  $('sound').textContent=sound.muted?t('Sound off'):t('Sound on');
  $('sound').setAttribute('aria-label',sound.muted?t('Enable sound'):t('Mute sound'));
  $('sound').setAttribute('aria-pressed',String(!sound.muted));
};
window.addEventListener('pagehide',()=>sound.dispose());
if(import.meta.hot)import.meta.hot.dispose(()=>sound.dispose());
updateDifficulty();
for(const id of ['opening','speed','acceleration'])$(id).addEventListener('input',updateDifficulty);
setupFullscreen(stage,$('fullscreen'),message=>{$('view-status').textContent=message;});
const orientation=setupOrientation(stage,$('orientation-controls'),$('orientation'),$('orientation-status'));
$('start').onclick=startCamera;$('demo').onclick=startDemo;$('stop').onclick=finishOrStop;
function pointerControl(event){
  if(mode!=='synthetic'||halted||event.target.closest('button, .difficulty, .language-control'))return;
  const rect=stage.getBoundingClientRect();
  demoHead={x:1-Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),
    y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height)),
    image:{width:Math.round(rect.width),height:Math.round(rect.height)}};
}
stage.addEventListener('pointerdown',pointerControl);stage.addEventListener('pointermove',pointerControl);
window.addEventListener('keydown',event=>{
  if(mode==='synthetic'&&!halted&&!event.target.closest('.difficulty, .language-control')&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)){
    event.preventDefault();
    if(event.code==='ArrowUp')demoHead.y=Math.max(.05,demoHead.y-.04);
    if(event.code==='ArrowDown')demoHead.y=Math.min(.95,demoHead.y+.04);
    if(event.code==='ArrowLeft')demoHead.x=Math.min(.95,demoHead.x+.04);
    if(event.code==='ArrowRight')demoHead.x=Math.max(.05,demoHead.x-.04);
  }
  if(event.code==='Escape')interrupt(t('You paused the flight. Take your time.'));
});
window.addEventListener('blur',()=>{
  sound.stop();
  if(camera.active||['countdown','flying'].includes(state.status))interrupt(t('The window lost focus. Your camera has been stopped.'));
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)sound.stop();
  if(document.hidden&&(camera.active||['countdown','flying'].includes(state.status)))interrupt(t('The tab was hidden. Your camera has been stopped.'));
});
function tick(now){
  const dt=(now-lastFrame)/1000;lastFrame=now;
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  if(!halted&&mode==='synthetic'&&!state.finished&&state.status!=='crashing'){
    consumeAction(state,{version:1,sessionId:state.sessionId,source:state.source,inputSeq:++demoSeq,tMs:now,
      recognizerId:'synthetic-pointer',action:'head-flight',phase:'active',progress:1,
      calibrationProgress:null,cue:'Synthetic head position',completion:null,headControl:demoHead});
  }
  if(!halted&&mode==='camera'&&['countdown','flying'].includes(state.status))state.trackingHeld=tracking.status(now).held;
  if(!halted)stepFlight(state,dt,now,rect);
  sound.update(state,flightSpeed(state));
  const counting=!halted&&state.status==='countdown';
  const showStart=!halted&&state.status==='flying'&&state.flightSeconds<.6;
  $('countdown').hidden=!(counting||showStart);
  const countText=counting?String(Math.max(1,Math.ceil(3-state.countdownSeconds))):t('START!');
  if($('countdown').textContent!==countText)$('countdown').textContent=countText;
  if(!halted&&state.status==='flying'){
    $('stop').textContent=t('Finish & rest');
    $('cue').textContent=state.trackingHeld?t('Tracking lost — holding your position. Obstacles keep moving.'):mode==='camera'?t('Your helicopter follows your head. Down, then up — at your own pace.'):t('Move your pointer, drag on the video, or use the arrow keys.');
  } else if(counting){
    $('stop').textContent=t('Cancel countdown');$('calibration').hidden=true;
    $('cue').textContent=state.trackingHeld?t('Holding your position. Get ready!'):t('Get ready — your flight is about to begin!');
  } else if(!halted&&state.status==='waiting'&&lastAction)$('cue').textContent=t(lastAction.cue);
  else if(!halted&&state.status==='crashing'){$('cue').textContent=t('It’s okay. We’ve got you.');$('calibration').hidden=true;}
  if(state.finished&&!halted){
    halted=true;camera.stop('finished');clearHead();$('stop').hidden=true;
    panel(t('You did so well.'),mode==='synthetic'?t('Demo complete. In camera play, this is where your effort is celebrated: “You’re amazing. You did a wonderful job. Rest for a moment — the sky can wait.”'):t('You showed up, and that matters. You’re amazing. You did a wonderful job. Rest for a moment — the sky can wait.'),t('Fly again with camera'));
    $('cue').textContent=state.reason==='obstacle'?t('A little bump in the sky. Your effort still counts.'):t('A soft ending. Rest for as long as you need.');
  }
  $('seconds').textContent=`${state.flightSeconds.toFixed(1)} ${t('s')}`;$('gates').textContent=state.passed;$('current-speed').textContent=`${flightSpeed(state).toFixed(1)}×`;
  if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){
    canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
  }
  ctx.setTransform(dpr,0,0,dpr,0,0);render(ctx,state,{width:rect.width,height:rect.height,pose,pilot,time:now,mode});
  drawBody($('body-overlay'),mode==='camera'&&camera.active&&pose&&now-pose.tMs<250?pose:null);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
// Retain the existing read-only debug handle; never expose camera pixels or raw landmarks.
window.plankFlight={localizeHost:()=>localizeDOM(),getAudioStream:()=>sound.getAudioStream(),getState:()=>{
  const {headControl,...snapshot}=structuredClone(state);
  return {...snapshot,mode,cameraActive:camera.active,starting,audio:sound.snapshot(),headVisible:!!pilot,phase:lastAction?.phase??null};
}};
