import {isDebugCommand} from './debug-command.js';
import {createDebugCapture} from './debug-capture.js';
import {saveDebugCapture,latestDebugCapture} from './debug-storage.js';
import {readLanguage} from '../../../../packages/gameplay/locale.js';
import {translateText} from '../../../../packages/gameplay/i18n.js';
import {videoExtension} from '../video-format.js';
export {isDebugCommand} from './debug-command.js';

function diagnosticPayload({game,bundle,trigger,includeVideo}){
 const {clip,snapshot,diagnostics}=bundle,source=snapshot.source||clip.inputSource||null;
 return {version:1,id:clip.id,consent:'debug-data-v1',trigger,includeVideo,requestedAt:Date.now(),
  gameId:game.id,sourcePage:`/play/${game.id}`,sessionId:clip.sessionId,
  gameState:{phase:snapshot.phase||null,score:snapshot.score||null,round:typeof snapshot.round==='string'?snapshot.round:null,source},
  clip:{id:clip.id,sessionId:clip.sessionId,createdAt:clip.createdAt,duration:clip.duration,width:clip.width,height:clip.height,bytes:clip.blob.size,mime:clip.blob.type,source:clip.source,inputSource:clip.inputSource||null,stopReason:clip.stopReason,finalScore:clip.finalScore},
  tracking:clip.tracking,diagnostics,
  client:{locale:readLanguage()==='zh'?'zh-CN':'en-US',viewport:{width:innerWidth,height:innerHeight},devicePixelRatio:devicePixelRatio||1}};
}

