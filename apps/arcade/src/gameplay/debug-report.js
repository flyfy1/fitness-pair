const DATA_CONSENT='debug-data-v1';
const VIDEO_CONSENT='debug-video-v1';
const command=text=>text.toLocaleLowerCase().replace(/[\s，。,.!！?？_-]+/g,'');
export const isDebugCommand=text=>{
 const value=command(text||'');
 return value.includes('我要上传debug')||value.includes('我要上传调试')||value.includes('uploaddebug');
};

function diagnosticPayload({id,game,clip,snapshot,trigger,includeVideo}){
 const source=snapshot?.source||clip.inputSource||null;
 return {
  version:1,id,consent:DATA_CONSENT,trigger,includeVideo,requestedAt:Date.now(),
  gameId:game.id,sourcePage:`/play/${game.id}`,sessionId:clip.sessionId,
  gameState:{phase:snapshot?.phase||null,score:snapshot?.score||clip.finalScore||null,
   round:typeof snapshot?.round==='string'?snapshot.round:null,source:source?{kind:source.kind,id:source.id}:null},
  clip:{id:clip.id,sessionId:clip.sessionId,createdAt:clip.createdAt,duration:clip.duration,
   width:clip.width,height:clip.height,bytes:clip.blob.size,mime:clip.blob.type,
   source:clip.source,inputSource:clip.inputSource||null,stopReason:clip.stopReason||null,
   finalScore:clip.finalScore||null},
  tracking:clip.tracking||null,
  client:{locale:navigator.language||null,viewport:{width:innerWidth,height:innerHeight},devicePixelRatio:devicePixelRatio||1},
 };
}

