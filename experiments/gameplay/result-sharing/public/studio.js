const $=id=>document.getElementById(id);
let chosen=null, source='replay', objectUrl=null, xhr=null, generating=false, cancelDemo=null, publicUrl='';
const status=message=>{$('status').textContent=message;};
function releasePreview() { if(objectUrl) URL.revokeObjectURL(objectUrl); objectUrl=null; }
function select(blob,kind) {
  releasePreview(); chosen=blob; source=kind; $('consent').checked=false;
  objectUrl=URL.createObjectURL(blob); $('preview').src=objectUrl; $('preview').hidden=false; $('placeholder').hidden=true;
  $('preview-label').textContent=kind==='synthetic'?'SYNTHETIC DEMO · NO CAMERA':'LOCAL PREVIEW · NOT YET UPLOADED';
  $('publish').disabled=false; status('Review the clip, then choose whether to publish it.');
}
$('file').addEventListener('change',()=>{
  const file=$('file').files[0]; if(!file)return;
  if(file.size>20*1024*1024 || !['video/mp4','video/webm'].includes(file.type)) {
    chosen=null; releasePreview(); $('preview').removeAttribute('src'); $('preview').hidden=true; $('placeholder').hidden=false; $('publish').disabled=true;
    status('Choose an MP4 or WebM file no larger than 20 MiB.'); return;
  }
  select(file,'replay'); if(!$('title').value)$('title').value='My game highlight';
});
$('preview').addEventListener('error',()=>{chosen=null;$('publish').disabled=true;status('This browser cannot play that clip. Try H.264 MP4 or VP8 WebM.');});
$('preview').addEventListener('loadedmetadata',()=>{
  const duration=$('preview').duration;
  if(Number.isFinite(duration)&&duration>60){chosen=null;$('publish').disabled=true;status('Trim this clip to 60 seconds or less before sharing.');}
});
$('demo').addEventListener('click',async()=>{
  if(generating)return;
  if(!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream){status('Demo recording is unavailable here. Choose a local MP4 or WebM instead.');return;}
  generating=true; $('fields').disabled=true; status('Making an 8-second synthetic highlight locally. No camera or microphone is used.');
  let stream, recorder, frame=0, watchdog;
  const chunks=[];
  try {
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
    const ctx=canvas.getContext('2d'); let start=performance.now();
    const draw=time=>{
      const t=(time-start)/1000, rep=Math.min(5,Math.floor(t/.95));
      ctx.fillStyle='#172c2a';ctx.fillRect(0,0,960,540);
      ctx.strokeStyle='#435c48';ctx.lineWidth=1;
      for(let i=0;i<8;i++){ctx.beginPath();ctx.arc(690,230,90+i*30,0,Math.PI*2);ctx.stroke();}
      ctx.fillStyle='#d0f485';ctx.font='bold 20px Arial';ctx.fillText('FITNESS PAIR / SYNTHETIC DEMO',52,58);
      ctx.fillStyle='#f3f8e6';ctx.font='bold 63px Arial';ctx.fillText(rep===5?'FINAL HIT.':'BUILDING UP.',52,157);
      ctx.font='bold 145px Arial';ctx.fillText(`${rep} / 5`,52,315);
      ctx.fillStyle='#c8f572';ctx.fillRect(52,365,Math.max(2,rep/5*856),12);
      const bounce=Math.sin(t*7)*18;ctx.fillStyle='#c8f572';ctx.beginPath();ctx.arc(720,245+bounce,55,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#172c2a';ctx.font='bold 50px Arial';ctx.fillText(rep===5?'↗':'✳',699,263+bounce);
      ctx.fillStyle='#d7e5ca';ctx.font='22px Arial';ctx.fillText(rep===5?'Five simulated actions. One good moment.':'A preview of the sharing experience.',52,445);
      ctx.font='15px Arial';ctx.fillText('ANIMATION ONLY · NOT A CAMERA RECORDING OR VERIFIED EXERCISE',52,500);
      if(t<8)frame=requestAnimationFrame(draw); else if(recorder?.state==='recording')recorder.stop();
    };
    draw(start); stream=canvas.captureStream(24);
    const mime=['video/webm;codecs=vp8','video/mp4;codecs=avc1.42E01E','video/webm','video/mp4'].find(v=>MediaRecorder.isTypeSupported(v));
    if(!mime)throw new Error('No supported recording format. Choose a video file instead.');
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1_200_000});
    let cancelled=false;
    await new Promise((resolve,reject)=>{
      cancelDemo=()=>{cancelled=true;if(recorder.state==='recording')recorder.stop();};
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=()=>reject(new Error('Demo recording failed. Please choose a video file.'));recorder.onstop=resolve;
      recorder.start(250);watchdog=setTimeout(()=>{cancelled=true; if(recorder.state==='recording')recorder.stop();},12000);
    });
    if(cancelled){status('Demo cancelled. Nothing was uploaded.');return;}
    select(new Blob(chunks,{type:mime.split(';')[0]}),'synthetic');$('title').value='Five hits. One good moment.';
  }catch(error){status(error.message);}
  finally{cancelAnimationFrame(frame);clearTimeout(watchdog);if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());generating=false;cancelDemo=null;$('fields').disabled=false;}
});
$('publish-form').addEventListener('submit',event=>{
  event.preventDefault();if(!chosen||xhr)return;
  $('fields').disabled=true;$('cancel').hidden=false;status('Uploading your approved clip…');
  xhr=new XMLHttpRequest();xhr.open('POST',`/api/clips?${new URLSearchParams({title:$('title').value.trim(),source})}`);xhr.timeout=90000;
  xhr.setRequestHeader('Content-Type',chosen.type.split(';')[0]);xhr.setRequestHeader('Authorization',`Bearer ${$('code').value}`);xhr.setRequestHeader('X-Sharing-Consent','public-v1');
  xhr.upload.onprogress=e=>{if(e.lengthComputable)status(e.loaded===e.total?'Upload complete. Checking video and creating its preview…':`Uploading… ${Math.round(e.loaded/e.total*100)}%`);};
  xhr.onload=()=>{
    let result;try{result=JSON.parse(xhr.responseText);}catch{status('The server returned an unreadable response. Please retry.');return;}
    if(xhr.status!==201){status(result.error||'Upload failed. Please retry.');return;}
    publicUrl=result.url;$('share-url').value=publicUrl;$('view').href=publicUrl;$('manage').href=`${publicUrl}#manage=${result.manageToken}`;
    $('result').hidden=false;$('result').focus();$('result').scrollIntoView({behavior:'smooth',block:'start'});status('Published. Your clip is available for 7 days.');$('consent').checked=false;
  };
  xhr.onerror=()=>status('Upload connection failed. Check your connection before retrying.');
  xhr.ontimeout=()=>status('Upload timed out. If it reached processing, it may have published; any inaccessible clip expires in 7 days.');
  xhr.onabort=()=>status('Upload cancelled. If processing had already started, a clip may still publish and expire in 7 days.');
  xhr.onloadend=()=>{xhr=null;$('fields').disabled=false;$('cancel').hidden=true;};xhr.send(chosen);
});
$('cancel').onclick=()=>xhr?.abort();
async function copy(){try{await navigator.clipboard.writeText(publicUrl);$('share-status').textContent='Public link copied.';}catch{$('share-url').select();$('share-status').textContent='Select and copy the link above.';}}
$('copy').onclick=copy;$('share').onclick=async()=>{if(!navigator.share)return copy();try{await navigator.share({title:$('title').value,url:publicUrl});}catch(e){if(e.name!=='AbortError')await copy();}};
function stop(){cancelDemo?.();xhr?.abort();$('preview').pause();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelDemo?.();});
window.addEventListener('pagehide',()=>{stop();releasePreview();});
