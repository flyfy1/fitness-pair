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
 let controls,dialog,recognition,armed=false,listening=false,disposed=false,restartTimer=0,startTimer=0,resultTimer=0,busy=false,uploadEnabled=false,lastCapture=null,urls=[],cooldownUntil=0,uploadController=null,message='Record a five-second video and movement diagnostics, even before the game starts.';
 let voiceLanguage=readLanguage()==='zh'?'zh-CN':'en-US',voiceError=false,voiceMessage='',heard=false;
 const voiceNotice=document.createElement('aside');voiceNotice.className='debug-voice-notice';voiceNotice.hidden=true;
 voiceNotice.innerHTML='<span role="status" aria-label="Voice command status"></span><button type="button" data-voice-record>Record debug now</button><button type="button" data-voice-dismiss>Turn voice off</button>';container.append(voiceNotice);
 const notice=document.createElement('aside');notice.className='debug-capture-notice';notice.hidden=true;notice.innerHTML='<span role="status"></span><button type="button">Cancel debug</button>';container.append(notice);
 const capture=createDebugCapture(game,runtime,{onProgress:remaining=>{notice.querySelector('span').textContent=translateText(`Debug recording · ${remaining}s remaining`);}});
 const focusControl=()=>controls?.querySelector('[data-debug-report]')?.focus();
 const setMessage=text=>{message=text;const status=dialog?.querySelector('.debug-report-status');if(status)status.textContent=translateText(text);};
 const setVoiceMessage=text=>{voiceMessage=text;setMessage(text);updateControl();};
 const failVoice=text=>{stopVoice();voiceError=true;setVoiceMessage(text);};
 function updateControl(){
  const button=controls?.querySelector('[data-debug-report]');
  if(button){button.dataset.voice=voiceError?'error':listening?'on':armed?'starting':'off';button.title=translateText(voiceError?'Debug report · voice unavailable':armed?'Debug report · voice command on':'Debug report');}
  const voice=dialog?.querySelector('[data-voice]');if(voice){voice.textContent=translateText(armed?'Disable voice command':'Enable voice command');voice.setAttribute('aria-pressed',String(armed));}
  voiceNotice.hidden=!!dialog||busy||disposed||(!armed&&!voiceError);
  voiceNotice.querySelector('span').textContent=translateText(voiceMessage);
  voiceNotice.querySelector('[data-voice-dismiss]').textContent=translateText(armed?'Turn voice off':'Dismiss voice status');
  const select=dialog?.querySelector('[data-voice-language]');if(select)select.disabled=armed;
 }
 function revoke(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
 function close(){dialog?.querySelector('video')?.pause();dialog?.remove();dialog=null;revoke();focusControl();updateControl();}
 function stopVoice(){
  armed=false;listening=false;voiceError=false;clearTimeout(restartTimer);clearTimeout(startTimer);clearTimeout(resultTimer);restartTimer=startTimer=resultTimer=0;
  const previous=recognition;recognition=null;
  if(previous){for(const key of ['onresult','onend','onerror','onstart','onaudiostart','onaudioend','onspeechstart','onspeechend','onnomatch'])previous[key]=null;try{if(previous.abort)previous.abort();else previous.stop();}catch{/* Already stopped. */}}
  updateControl();
 }
 function startVoice(){
  if(armed){stopVoice();setMessage('Voice command disabled.');return;}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){failVoice('Voice commands are unavailable in this browser. Use Record 5-second debug instead.');return;}
  let instance;try{instance=new Recognition();}catch{failVoice('Voice command could not start. Use the manual debug button.');return;}
  recognition=instance;armed=true;voiceError=false;
  const current=()=>armed&&recognition===instance&&!disposed&&!document.hidden;
  instance.lang=voiceLanguage;instance.continuous=true;instance.interimResults=true;instance.maxAlternatives=5;
  const begin=()=>{
   if(!current())return;
   listening=false;clearTimeout(startTimer);
   startTimer=setTimeout(()=>{if(current())failVoice('Voice microphone did not start (audio-start-timeout). Use manual debug or open this game in Chrome or Edge.');},8000);
   try{instance.start();updateControl();}catch{failVoice('Voice command could not start. Use the manual debug button.');}
  };
  instance.onstart=()=>{if(current()&&!listening)setVoiceMessage('Voice service started. Waiting for microphone audio…');};
  instance.onaudiostart=()=>{if(!current())return;clearTimeout(startTimer);listening=true;setVoiceMessage('Listening. Say “debug please” to record five seconds.');};
  instance.onaudioend=()=>{if(!current())return;listening=false;updateControl();};
  instance.onspeechstart=()=>{if(!current())return;clearTimeout(resultTimer);heard=false;setVoiceMessage('Speech detected. Waiting for recognized words…');};
  instance.onspeechend=()=>{if(!current()||heard)return;clearTimeout(resultTimer);resultTimer=setTimeout(()=>{if(current()&&!heard)failVoice('Voice service returned no words (result-timeout). Use manual debug or open this game in Chrome or Edge.');},6000);};
  instance.onnomatch=()=>{if(current())setVoiceMessage('Speech was not understood. Say “debug please” again, or use Record debug now.');};
  instance.onresult=event=>{
   if(!current())return;
   clearTimeout(startTimer);clearTimeout(resultTimer);listening=true;heard=true;
   for(let i=event.resultIndex;i<event.results.length;i++){
    const result=event.results[i],words=String(result[0]?.transcript||'').trim().slice(0,100);
    // Recognizers can put the deliberate command in a lower-ranked alternative.
    const match=result.isFinal&&Array.from(result).some(candidate=>isDebugCommand(candidate.transcript));
    if(match){setVoiceMessage('Debug command recognized. Recording five seconds…');void record('voice');return;}
    if(words)setVoiceMessage(result.isFinal?`Heard “${words}”. Say “debug please” again or use Record debug now.`:`Hearing “${words}”…`);
   }
  };
  instance.onerror=event=>{
   if(!current())return;
   if(['not-allowed','service-not-allowed','audio-capture'].includes(event.error))failVoice('Microphone permission was denied or unavailable. Use Record 5-second debug instead.');
   else if(event.error==='no-speech')setVoiceMessage('No speech detected. Check your microphone, then say “debug please” or use Record debug now.');
   else if(event.error==='network')failVoice('Voice service connection failed (network). Use manual debug or open this game in Chrome or Edge.');
   else failVoice(`Voice recognition failed (${String(event.error||'unknown').slice(0,80)}). Use Record debug now.`);
  };
  instance.onend=()=>{
   if(!current())return;listening=false;clearTimeout(startTimer);updateControl();
   restartTimer=setTimeout(begin,800);
  };
  setVoiceMessage('Waiting for microphone permission…');begin();
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
   <div class="debug-report-voice"><b>Optional voice trigger</b><p>Enable once, then say “debug please” or “我要上传 debug”. Your browser's speech provider may process command audio.</p><label><span>Voice command language</span><select data-voice-language aria-label="Voice command language"><option value="en-US">English</option><option value="zh-CN">简体中文</option></select></label><button type="button" data-voice></button></div>
   <p class="debug-report-status" role="status"></p><div class="debug-report-actions"><button type="button" data-record>Record 5-second debug</button><button type="button" data-cancel>Continue playing</button></div>
   <div data-preview hidden><h2>Latest local debug capture</h2><video controls playsinline preload="metadata"></video><small></small><div class="debug-report-actions"><a data-download-video>Download debug video</a><a data-download-json>Download diagnostic JSON</a><button type="button" data-upload>Upload this capture privately</button></div><p>The latest three captures stay on this device, separately from game replays.</p></div></div>`;
  container.append(dialog);dialog.querySelector('[data-auto-upload]').checked=uploadEnabled;
  dialog.querySelector('[data-auto-upload]').onchange=event=>{uploadEnabled=event.target.checked;};
  dialog.querySelector('[data-voice]').onclick=startVoice;
  dialog.querySelector('[data-voice-language]').value=voiceLanguage;
  dialog.querySelector('[data-voice-language]').onchange=event=>{voiceLanguage=event.target.value;};
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
 voiceNotice.querySelector('[data-voice-record]').onclick=()=>record('button');
 voiceNotice.querySelector('[data-voice-dismiss]').onclick=()=>{stopVoice();setMessage('Voice command disabled.');};
 const hidden=()=>{if(document.hidden){stopVoice();capture.cancel();}};document.addEventListener('visibilitychange',hidden);
 let hadCamera=false;
 const ended=()=>{const frame=runtime.readFrame(),live=!!frame?.video?.srcObject?.getVideoTracks().some(track=>track.readyState==='live');if(live)hadCamera=true;if(armed&&(frame?.phase==='complete'||hadCamera&&!live)){stopVoice();hadCamera=false;}};
 const unsubscribe=runtime.subscribe(ended),lifecycleTimer=setInterval(ended,250);
 latestDebugCapture(game.id).then(value=>{if(!disposed&&!lastCapture&&value){lastCapture=value;renderLatest();}}).catch(()=>{});
 return {
  connectControls(element){if(controls){stopVoice();capture.cancel();}controls=element;element.querySelector('[data-debug-report]').onclick=open;updateControl();},
  stop(){stopVoice();capture.cancel();uploadController?.abort();},
  dispose(){if(disposed)return;disposed=true;clearInterval(lifecycleTimer);unsubscribe();document.removeEventListener('visibilitychange',hidden);stopVoice();uploadController?.abort();capture.dispose();close();notice.remove();voiceNotice.remove();},
 };
}
