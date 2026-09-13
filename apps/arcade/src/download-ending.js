import {Input,ALL_FORMATS,BlobSource,EncodedPacket,EncodedPacketSink,Output,BufferTarget,Mp4OutputFormat,WebMOutputFormat,EncodedVideoPacketSource,EncodedAudioPacketSource} from 'mediabunny';
import {loadRecordingLogo,drawClipEnding} from './clip-compositor.js';
import {createShareCopy} from './share-copy.js';
import {MAX_BYTES} from './local-clips.js';

const ENDING_SECONDS=3;
class CompatibilityError extends Error {}
const bytes=value=>ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):new Uint8Array(value);

// AVC3 permits in-band parameter sets. Each keyframe carries its own SPS/PPS,
// so an independently encoded ending and seeks back into gameplay decode safely.
// Picture NAL units are copied unchanged; this is remuxing, not video encoding.
export function avcPacketAdapter(config){
 const description=bytes(config.description);
 if(description.length<7||description[0]!==1)throw new CompatibilityError('Unsupported AVC configuration.');
 const lengthSize=(description[4]&3)+1,parameters=[];let offset=6;
 const readGroup=count=>{for(let i=0;i<count;i++){
  if(offset+2>description.length)throw new CompatibilityError('Incomplete AVC configuration.');
  const length=description[offset]*256+description[offset+1];offset+=2;
  if(!length||offset+length>description.length)throw new CompatibilityError('Incomplete AVC parameter set.');
  parameters.push(description.subarray(offset,offset+length));offset+=length;
 }};
 readGroup(description[5]&31);
 if(offset>=description.length)throw new CompatibilityError('Missing AVC picture parameters.');
 readGroup(description[offset++]);
 if(offset+4<=description.length){offset+=3;readGroup(description[offset++]);}
 const normalized=description.slice();normalized[4]=(normalized[4]&252)|3;
 return {
  config:{...config,codec:config.codec.replace(/^avc1/,'avc3'),description:normalized},
  packet(packet){
   const units=packet.type==='key'?[...parameters]:[];let position=0;
   while(position<packet.data.length){
    if(position+lengthSize>packet.data.length)throw new CompatibilityError('Incomplete AVC packet.');
    let length=0;for(let i=0;i<lengthSize;i++)length=length*256+packet.data[position++];
    if(!length||position+length>packet.data.length)throw new CompatibilityError('Invalid AVC packet.');
    units.push(packet.data.subarray(position,position+length));position+=length;
   }
   const data=new Uint8Array(units.reduce((sum,unit)=>sum+4+unit.length,0));const view=new DataView(data.buffer);position=0;
   for(const unit of units){view.setUint32(position,unit.length);position+=4;data.set(unit,position);position+=unit.length;}
   return packet.clone({data});
  },
 };
}

function abortable(promise,signal){
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
  promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}

async function encodeEnding(canvas,config,signal){
 if(typeof VideoEncoder==='undefined')throw new CompatibilityError('Fast encoding is unavailable.');
 const settings={codec:config.codec.replace(/^avc3/,'avc1'),width:canvas.width,height:canvas.height,bitrate:1500000,framerate:24,latencyMode:'realtime',...(config.codec.startsWith('avc')?{avc:{format:'avc'}}:{})};
 if(!(await abortable(VideoEncoder.isConfigSupported(settings),signal)).supported)throw new CompatibilityError('The replay codec cannot encode an ending.');
 let encoder,frame,endingConfig,failure;const packets=[];
 // MP4 holds a still sample for its duration; WebM needs timed frames to keep
 // the final picture playing for three seconds across native media players.
 const count=config.codec.startsWith('avc')?1:72;
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
  const ending=await encodeEnding(canvas,config,signal);signal.throwIfAborted();
  const originalAdapter=codec==='avc'?avcPacketAdapter(config):null,endingAdapter=codec==='avc'?avcPacketAdapter(ending.config):null;
  const target=new BufferTarget();output=new Output({format:codec==='avc'?new Mp4OutputFormat():new WebMOutputFormat(),target});
  const videoSource=new EncodedVideoPacketSource(codec);output.addVideoTrack(videoSource);
  const audioSource=audio?new EncodedAudioPacketSource(audioCodec):null;if(audioSource)output.addAudioTrack(audioSource);
  await output.start();
  const origin=await input.getFirstTimestamp([video,audio].filter(Boolean));let end=0,total=0,count=0;
  onProgress('Appending the ending · keeping the original video and sound…');
  for(const [track,source,adapter] of [[video,videoSource,originalAdapter],[audio,audioSource,null]]){
   if(!track)continue;
   const metadata={decoderConfig:adapter?.config||await track.getDecoderConfig()};
   for await(const original of new EncodedPacketSink(track).packets()){
    signal.throwIfAborted();const packet=adapter?adapter.packet(original):original;
    total+=packet.data.byteLength;if(total>MAX_BYTES)throw new Error('The download exceeds the device file limit.');
    await source.add(packet.clone({timestamp:packet.timestamp-origin}),metadata);
    end=Math.max(end,packet.timestamp-origin+packet.duration);
    // Let cancellation and page lifecycle events run even with cached packets.
    if(++count%120===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
  if(end<=0)throw new Error('The replay contains no video.');
  signal.throwIfAborted();
  for(const original of ending.packets){
   signal.throwIfAborted();const packet=endingAdapter?endingAdapter.packet(original):original;
   await videoSource.add(packet.clone({timestamp:end+packet.timestamp}),{decoderConfig:originalAdapter?.config||config});
  }
  await output.finalize();signal.throwIfAborted();
  return {...clip,id:crypto.randomUUID(),parentId:clip.id,blob:new Blob([target.buffer],{type:codec==='avc'?'video/mp4':'video/webm'}),duration:end+ENDING_SECONDS,hasEnding:true,endingSeconds:ENDING_SECONDS,branded:true};
 }catch(error){await output?.cancel();throw error;}finally{input.dispose();}
}

export async function createDownloadCopy(clip,{signal,onProgress=()=>{}}={}){
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason||new DOMException('Download cancelled.','AbortError'));
 const visibility=()=>{if(document.hidden)controller.abort(new Error('Keep this tab visible while preparing your download.'));};
 signal?.addEventListener('abort',abort,{once:true});window.addEventListener('pagehide',abort);document.addEventListener('visibilitychange',visibility);
 const deadline=setTimeout(()=>controller.abort(new Error('Preparing the ending took too long. Please retry.')),20000);
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
