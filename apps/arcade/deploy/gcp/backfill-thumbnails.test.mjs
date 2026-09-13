import test from 'node:test';
import assert from 'node:assert/strict';
import {backfillThumbnails} from './backfill-thumbnails.mjs';

test('backfill is explicit, additive, verifies readback, and never reads video on rerun',async()=>{
 const id='550e8400-e29b-41d4-a716-446655440000',video=Buffer.from('synthetic-video-fixture'),jpeg=Buffer.from([255,216,255,224,0,4,1,2,3,4,255,217]);
 let saved=null,reads=0,writes=0;
 const options={env:{GCP_BUCKET:'test-only',FITNESS_STATE_DIR:'/unused'},tokenProvider:async()=>'test-only',encode:async bytes=>{assert.deepEqual(bytes,video);return jpeg;},log:()=>{},fetcher:async(raw,init)=>{
  const u=new URL(raw);
  if(u.pathname==='/api/clips')return Response.json({enabled:true,clips:[{id}]});
  if(u.pathname==='/api/clips/'+id)return Response.json({id});
  if(u.pathname==='/api/posters/'+id)return saved?new Response(saved):new Response(null,{status:404});
  if(u.pathname==='/api/media/'+id){reads++;return new Response(video);}
  assert.equal(u.hostname,'storage.googleapis.com');assert.equal(init.method,'POST');assert.equal(u.searchParams.get('ifGenerationMatch'),'0');assert.equal(u.searchParams.get('name'),'videos/'+id+'.jpg');
  writes++;saved=init.body;return new Response('{}');
 }};
 assert.deepEqual(await backfillThumbnails(options),{scanned:1,created:0,existing:0,missing:1,failed:0});assert.equal(reads,0);assert.equal(writes,0);
 assert.deepEqual(await backfillThumbnails({...options,apply:true}),{scanned:1,created:1,existing:0,missing:1,failed:0});assert.equal(reads,1);assert.equal(writes,1);
 assert.deepEqual(await backfillThumbnails({...options,apply:true}),{scanned:1,created:0,existing:1,missing:0,failed:0});assert.equal(reads,1);assert.equal(writes,1);
});
