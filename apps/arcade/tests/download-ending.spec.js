import {test,expect} from '@playwright/test';
import {build} from 'vite';

let helper;
test.beforeAll(async()=>{
 const entry=new URL('./download-ending-fixture.js',import.meta.url).pathname;
 const bundle=await build({configFile:false,logLevel:'error',build:{write:false,lib:{entry,formats:['es']}}});
 helper=bundle[0].output[0].code;
});

for(const [format,portrait,sound] of [['mp4',true,true],['webm',false,true],['mp4',false,false]]){
 test(`${format} ${portrait?'portrait':'landscape'} ${sound?'audio':'silent'} download copies 60 seconds unchanged and appends only the ending`,async({page},info)=>{
  await page.route('**/__download.js',route=>route.fulfill({contentType:'text/javascript',body:helper}));await page.goto('/library');
  const result=await page.evaluate(async({format,portrait,sound})=>{
   const m=await import('/__download.js');
   if(format==='webm'){const supports=MediaRecorder.isTypeSupported.bind(MediaRecorder);MediaRecorder.isTypeSupported=mime=>!mime.includes('mp4')&&supports(mime);}
   const canvas=document.createElement('canvas');canvas.width=portrait?592:1280;canvas.height=portrait?1280:800;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#dd2244';ctx.fillRect(0,0,canvas.width,canvas.height);
   const stream=canvas.captureStream(24);let audio,tone;
   if(sound){audio=new AudioContext();await audio.resume();tone=audio.createOscillator();const dest=audio.createMediaStreamDestination();tone.connect(dest);tone.start();stream.addTrack(dest.stream.getAudioTracks()[0].clone());}
   const timer=setInterval(()=>{ctx.fillStyle='#dd2244';ctx.fillRect(0,0,canvas.width,canvas.height);},40);
   const recorder=m.startRollingRecorder(stream);await new Promise(r=>setTimeout(r,1100));const saved=await recorder.stop();clearInterval(timer);stream.getTracks().forEach(t=>t.stop());tone?.stop();await audio?.close();
   const packets=async blob=>{
    const input=new m.Input({source:new m.BlobSource(blob),formats:m.ALL_FORMATS});
    try{const tracks=[];for(const track of [await input.getPrimaryVideoTrack(),await input.getPrimaryAudioTrack()]){
     if(!track)continue;const list=[];for await(const p of new m.EncodedPacketSink(track).packets())list.push(p);
     tracks.push({codec:await track.getCodec(),config:await track.getDecoderConfig(),packets:list});
    }return tracks;}finally{input.dispose();}
   };
   // A real browser-encoded synthetic segment repeated by remuxing, not a human trial.
   const tracks=await packets(saved.blob),target=new m.BufferTarget(),output=new m.Output({format:format==='mp4'?new m.Mp4OutputFormat():new m.WebMOutputFormat(),target});
   const sources=tracks.map((track,i)=>{const source=i===0?new m.EncodedVideoPacketSource(track.codec):new m.EncodedAudioPacketSource(track.codec);if(i===0)output.addVideoTrack(source);else output.addAudioTrack(source);return source;});await output.start();
   const span=Math.max(...tracks.flatMap(t=>t.packets.map(p=>p.timestamp+p.duration)))+.05;
   const repeats=Math.ceil(60/span);
   for(let i=0;i<tracks.length;i++)for(let n=0;n<repeats;n++)for(const p of tracks[i].packets)await sources[i].add(p.clone({timestamp:Math.round((p.timestamp+n*span)*1e6)/1e6}),{decoderConfig:tracks[i].config});
   await output.finalize();const blob=new Blob([target.buffer],{type:`video/${format}`});
   const before=await packets(blob),originalBytes=await blob.arrayBuffer(),progress=[];
   const clip={id:'synthetic',title:'Motion Quest · test',gameTitle:'Motion Quest',game:'motion-quest',includesAudio:sound,branded:false,blob,duration:span*repeats};
   const cancellations=[];
   for(const stage of ['before','Preparing','Appending']){
    const controller=new AbortController();if(stage==='before')controller.abort();
    try{await m.createDownloadCopy(clip,{signal:controller.signal,onProgress:text=>{if(text.startsWith(stage))controller.abort();}});cancellations.push('not cancelled');}
    catch(error){cancellations.push(error.name);}
   }
   // No gameplay frame may be decoded or played during the fast export.
   const originalPlay=HTMLMediaElement.prototype.play,originalDecoder=window.VideoDecoder;
   HTMLMediaElement.prototype.play=()=>{throw new Error('Export tried to play the original video.');};window.VideoDecoder=class{constructor(){throw new Error('Export tried to decode the original video.');}};
   let exported;const started=performance.now();
   try{exported=await m.createDownloadCopy(clip,{onProgress:text=>progress.push(text)});}
   finally{HTMLMediaElement.prototype.play=originalPlay;window.VideoDecoder=originalDecoder;}
   const elapsed=performance.now()-started,after=await packets(exported.blob);
   const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
   const compressedUnchanged=before.every((track,i)=>track.packets.every((p,j)=>{
    const q=after[i].packets[j];return Math.abs(p.timestamp-q.timestamp)<.002&&Math.abs(p.duration-q.duration)<.002&&equal(p.data,q.data.subarray(q.data.length-p.data.length));
   }));
   const video=document.createElement('video');video.muted=true;video.src=URL.createObjectURL(exported.blob);document.body.append(video);await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('Export is unreadable.'));});
   const sample=async time=>{const done=new Promise(resolve=>video.onseeked=resolve);video.currentTime=time;await done;ctx.drawImage(video,0,0,canvas.width,canvas.height);return [...ctx.getImageData(10,canvas.height-15,1,1).data];};
   const first=await sample(.2),last=await sample(video.duration-.2),back=await sample(.3),boundary=await sample(span*repeats+.1);
   const seeked=new Promise(resolve=>video.onseeked=resolve);video.currentTime=exported.duration-3.2;await seeked;const playbackStart=performance.now();await video.play();await new Promise(resolve=>{video.onended=resolve;});const tailPlaybackMs=performance.now()-playbackStart;
   let energy=0;if(sound){const ac=new AudioContext(),decoded=await ac.decodeAudioData(await exported.blob.arrayBuffer()),values=decoded.getChannelData(0);energy=Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length);await ac.close();}
   const decodedDuration=video.duration;
   let fallbackVerified=null;
   if(format==='mp4'&&!sound){
    const encoder=window.VideoEncoder,notes=[];let fallback;
    try{window.VideoEncoder=undefined;fallback=await m.createDownloadCopy({...clip,blob:saved.blob,duration:saved.duration},{onProgress:text=>notes.push(text)});}
    finally{window.VideoEncoder=encoder;}
    URL.revokeObjectURL(video.src);const loaded=new Promise(resolve=>video.onloadeddata=resolve);video.src=URL.createObjectURL(fallback.blob);await loaded;
    const head=await sample(.2),tail=await sample(video.duration-.2);
    fallbackVerified=notes.some(text=>text.startsWith('Compatibility export'))&&head[1]<100&&tail[0]>200&&tail[1]>200&&tail[2]<100;
   }
   URL.revokeObjectURL(video.src);video.remove();
   return {fallbackVerified,decodedDuration,tailPlaybackMs,cancellations,elapsed,compressedUnchanged,sourceUnchanged:equal(new Uint8Array(originalBytes),new Uint8Array(await blob.arrayBuffer())),extraFrames:after[0].packets.length-before[0].packets.length,audioPackets:after[1]?.packets.length===before[1]?.packets.length,first,last,back,boundary,energy,duration:exported.duration,originalDuration:span*repeats,width:canvas.width,height:canvas.height,progress};
  },{format,portrait,sound});
  console.log(JSON.stringify({format,portrait,sound,elapsedMs:result.elapsed,duration:result.duration}));
  expect(result.cancellations).toEqual(['AbortError','AbortError','AbortError']);expect(result.elapsed).toBeLessThan(8000);expect(result.compressedUnchanged).toBe(true);expect(result.sourceUnchanged).toBe(true);expect(result.extraFrames).toBe(format==='mp4'?1:72);expect(result.decodedDuration).toBeCloseTo(result.duration,1);expect(result.tailPlaybackMs).toBeGreaterThan(2800);expect(result.audioPackets).toBe(true);
  expect(result.duration-result.originalDuration).toBeGreaterThan(2.85);expect(result.duration-result.originalDuration).toBeLessThan(3.05);expect(result.first[1]).toBeLessThan(100);expect(result.back[1]).toBeLessThan(100);
  for(const pixel of [result.last,result.boundary]){expect(pixel[0]).toBeGreaterThan(200);expect(pixel[1]).toBeGreaterThan(200);expect(pixel[2]).toBeLessThan(100);}
  if(sound)expect(result.energy).toBeGreaterThan(.01);if(format==='mp4'&&!sound)expect(result.fallbackVerified).toBe(true);
  await info.attach('synthetic-download-evidence',{body:JSON.stringify(result),contentType:'application/json'});
 });
}
