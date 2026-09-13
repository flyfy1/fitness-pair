import {startVideoRecorder} from '../video-format.js';
import {Input,ALL_FORMATS,BlobSource,EncodedPacketSink,Output,BufferTarget,Mp4OutputFormat,WebMOutputFormat,EncodedVideoPacketSource,EncodedAudioPacketSource} from 'mediabunny';

export const REPLAY_SECONDS=90;
const SEGMENT_SECONDS=5;
const AUDIO_FORMATS=['audio/webm;codecs=opus','audio/webm','audio/mp4;codecs=mp4a.40.2','audio/mp4'];

// Each segment has its own container header and initial keyframe. MediaRecorder
// timeslice chunks alone cannot be discarded or concatenated into playable media.
export function startRollingRecorder(stream,{audioOnly=false,maxBytes=100*1024*1024,onError=()=>{},maxSeconds=REPLAY_SECONDS,segmentSeconds=SEGMENT_SECONDS}={}){
 const startedAt=performance.now();let segments=[],current,timer,stopped=false,failure=null,result;
 const elapsed=()=> (performance.now()-startedAt)/1000;
 function prune(now){segments=segments.filter(segment=>segment.end===null||segment.end>now-maxSeconds);}
 function fail(error){if(failure)return;failure=error;clearInterval(timer);onError(error);}
 function begin(){
  const segment={start:elapsed(),end:null,chunks:[],bytes:0,recorder:null};
  segment.done=new Promise(resolve=>{segment.resolve=resolve;});
  const wire=recorder=>{
   segment.recorder=recorder;
   recorder.ondataavailable=event=>{
    if(!event.data.size)return;
    prune(elapsed());segment.bytes+=event.data.size;
    if(segments.reduce((sum,item)=>sum+item.bytes,0)>maxBytes){fail(new Error('Recording exceeded the device memory limit.'));return;}
    segment.chunks.push(event.data);
   };
   recorder.onerror=()=>fail(new Error('This browser could not record the replay.'));
   recorder.onstop=()=>{clearTimeout(segment.timeout);segment.resolve();};
  };
  if(audioOnly){
   for(const mimeType of AUDIO_FORMATS){
    if(!MediaRecorder.isTypeSupported(mimeType))continue;
    try{const recorder=new MediaRecorder(stream,{mimeType,audioBitsPerSecond:96000});wire(recorder);recorder.start(500);break;}
    catch{const recorder=segment.recorder;if(recorder){recorder.ondataavailable=recorder.onstop=recorder.onerror=null;if(recorder.state!=='inactive')recorder.stop();}segment.recorder=null;}
   }
   if(!segment.recorder)throw new Error('This browser cannot record a conversation track.');
  }else startVideoRecorder(stream,wire,{videoBitsPerSecond:1500000,videoKeyFrameIntervalDuration:1000});
  segments.push(segment);current=segment;
 }
 function end(segment){
  if(segment.end!==null)return;segment.end=elapsed();
  segment.timeout=setTimeout(()=>{fail(new Error('Finishing the recording took too long.'));segment.resolve();},4000);
  if(segment.recorder.state!=='inactive')segment.recorder.stop();else{clearTimeout(segment.timeout);segment.resolve();}
 }
 begin();
 timer=setInterval(()=>{
  if(stopped||failure)return;
  try{const previous=current;begin();end(previous);prune(elapsed());}catch(error){fail(error);}
 },segmentSeconds*1000);
 return {
  get state(){return stopped?'inactive':'recording';},
  get bufferedBytes(){return segments.reduce((sum,item)=>sum+item.bytes,0);},
  get segmentCount(){return segments.length;},
  stop({startSeconds=0}={}){
   if(result)return result;
   stopped=true;clearInterval(timer);const endSeconds=elapsed();end(current);prune(endSeconds);
   result=(async()=>{
    try{
     await Promise.all(segments.map(segment=>segment.done));if(failure)throw failure;
     return await assembleRecording(segments,{startSeconds:Math.max(startSeconds,endSeconds-maxSeconds),endSeconds,audioOnly});
    }finally{for(const segment of segments){clearTimeout(segment.timeout);segment.chunks=[];}segments=[];}
   })();
   return result;
  },
 };
}

// Remux compressed packets locally at their original speed. Start video at the
// first decodable keyframe inside the window (at most one requested GOP later).
// Rebase both tracks against that same point so audio keeps its original timing.
export async function assembleRecording(segments,{startSeconds,endSeconds,audioOnly=false}){
 let output,videoSource,audioSource,videoCodec,audioCodec,origin=null,duration=0;
 try{
  for(const segment of segments){
   if(!segment.bytes||segment.end<=startSeconds)continue;
   const input=new Input({source:new BlobSource(new Blob(segment.chunks)),formats:ALL_FORMATS});
   try{
    const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack();
    const tracks=[video,audio].filter(Boolean);if(!tracks.length)continue;
    const base=segment.start-await input.getFirstTimestamp(tracks);
    const packets=async track=>{const list=[];if(track)for await(const packet of new EncodedPacketSink(track).packets())list.push(packet);return list;};
    const videoPackets=await packets(video),audioPackets=await packets(audio);
    if(origin===null){
     const first=(audioOnly?audioPackets:videoPackets).find(packet=>(audioOnly||packet.type==='key')&&base+packet.timestamp>=startSeconds&&base+packet.timestamp<endSeconds);
     if(!first)continue;origin=base+first.timestamp;
     videoCodec=await video?.getCodec();audioCodec=await audio?.getCodec();
     const mp4=(!videoCodec||videoCodec==='avc'||videoCodec==='hevc')&&(!audioCodec||audioCodec==='aac');
     output=new Output({format:mp4?new Mp4OutputFormat():new WebMOutputFormat(),target:new BufferTarget()});
     if(videoCodec){videoSource=new EncodedVideoPacketSource(videoCodec);output.addVideoTrack(videoSource);}
     if(audioCodec){audioSource=new EncodedAudioPacketSource(audioCodec);output.addAudioTrack(audioSource);}
     await output.start();
    }
    for(const [track,list,source,codec] of [[video,videoPackets,videoSource,videoCodec],[audio,audioPackets,audioSource,audioCodec]]){
     if(!track||!source)continue;
     if(await track.getCodec()!==codec)throw new Error('The recording format changed during this round.');
     const meta={decoderConfig:await track.getDecoderConfig()};
     for(const packet of list){
      const time=base+packet.timestamp;
      // Exclude overlap while rotating encoders and packets outside the window.
      if(time<origin||time>=Math.min(segment.end,endSeconds))continue;
      const length=Math.min(packet.duration,segment.end-time,endSeconds-time);
      await source.add(packet.clone({timestamp:time-origin,duration:length}),meta);
      duration=Math.max(duration,time-origin+length);
     }
    }
   }finally{input.dispose();}
  }
  if(!output||duration<=0)throw new Error('The browser returned an empty recording.');
  await output.finalize();
  const type=output.format instanceof Mp4OutputFormat?(audioOnly?'audio/mp4':'video/mp4'):(audioOnly?'audio/webm':'video/webm');
  return {blob:new Blob([output.target.buffer],{type}),duration,startSeconds:origin};
 }catch(error){await output?.cancel();throw error;}
}
