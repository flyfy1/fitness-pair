import {Input,ALL_FORMATS,BlobSource,EncodedPacket,EncodedPacketSink,VideoSample,VideoSampleSink,VideoSampleSource,canEncodeVideo,Output,BufferTarget,Mp4OutputFormat,WebMOutputFormat,EncodedVideoPacketSource,EncodedAudioPacketSource} from 'mediabunny';
import {loadRecordingLogo,drawClipEnding} from './clip-compositor.js';
import {createShareCopy} from './share-copy.js';
import {MAX_BYTES} from './local-clips.js';

const ENDING_SECONDS=3;
class CompatibilityError extends Error {}

function abortable(promise,signal){
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
  promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}

// A single AVC encoder keeps gameplay and the invitation under one avc1
// configuration. Independently encoded SPS/PPS required avc3, which macOS
// native players rejected. Frames are processed locally without timed playback.
async function encodeMp4Download(clip,input,video,audio,canvas,config,{signal,onProgress}){
 const codec=config.codec.replace(/^avc3/,'avc1'),bitrate=2200000;
 const options={codec:'avc',bitrate,fullCodecString:codec,latencyMode:'realtime'};
 if(typeof VideoEncoder==='undefined'||typeof VideoDecoder==='undefined'||
    !await abortable(video.canDecode(),signal)||
    !await abortable(canEncodeVideo('avc',{...options,width:canvas.width,height:canvas.height}),signal)){
  throw new CompatibilityError('Compatible MP4 encoding is unavailable.');
 }
 let total=0,count=0,end=0,budgetError;
 // Encoder output callbacks run asynchronously; report overflow in the awaited
 // export flow instead of throwing an uncaught exception from that callback.
 const account=packet=>{total+=packet.data.byteLength;if(total>MAX_BYTES)budgetError??=new Error('The download exceeds the device file limit.');};
 const check=()=>{signal.throwIfAborted();if(budgetError)throw budgetError;};
 const target=new BufferTarget(),output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
 const source=new VideoSampleSource({...options,keyFrameInterval:1,onEncodedPacket:account});output.addVideoTrack(source);
 const audioSource=audio?new EncodedAudioPacketSource('aac'):null;if(audioSource)output.addAudioTrack(audioSource);
 const origin=await input.getFirstTimestamp([video,audio].filter(Boolean));
 const samples=new VideoSampleSink(video).samples();
 try{
  await output.start();
  onProgress('Encoding a compatible MP4…');signal.throwIfAborted();
  while(true){
   const {value:sample,done}=await abortable(samples.next().then(result=>{
    if(signal.aborted){result.value?.close();throw signal.reason;}return result;
   }),signal);if(done)break;
   try{
    check();sample.setTimestamp(sample.timestamp-origin);
    end=Math.max(end,sample.timestamp+sample.duration);
    await abortable(source.add(sample),signal);
    check();
   }finally{sample.close();}
   if(++count%24===0){onProgress(`Encoding a compatible MP4 · ${Math.floor(end)} seconds`);await new Promise(resolve=>setTimeout(resolve,0));}
  }
  if(!count||end<=0)throw new Error('The replay contains no video.');
  if(audio){
   const metadata={decoderConfig:await audio.getDecoderConfig()};
   for await(const packet of new EncodedPacketSink(audio).packets()){
    account(packet);check();
    await abortable(audioSource.add(packet.clone({timestamp:packet.timestamp-origin}),metadata),signal);
    end=Math.max(end,packet.timestamp-origin+packet.duration);
   }
  }
  onProgress('Appending the 3-second Hopmodo ending…');signal.throwIfAborted();
  const ending=new VideoSample(canvas,{timestamp:end,duration:ENDING_SECONDS});
  try{await abortable(source.add(ending,{keyFrame:true}),signal);}finally{ending.close();}
  await abortable(output.finalize(),signal);check();
  return {...clip,id:crypto.randomUUID(),parentId:clip.id,blob:new Blob([target.buffer],{type:'video/mp4'}),duration:end+ENDING_SECONDS,hasEnding:true,endingSeconds:ENDING_SECONDS,branded:true};
 }catch(error){await output.cancel();throw error;}finally{await samples.return();}
}

async function encodeEnding(canvas,config,signal){
 if(typeof VideoEncoder==='undefined')throw new CompatibilityError('Fast encoding is unavailable.');
 const settings={codec:config.codec,width:canvas.width,height:canvas.height,bitrate:1500000,framerate:24,latencyMode:'realtime'};
 if(!(await abortable(VideoEncoder.isConfigSupported(settings),signal)).supported)throw new CompatibilityError('The replay codec cannot encode an ending.');
 let encoder,frame,endingConfig,failure;const packets=[];
 // WebM needs timed frames to keep the final picture playing for three seconds.
 const count=72;
 try{
  encoder=new VideoEncoder({error:error=>{failure=error;},output:(chunk,metadata)=>{
   if(metadata.decoderConfig)endingConfig=metadata.decoderConfig;
   packets.push(EncodedPacket.fromEncodedChunk(chunk).clone({duration:ENDING_SECONDS/count}));
  }});
  encoder.configure(settings);
  for(let i=0;i<count;i++){
   signal.throwIfAborted();frame=new VideoFrame(canvas,{timestamp:Math.round(i*ENDING_SECONDS*1e6/count),duration:Math.round(ENDING_SECONDS*1e6/count)});
   encoder.encode(frame,{keyFrame:i===0});frame.close();frame=null;
   if(encoder.encodeQueueSize>=8)await abortable(encoder.flush(),signal);
  }
  await abortable(encoder.flush(),signal);
  if(failure)throw failure;
  if(!endingConfig||!packets.length||packets[0].type!=='key')throw new CompatibilityError('The ending encoder returned no keyframe.');
  return {packets,config:endingConfig};
 }finally{frame?.close();if(encoder&&encoder.state!=='closed')encoder.close();}
}

