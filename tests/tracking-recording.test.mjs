import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrackingPublisher} from '../packages/gameplay/tracking.js';
import {createTrackingCapture,isSessionUUID,sliceTracking,trackingBytes,TRACKING_FORMAT} from '../apps/arcade/src/gameplay/tracking-recording.js';

const sessionId='550e8400-e29b-41d4-a716-446655440000';
const otherSession='7d444840-9dc0-4f09-b239-a8a474b19d20';
const source={kind:'camera',id:'camera-fixture'};
const frame=(seq,tMs,overrides={})=>({version:1,sessionId,seq,tMs,source,modelId:'fixture/1',coordinateSpace:'image-normalized-unmirrored',image:{width:640,height:480},joints:{leftShoulder:{x:.25,y:.3,confidence:.9}},...overrides});

test('tracking publisher validates PoseFrames and stops after unsubscribe',()=>{
 const publisher=createTrackingPublisher(),received=[];
 const unsubscribe=publisher.subscribe(value=>received.push(value));
 publisher.emit(frame(0,1000));unsubscribe();publisher.emit(frame(1,1033));
 assert.deepEqual(received.map(value=>value.seq),[0]);
 assert.throws(()=>publisher.emit({}),/Unsupported contract version/);
});

test('camera capture keeps only the matching UUID/source and rebases a trimmed replay',()=>{
 const capture=createTrackingCapture({sessionId,source,game:'motion-quest',startedAt:1000,createdAt:1700000000000});
 assert.equal(capture.add(frame(0,1500)),true);
 assert.equal(capture.add(frame(1,2500)),true);
 assert.equal(capture.add(frame(2,3500)),true);
 assert.equal(capture.add(frame(3,3600,{sessionId:otherSession})),false);
 assert.equal(capture.add(frame(4,3700,{source:{kind:'camera',id:'other-camera'}})),false);
 const tracking=capture.finish({startSeconds:1,duration:2});
 assert.equal(tracking.format,TRACKING_FORMAT);
 assert.equal(tracking.sessionId,sessionId);
 assert.equal(tracking.video.startTMs,2000);
 assert.equal(tracking.video.durationMs,2000);
 assert.deepEqual(tracking.samples.map(sample=>[sample.videoMs,sample.pose.seq]),[[500,1],[1500,2]]);
 assert.ok(trackingBytes(tracking)>0);
});

test('synthetic rounds get UUIDs but no skeleton capture',()=>{
 assert.equal(isSessionUUID(sessionId),true);
 assert.equal(isSessionUUID(`keyboard-${sessionId}`),false);
 assert.equal(createTrackingCapture({sessionId,source:{kind:'synthetic',id:sessionId},game:'dino-run',startedAt:0}),null);
});

test('share-copy tracking follows the selected window and playback speed',()=>{
 const capture=createTrackingCapture({sessionId,source,game:'motion-quest',startedAt:1000});
 for(let index=0;index<6;index++)capture.add(frame(index,1000+index*1000));
 const original=capture.finish({duration:6});
 const sliced=sliceTracking(original,{startSeconds:2,endSeconds:5,playbackRate:2});
 assert.equal(sliced.sessionId,sessionId);
 assert.equal(sliced.video.startTMs,3000);
 assert.equal(sliced.video.durationMs,1500);
 assert.deepEqual(sliced.samples.map(sample=>[sample.videoMs,sample.pose.seq]),[[0,2],[500,3],[1000,4],[1500,5]]);
});
