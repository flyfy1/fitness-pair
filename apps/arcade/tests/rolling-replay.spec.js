import {test,expect} from '@playwright/test';
import {build} from 'vite';

let helper;
test.beforeAll(async()=>{
 const bundle=await build({configFile:false,logLevel:'error',build:{write:false,lib:{entry:new URL('../src/gameplay/rolling-media.js',import.meta.url).pathname,formats:['es']}}});
 helper=bundle[0].output[0].code;
});
async function prepare(page){
 await page.route('**/__rolling.js',route=>route.fulfill({contentType:'text/javascript',body:helper}));
 await page.goto('/library');
}

for(const webm of [false,true])test(`rolling ${webm?'WebM fallback':'MP4'} drops old frames and keeps synchronized audible tracks`,async({page},info)=>{
 await prepare(page);
 const result=await page.evaluate(async webm=>{
  if(webm){const supports=MediaRecorder.isTypeSupported.bind(MediaRecorder);MediaRecorder.isTypeSupported=mime=>!mime.includes('mp4')&&supports(mime);}
  const {startRollingRecorder}=await import('/__rolling.js');
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d');
  const audio=new AudioContext();await audio.resume();const tone=audio.createOscillator(),destination=audio.createMediaStreamDestination();tone.connect(destination);tone.start();
  const stream=canvas.captureStream(24);stream.addTrack(destination.stream.getAudioTracks()[0].clone());
  const start=performance.now();
  const draw=()=>{const seconds=(performance.now()-start)/1000;ctx.fillStyle=seconds<4?'red':seconds<8?'green':'blue';ctx.fillRect(0,0,320,240);ctx.fillStyle='white';ctx.fillText(String(seconds),20,20);};draw();const timer=setInterval(draw,40);
  const failures=[];const recorder=startRollingRecorder(stream,{maxSeconds:6,segmentSeconds:1,onError:e=>failures.push(e.message)});
  const voice=startRollingRecorder(destination.stream,{audioOnly:true,maxSeconds:6,segmentSeconds:1,onError:e=>failures.push(e.message)});
  await new Promise(resolve=>setTimeout(resolve,11200));
  const retained=recorder.segmentCount;const [saved,spoken]=await Promise.all([recorder.stop(),voice.stop()]);clearInterval(timer);
  const sourceLive=stream.getTracks().every(track=>track.readyState==='live');stream.getTracks().forEach(track=>track.stop());tone.stop();await audio.close();
  const video=document.createElement('video');video.muted=true;video.src=URL.createObjectURL(saved.blob);document.body.append(video);
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});
  const sample=async time=>{video.currentTime=time;await new Promise(resolve=>video.onseeked=resolve);ctx.drawImage(video,0,0);return [...ctx.getImageData(100,100,1,1).data];};
  const first=await sample(.2),last=await sample(video.duration-.15);
  const context=new AudioContext();const energies=[];
  for(const blob of [saved.blob,spoken.blob]){const buffer=await context.decodeAudioData(await blob.arrayBuffer());const values=buffer.getChannelData(0);energies.push(Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length));}
  await context.close();URL.revokeObjectURL(video.src);
  return {failures,retained,sourceLive,metadata:saved.duration,decoded:video.duration,start:saved.startSeconds,voiceStart:spoken.startSeconds,first,last,energies,type:saved.blob.type,remaining:recorder.segmentCount};
 },webm);
 expect(result.failures).toEqual([]);expect(result.retained).toBeLessThanOrEqual(8);expect(result.sourceLive).toBe(true);expect(result.remaining).toBe(0);
 expect(result.metadata).toBeGreaterThan(4.8);expect(result.metadata).toBeLessThanOrEqual(6);
 expect(result.decoded).toBeGreaterThan(4.8);expect(result.decoded).toBeLessThanOrEqual(6.05);
 expect(result.start).toBeGreaterThan(5.1);expect(Math.abs(result.voiceStart-result.start)).toBeLessThan(1.1);
 expect(result.first[1]).toBeGreaterThan(80);expect(result.first[0]).toBeLessThan(30);expect(result.last[2]).toBeGreaterThan(200);
 expect(result.energies.every(value=>value>.01)).toBe(true);expect(result.type).toBe(webm?'video/webm':'video/mp4');
 await info.attach('synthetic-rolling-media',{body:JSON.stringify(result),contentType:'application/json'});
});

test('a 96-second recording retains only the latest 90 seconds at original speed',async({page},info)=>{
 test.setTimeout(120000);await prepare(page);
 const result=await page.evaluate(async()=>{
  const {startRollingRecorder}=await import('/__rolling.js');
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;const ctx=canvas.getContext('2d');
  const start=performance.now();const draw=()=>{const t=(performance.now()-start)/1000;ctx.fillStyle=t<6?'red':t<94?'green':'blue';ctx.fillRect(0,0,160,120);ctx.fillStyle='white';ctx.fillText(String(t),4,12);};draw();const timer=setInterval(draw,40);
  const stream=canvas.captureStream(24),recorder=startRollingRecorder(stream);
  await new Promise(resolve=>setTimeout(resolve,96500));
  const segments=recorder.segmentCount;const saved=await recorder.stop();clearInterval(timer);stream.getTracks().forEach(track=>track.stop());
  const video=document.createElement('video');video.muted=true;video.src=URL.createObjectURL(saved.blob);
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});
  const sample=async time=>{video.currentTime=time;await new Promise(resolve=>video.onseeked=resolve);ctx.drawImage(video,0,0);return [...ctx.getImageData(80,80,1,1).data];};
  const first=await sample(.2),last=await sample(video.duration-.1);URL.revokeObjectURL(video.src);
  return {segments,duration:saved.duration,decoded:video.duration,start:saved.startSeconds,first,last};
 });
 expect(result.segments).toBeLessThanOrEqual(19);expect(result.duration).toBeGreaterThan(88.5);expect(result.duration).toBeLessThanOrEqual(90);
 expect(result.decoded).toBeGreaterThan(88.5);expect(result.decoded).toBeLessThanOrEqual(90.05);expect(result.start).toBeGreaterThan(6.4);
 expect(result.first[1]).toBeGreaterThan(80);expect(result.first[0]).toBeLessThan(30);expect(result.last[2]).toBeGreaterThan(200);
 await info.attach('synthetic-96-second-recording',{body:JSON.stringify(result),contentType:'application/json'});
});
