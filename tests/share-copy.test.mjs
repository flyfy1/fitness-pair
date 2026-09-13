import test from 'node:test';
import assert from 'node:assert/strict';
import {shareWindow,fitsWebsiteShare,SHARE_MAX_BYTES} from '../apps/arcade/src/share-copy.js';
import {validateUpload} from '../apps/arcade/server/worker.js';

test('share copy window keeps final gameplay and replaces an existing ending',()=>{
 assert.deepEqual(shareWindow(120,true),{start:62,end:117});
 assert.deepEqual(shareWindow(20,true),{start:0,end:17});
 assert.deepEqual(shareWindow(70,false),{start:15,end:70});
 assert.throws(()=>shareWindow(Infinity,true));assert.throws(()=>shareWindow(2,true));
});
test('local website eligibility agrees with gateway duration and byte boundaries',()=>{
 const url=new URL('https://arcade.test/api/clips/550e8400-e29b-41d4-a716-446655440000?title=Replay&game=motion-quest&source=replay&duration=90');
 const headers={'Content-Type':'video/mp4','X-Sharing-Consent':'gallery-v1','X-Management-Key':'a'.repeat(40),'Content-Length':String(SHARE_MAX_BYTES)};
 assert.equal(fitsWebsiteShare({blob:{size:SHARE_MAX_BYTES},duration:90}),true);
 assert.equal(validateUpload(new Request(url,{headers}),url).duration,90);
 for(const [duration,size] of [[90.1,100],[90,SHARE_MAX_BYTES+1],[0,100],[1,0],[NaN,10]])assert.equal(fitsWebsiteShare({blob:{size},duration}),false);
 url.searchParams.set('duration','90.1');assert.throws(()=>validateUpload(new Request(url,{headers}),url));
});