async function appendEnding(clip,{signal,onProgress}){
 const input=new Input({source:new BlobSource(clip.blob),formats:ALL_FORMATS});let output;
 try{
  const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack();signal.throwIfAborted();
  if(!video)throw new CompatibilityError('No video track.');
  const codec=await video.getCodec(),audioCodec=await audio?.getCodec(),config=await video.getDecoderConfig();
  if(!['avc','vp8','vp9'].includes(codec)||await video.getRotation()!==0||!config)throw new CompatibilityError('This replay needs compatible export.');
  if(codec==='avc'&&audioCodec&&audioCodec!=='aac')throw new CompatibilityError('Unsupported MP4 audio.');
  if(codec!=='avc'&&audioCodec&&!['opus','vorbis'].includes(audioCodec))throw new CompatibilityError('Unsupported WebM audio.');
  const width=await video.getDisplayWidth(),height=await video.getDisplayHeight();
  if(width!==config.codedWidth||height!==config.codedHeight)throw new CompatibilityError('This replay uses transformed pixels.');
  onProgress('Preparing the 3-second Hopmodo ending…');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const logo=await abortable(loadRecordingLogo(),signal);
  drawClipEnding(canvas.getContext('2d'),clip.gameTitle||clip.title.split(' · ')[0],clip.finalScore||'Replay highlights',logo,clip.includesCamera,'Replay highlights');
  if(codec==='avc')return await encodeMp4Download(clip,input,video,audio,canvas,config,{signal,onProgress});
  const ending=await encodeEnding(canvas,config,signal);signal.throwIfAborted();
  const target=new BufferTarget();output=new Output({format:new WebMOutputFormat(),target});
  const videoSource=new EncodedVideoPacketSource(codec);output.addVideoTrack(videoSource);
  const audioSource=audio?new EncodedAudioPacketSource(audioCodec):null;if(audioSource)output.addAudioTrack(audioSource);
  await output.start();
  const origin=await input.getFirstTimestamp([video,audio].filter(Boolean));let end=0,total=0,count=0;
  onProgress('Appending the ending · keeping the original video and sound…');
  for(const [track,source] of [[video,videoSource],[audio,audioSource]]){
   if(!track)continue;
   const metadata={decoderConfig:await track.getDecoderConfig()};
   for await(const packet of new EncodedPacketSink(track).packets()){
    signal.throwIfAborted();
    total+=packet.data.byteLength;if(total>MAX_BYTES)throw new Error('The download exceeds the device file limit.');
    await source.add(packet.clone({timestamp:packet.timestamp-origin}),metadata);
    end=Math.max(end,packet.timestamp-origin+packet.duration);
    // Let cancellation and page lifecycle events run even with cached packets.
    if(++count%120===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
  if(end<=0)throw new Error('The replay contains no video.');
  signal.throwIfAborted();
  for(const packet of ending.packets){
   signal.throwIfAborted();
   await videoSource.add(packet.clone({timestamp:end+packet.timestamp}),{decoderConfig:config});
  }
  await output.finalize();signal.throwIfAborted();
  return {...clip,id:crypto.randomUUID(),parentId:clip.id,blob:new Blob([target.buffer],{type:'video/webm'}),duration:end+ENDING_SECONDS,hasEnding:true,endingSeconds:ENDING_SECONDS,branded:true};
 }catch(error){await output?.cancel();throw error;}finally{input.dispose();}
}

export async function createDownloadCopy(clip,{signal,onProgress=()=>{}}={}){
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason||new DOMException('Download cancelled.','AbortError'));
 const visibility=()=>{if(document.hidden)controller.abort(new Error('Keep this tab visible while preparing your download.'));};
 signal?.addEventListener('abort',abort,{once:true});window.addEventListener('pagehide',abort);document.addEventListener('visibilitychange',visibility);
 const deadline=setTimeout(()=>controller.abort(new Error('Preparing the download took too long. Please retry.')),120000);
 try{
  if(signal?.aborted)abort();visibility();controller.signal.throwIfAborted();
  try{return await appendEnding(clip,{signal:controller.signal,onProgress});}
  catch(error){
   controller.signal.throwIfAborted();if(!(error instanceof CompatibilityError))throw error;
   clearTimeout(deadline);
   // Legacy/device fallback still appends only the ending, never a footer.
   return await createShareCopy(clip,{fullLength:true,brandedDownload:true,signal:controller.signal,onProgress:text=>onProgress(`Compatibility export (takes the replay length) · ${text}`)});
  }
 }finally{clearTimeout(deadline);signal?.removeEventListener('abort',abort);window.removeEventListener('pagehide',abort);document.removeEventListener('visibilitychange',visibility);}
}
