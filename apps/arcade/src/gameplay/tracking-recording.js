import {assertPoseFrame,sameSource} from '../../../../contracts/index.js';

export const TRACKING_FORMAT='fitness-pair/tracking-session/1';
export const MAX_TRACKING_SAMPLES=3000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isSessionUUID=value=>typeof value==='string'&&UUID.test(value);
export const trackingBytes=value=>value?new TextEncoder().encode(JSON.stringify(value)).byteLength:0;

export function createTrackingCapture({sessionId,source,game,startedAt,createdAt=Date.now(),maxDurationMs=90000}){
 if(!isSessionUUID(sessionId))throw new TypeError('Recording session ID must be a UUID');
 if(source?.kind!=='camera')return null;
 if(!Number.isFinite(startedAt)||!Number.isFinite(createdAt)||!Number.isFinite(maxDurationMs)||maxDurationMs<=0)
  throw new TypeError('Invalid tracking capture timing');
 const samples=[];
 return {
  add(frame){
   assertPoseFrame(frame);
   if(frame.sessionId!==sessionId||!sameSource(frame.source,source))return false;
   const videoMs=frame.tMs-startedAt;
   if(!Number.isFinite(videoMs))return false;
   samples.push({videoMs,pose:structuredClone(frame)});
   const cutoff=videoMs-maxDurationMs;
   while(samples.length&&samples[0].videoMs<cutoff)samples.shift();
   while(samples.length>MAX_TRACKING_SAMPLES)samples.shift();
   return true;
  },
  finish({startSeconds=0,duration}={}){
   if(!Number.isFinite(startSeconds)||startSeconds<0||!Number.isFinite(duration)||duration<=0)
    throw new TypeError('Invalid recorded tracking window');
   const startMs=startSeconds*1000,endMs=startMs+duration*1000;
   const selected=samples.filter(sample=>sample.videoMs>=startMs&&sample.videoMs<=endMs+50)
    .map(sample=>({...sample,videoMs:sample.videoMs-startMs}));
   return {format:TRACKING_FORMAT,sessionId,createdAt:new Date(createdAt).toISOString(),game,
    source:structuredClone(source),video:{startTMs:startedAt+startMs,durationMs:duration*1000},samples:selected};
  },
  get sampleCount(){return samples.length;},
 };
}

export function sliceTracking(tracking,{startSeconds=0,endSeconds,playbackRate=1}={}){
 if(!tracking)return undefined;
 if(tracking.format!==TRACKING_FORMAT||!isSessionUUID(tracking.sessionId)||tracking.source?.kind!=='camera'||!Array.isArray(tracking.samples))
  throw new TypeError('Invalid tracking session');
 if(!Number.isFinite(startSeconds)||startSeconds<0||!Number.isFinite(endSeconds)||endSeconds<=startSeconds||!Number.isFinite(playbackRate)||playbackRate<=0)
  throw new TypeError('Invalid tracking slice');
 const startMs=startSeconds*1000,endMs=endSeconds*1000;
 const samples=tracking.samples.filter(sample=>Number.isFinite(sample.videoMs)&&sample.videoMs>=startMs&&sample.videoMs<=endMs+50)
  .map(sample=>({...structuredClone(sample),videoMs:(sample.videoMs-startMs)/playbackRate}));
 return {...structuredClone(tracking),video:{startTMs:tracking.video.startTMs+startMs,durationMs:(endMs-startMs)/playbackRate},samples};
}