export function mountDebugReport(game,runtime,_recorder,{container}){
 let controls,dialog,recognition,armed=false,listening=false,disposed=false,restartTimer=0,busy=false,uploadEnabled=false,lastCapture=null,urls=[],cooldownUntil=0,uploadController=null,message='Record a five-second video and movement diagnostics, even before the game starts.';
 const notice=document.createElement('aside');notice.className='debug-capture-notice';notice.hidden=true;notice.innerHTML='<span role="status"></span><button type="button">Cancel debug</button>';container.append(notice);
 const capture=createDebugCapture(game,runtime,{onProgress:remaining=>{notice.querySelector('span').textContent=translateText(`Debug recording · ${remaining}s remaining`);}});
 const focusControl=()=>controls?.querySelector('[data-debug-report]')?.focus();
 const setMessage=text=>{message=text;const status=dialog?.querySelector('.debug-report-status');if(status)status.textContent=translateText(text);};
 function updateControl(){
  const button=controls?.querySelector('[data-debug-report]');if(!button)return;
  button.dataset.voice=armed?'on':'off';button.title=translateText(armed?'Debug report · voice command on':'Debug report');
  const voice=dialog?.querySelector('[data-voice]');if(voice){voice.textContent=translateText(armed?'Disable voice command':'Enable voice command');voice.setAttribute('aria-pressed',String(armed));}
 }
 function revoke(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
 function close(){dialog?.querySelector('video')?.pause();dialog?.remove();dialog=null;revoke();focusControl();}
 function stopVoice(){
  armed=false;listening=false;clearTimeout(restartTimer);restartTimer=0;
  const previous=recognition;recognition=null;
  if(previous){previous.onresult=previous.onend=previous.onerror=previous.onstart=null;try{if(previous.abort)previous.abort();else previous.stop();}catch{/* Already stopped. */}}
  updateControl();
 }
 function startVoice(){
  if(armed){stopVoice();setMessage('Voice command disabled.');return;}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){setMessage('Voice commands are unavailable in this browser. Use Record 5-second debug instead.');return;}
  const instance=new Recognition();recognition=instance;armed=true;
  instance.lang=readLanguage()==='zh'?'zh-CN':'en-US';instance.continuous=true;instance.interimResults=false;
  instance.onstart=()=>{if(!armed||recognition!==instance)return;listening=true;setMessage('Listening. Say “debug please” to record five seconds.');};
  instance.onresult=event=>{
   if(!armed||!listening||disposed||document.hidden)return;
   for(let i=event.resultIndex;i<event.results.length;i++)if(event.results[i].isFinal&&isDebugCommand(event.results[i][0].transcript)){void record('voice');break;}
  };
  instance.onerror=event=>{
   if(['not-allowed','service-not-allowed','audio-capture'].includes(event.error)){stopVoice();setMessage('Microphone permission was denied or unavailable. Use Record 5-second debug instead.');}
   else setMessage('Voice recognition paused. The manual debug button remains available.');
  };
  instance.onend=()=>{
   listening=false;
   if(armed&&!disposed&&!document.hidden)restartTimer=setTimeout(()=>{if(!armed||recognition!==instance)return;try{instance.start();}catch{stopVoice();setMessage('Voice command could not restart. Enable it again or use the manual button.');}},400);
  };
  try{setMessage('Waiting for microphone permission…');instance.start();updateControl();}
  catch{stopVoice();setMessage('Voice command could not start. Use the manual debug button.');}
 }
 function renderLatest(){
  const preview=dialog?.querySelector('[data-preview]');if(!preview||!lastCapture)return;
  revoke();preview.hidden=false;
  const videoURL=URL.createObjectURL(lastCapture.clip.blob),jsonURL=URL.createObjectURL(new Blob([JSON.stringify(lastCapture.report,null,2)],{type:'application/json'}));urls.push(videoURL,jsonURL);
  preview.querySelector('video').src=videoURL;
  const video=preview.querySelector('[data-download-video]');video.href=videoURL;video.download=`hopmodo-debug-${lastCapture.id}.${videoExtension(lastCapture.clip.blob)}`;
  const json=preview.querySelector('[data-download-json]');json.href=jsonURL;json.download=`hopmodo-debug-${lastCapture.id}.json`;
  preview.querySelector('small').textContent=translateText(`Local debug reference: ${lastCapture.id}`);
  const retry=dialog.querySelector('[data-upload]');retry.hidden=lastCapture.uploaded;retry.disabled=busy;
 }
 async function open(){
  if(disposed||dialog)return;
  await document.exitFullscreen?.().catch(()=>{});
  if(disposed||dialog)return;
  dialog=document.createElement('section');dialog.className='debug-report';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','debug-report-title');
  dialog.innerHTML=`<div class="debug-report-card"><p class="kicker">Recognition diagnostics</p><h1 id="debug-report-title" tabindex="-1">Debug capture</h1>
   <p>Record the next five seconds of this game's camera view and movement data. Works during setup, start gestures, pauses and gameplay. No microphone audio is saved.</p>
   <label><input type="checkbox" data-auto-upload><span><b>Send captures to the private debug server</b><br>Uploads video, named body joints and recognition context to this website. The video can show your face or home. Reports expire after 30 days and never appear in the public gallery. Leave off to save only on this device.</span></label>
   <div class="debug-report-voice"><b>Optional voice trigger</b><p>Enable once, then say “debug please” or “我要上传 debug”. Your browser's speech provider may process command audio.</p><button type="button" data-voice></button></div>
   <p class="debug-report-status" role="status"></p><div class="debug-report-actions"><button type="button" data-record>Record 5-second debug</button><button type="button" data-cancel>Continue playing</button></div>
   <div data-preview hidden><h2>Latest local debug capture</h2><video controls playsinline preload="metadata"></video><small></small><div class="debug-report-actions"><a data-download-video>Download debug video</a><a data-download-json>Download diagnostic JSON</a><button type="button" data-upload>Upload this capture privately</button></div><p>The latest three captures stay on this device, separately from game replays.</p></div></div>`;
  container.append(dialog);dialog.querySelector('[data-auto-upload]').checked=uploadEnabled;
  dialog.querySelector('[data-auto-upload]').onchange=event=>{uploadEnabled=event.target.checked;};
  dialog.querySelector('[data-voice]').onclick=startVoice;
  dialog.querySelector('[data-record]').disabled=busy;dialog.querySelector('[data-record]').onclick=()=>record('button');
  dialog.querySelector('[data-cancel]').onclick=close;
  dialog.querySelector('[data-upload]').onclick=async()=>{if(busy||!lastCapture)return;busy=true;try{await upload(lastCapture);}catch(error){setMessage(`${error.message} Local video and JSON remain available.`);}finally{busy=false;renderLatest();}};
  updateControl();setMessage(message);renderLatest();dialog.querySelector('h1').focus();
 }
 async function upload(value){
  value.report.includeVideo=true;setMessage('Uploading private debug capture…');
  uploadController=new AbortController();const signal=uploadController.signal,timeout=setTimeout(()=>uploadController?.abort(),20000);
  try{
  if(!value.posted){
   const response=await fetch('/api/debug-reports',{method:'POST',credentials:'same-origin',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(value.report)});
   const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Diagnostic upload failed.');value.posted=true;
  }
  const response=await fetch(`/api/debug-reports/${value.id}/video`,{method:'PUT',credentials:'same-origin',signal,headers:{'Content-Type':value.clip.blob.type,'X-Debug-Video-Consent':'debug-video-v1'},body:value.clip.blob});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Debug video upload failed.');
  value.uploaded=true;await saveDebugCapture(value).catch(()=>{});setMessage(`Debug uploaded privately. Reference: ${value.id}`);
  }finally{clearTimeout(timeout);uploadController=null;}
 }
 async function record(trigger){
  if(disposed||busy||performance.now()<cooldownUntil)return;
  busy=true;const shouldUpload=uploadEnabled;close();
  try{
   await document.exitFullscreen?.().catch(()=>{});if(disposed)throw Error('This game has closed.');
   notice.hidden=false;const bundle=await capture.start();notice.hidden=true;
   const report=diagnosticPayload({game,bundle,trigger,includeVideo:shouldUpload});
   lastCapture={id:report.id,createdAt:bundle.clip.createdAt,gameId:game.id,clip:bundle.clip,report,posted:false,uploaded:false};
   try{await saveDebugCapture(lastCapture);setMessage(`Debug saved on this device. Reference: ${report.id}`);}
   catch{setMessage('Local storage is unavailable. Download the video and JSON before leaving.');}
   if(shouldUpload)try{await upload(lastCapture);}catch(error){setMessage(`${error.message} Local video and JSON remain available.`);}
  }catch(error){setMessage(error.message||'Debug capture failed.');}
  finally{busy=false;notice.hidden=true;cooldownUntil=performance.now()+1200;if(!disposed)await open();}
 }
 notice.querySelector('button').onclick=()=>capture.cancel();
 const hidden=()=>{if(document.hidden){stopVoice();capture.cancel();}};document.addEventListener('visibilitychange',hidden);
 let hadCamera=false;
 const ended=()=>{const frame=runtime.readFrame(),live=!!frame?.video?.srcObject?.getVideoTracks().some(track=>track.readyState==='live');if(live)hadCamera=true;if(armed&&(frame?.phase==='complete'||hadCamera&&!live)){stopVoice();hadCamera=false;}};
 const unsubscribe=runtime.subscribe(ended),lifecycleTimer=setInterval(ended,250);
 latestDebugCapture(game.id).then(value=>{if(!disposed&&!lastCapture&&value){lastCapture=value;renderLatest();}}).catch(()=>{});
 return {
  connectControls(element){if(controls){stopVoice();capture.cancel();}controls=element;element.querySelector('[data-debug-report]').onclick=open;updateControl();},
  stop(){stopVoice();capture.cancel();uploadController?.abort();},
  dispose(){if(disposed)return;disposed=true;clearInterval(lifecycleTimer);unsubscribe();document.removeEventListener('visibilitychange',hidden);stopVoice();uploadController?.abort();capture.dispose();close();notice.remove();},
 };
}
