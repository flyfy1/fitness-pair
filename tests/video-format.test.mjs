import test from 'node:test';
import assert from 'node:assert/strict';
import {startVideoRecorder, recordedBlob, videoExtension} from '../apps/arcade/src/video-format.js';

test('MP4 candidates precede WebM and recover from constructor/start failures', () => {
  const attempts=[];
  class Recorder {
    static isTypeSupported() { return true; }
    constructor(stream, {mimeType}) {
      attempts.push(mimeType); this.mimeType=mimeType; this.state='inactive';
      if (mimeType.includes('424028')) throw Error('encoder unavailable');
    }
    start() { if(this.mimeType.includes('avc1')) throw Error('start failed'); this.state='recording'; }
  }
  const result=startVideoRecorder({}, () => {}, {Recorder});
  assert.equal(result.mimeType, 'video/mp4');
  assert.equal(attempts.length, 3);
  assert.ok(attempts.every(type=>type.startsWith('video/mp4')));
});
test('WebM fallback keeps its actual type and extension; mislabeled or empty bytes fail', async () => {
  const webm=new Blob([new Uint8Array([26,69,223,163,0,0,0,0,0,0,0,0])], {type:'video/webm;codecs=vp8'});
  const result=await recordedBlob([webm], 'video/webm');
  assert.equal(result.type, 'video/webm'); assert.equal(videoExtension(result), 'webm');
  await assert.rejects(recordedBlob([webm.slice(0, webm.size, 'video/mp4')], 'video/mp4'), /does not match/);
  await assert.rejects(recordedBlob([], 'video/mp4'), /unreadable/);
  const mp4=await recordedBlob([new Blob([new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109])])], 'video/mp4;codecs=avc1.420020');
  assert.equal(mp4.type, 'video/mp4'); assert.equal(videoExtension(mp4), 'mp4');
});