export function mountDebugReport(game,runtime,recorder,{container}){
 let controls=null,dialog=null,recognition=null,armed=false,disposed=false,restartTimer=0;
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 const focusControl=()=>controls?.querySelector('[data-debug-report]')?.focus();
 function updateControl(){
  const button=controls?.querySelector('[data-debug-report]');if(!button)return;
  button.dataset.voice=armed?'on':'off';button.title=armed?'Debug report · voice command on':'Debug report';
 }
 function close(){dialog?.remove();dialog=null;focusControl();}
 function stopVoice(){
  armed=false;clearTimeout(restartTimer);restartTimer=0;
  try{recognition?.stop();}catch{/* Already stopped. */}
  updateControl();
 }
 function startVoice(status){
  if(!Recognition){status.textContent='Voice commands are unavailable in this browser. You can still use Upload debug.';return false;}
  if(armed){stopVoice();status.textContent='Voice command disabled.';return false;}
  recognition??=new Recognition();recognition.lang='zh-CN';recognition.continuous=true;recognition.interimResults=false;
  recognition.onresult=event=>{
   for(let i=event.resultIndex;i<event.results.length;i++)if(event.results[i].isFinal&&isDebugCommand(event.results[i][0].transcript)){void open('voice');break;}
  };
  recognition.onerror=event=>{
   if(['not-allowed','service-not-allowed','audio-capture'].includes(event.error)){armed=false;updateControl();}
   const live=dialog?.querySelector('.debug-report-status');if(live)live.textContent=event.error==='not-allowed'?'Microphone permission was denied. Use the Debug button instead.':'Voice command paused. Use the Debug button or enable it again.';
  };
  recognition.onend=()=>{
   if(armed&&!disposed&&!document.hidden)restartTimer=setTimeout(()=>{try{recognition.start();}catch{/* A browser restart can race with onend. */}},400);
  };
  try{recognition.start();armed=true;updateControl();status.textContent='Listening. Continue playing and say “我要上传 debug” when recognition fails.';return true;}
  catch{status.textContent='Voice command could not start. Use the Debug button instead.';return false;}
 }
 async function open(trigger='button'){
  if(disposed)return;
  await document.exitFullscreen?.().catch(()=>{});
  if(dialog){dialog.querySelector('h1')?.focus();return;}
  const id=crypto.randomUUID();let bundle=null,posted=false,includeVideo=null;
  dialog=document.createElement('section');dialog.className='debug-report';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','debug-report-title');
  dialog.innerHTML=`<div class="debug-report-card"><p class="kicker">Recognition diagnostics</p><h1 id="debug-report-title" tabindex="-1">Upload debug?</h1>
   <p>Only after you confirm, Hopmodo will upload the latest recorded movement data for this game. It includes session timing, named body-joint coordinates, recognition context and browser details.</p>
   <ul><li>Movement data covers at most the latest 90 seconds.</li><li>No video is uploaded unless you select it below.</li><li>The private report expires after 30 days and is never posted to the public gallery.</li></ul>
   <label><input type="checkbox" data-video><span><b>Include gameplay video</b><br>The camera view may show your face, home and other people. Leave this off to upload data only.</span></label>
   <div class="debug-report-voice"><b>Optional voice trigger</b><p>Enable once, then say <span lang="zh-CN">“我要上传 debug”</span>. Your browser's speech service may process microphone audio; Hopmodo does not store that command audio.</p><button type="button" data-voice></button></div>
   <p class="debug-report-status" role="status"></p><div class="debug-report-actions"><button type="button" data-upload>Upload debug</button><button type="button" data-cancel>Continue playing</button></div></div>`;
  container.append(dialog);
  const status=dialog.querySelector('[role=status]'),upload=dialog.querySelector('[data-upload]'),cancel=dialog.querySelector('[data-cancel]'),voice=dialog.querySelector('[data-voice]');
  const updateVoice=()=>{voice.textContent=armed?'Disable voice command':'Enable voice command';voice.setAttribute('aria-pressed',String(armed));};updateVoice();
  voice.onclick=()=>{startVoice(status);updateVoice();};cancel.onclick=close;
  upload.onclick=async()=>{
   upload.disabled=true;voice.disabled=true;cancel.disabled=true;status.textContent='Preparing the latest diagnostic recording on this device…';
   try{
    bundle??=await recorder.captureDebug();
    includeVideo??=dialog.querySelector('[data-video]').checked;dialog.querySelector('[data-video]').disabled=true;
    if(!posted){
     status.textContent='Uploading diagnostic data…';
     const response=await fetch('/api/debug-reports',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(diagnosticPayload({id,game,clip:bundle.clip,snapshot:bundle.snapshot,trigger,includeVideo}))});
     const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Diagnostic data could not be uploaded.');posted=true;
    }
    if(includeVideo){
     status.textContent='Diagnostic data saved. Uploading the selected video…';
     const response=await fetch(`/api/debug-reports/${id}/video`,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':bundle.clip.blob.type,'X-Debug-Video-Consent':VIDEO_CONSENT},body:bundle.clip.blob});
     const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(`Diagnostic data ${id} was saved, but the video failed: ${data.error||'retry the upload.'}`);
    }
    status.textContent=`Debug uploaded. Reference: ${id}`;upload.hidden=true;voice.disabled=false;cancel.disabled=false;cancel.textContent='Done';cancel.focus();
   }catch(error){status.textContent=error.message||'Debug upload failed. Nothing was shared publicly.';upload.disabled=false;voice.disabled=false;cancel.disabled=false;upload.textContent=posted?'Retry video upload':'Retry upload';upload.focus();}
  };
  dialog.querySelector('h1').focus();
 }
 const visibility=()=>{if(!armed)return;if(document.hidden){try{recognition?.stop();}catch{/* Already stopped. */}}else try{recognition?.start();}catch{/* The previous speech session may still be ending. */}};
 document.addEventListener('visibilitychange',visibility);
 return {
  connectControls(element){controls=element;const button=element.querySelector('[data-debug-report]');button.onclick=()=>open('button');updateControl();},
  dispose(){if(disposed)return;disposed=true;document.removeEventListener('visibilitychange',visibility);stopVoice();close();},
 };
}
