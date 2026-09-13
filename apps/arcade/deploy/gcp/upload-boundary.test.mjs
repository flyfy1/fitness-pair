import test from 'node:test';
import http from 'node:http';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createGateway} from './gateway.mjs';
import {createWorker} from '../../server/worker.js';
test('real HTTP accepts exactly 200 MB and rejects a larger chunked body with an audit event',async()=>{
const audits=[],owner='a'.repeat(64),clips=new Map();let cloudWrites=0;
const accounts={user:async()=>({userId:owner}),requireUser:async()=>({userId:owner}),reserve:async(id,clip)=>{clips.set(clip.id,clip);},list:async()=>({clips:[...clips.values()],usedBytes:0,limitBytes:2_000_000_000})};
const worker=createWorker({audit:event=>audits.push(event),fetcher:async(raw,options)=>{
 if(options.method==='GET')return new Response('',{status:404});
 if(options.method==='POST'){cloudWrites++;let total=0;if(options.body instanceof ReadableStream){for await(const chunk of options.body)total+=chunk.length;}else total=options.body.length;assert.ok(total>0);return Response.json({name:'synthetic-only'});}
 throw Error('Unexpected request');
}});
const server=createGateway({origin:'http://127.0.0.1',env:{GCP_BUCKET:'mock',GCP_ACCESS_TOKEN_PROVIDER:async()=>'mock',ACCOUNTS:accounts},galleryWorker:worker});server.listen(0,'127.0.0.1');await once(server,'listening');
async function send(size,declared=true){
 const id=randomUUID(),req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/api/clips/'+id+'?title=Boundary&game=motion-quest&source=synthetic&duration=1',method:'PUT',headers:{'Content-Type':'video/webm','X-Sharing-Consent':'gallery-v1',Origin:'http://127.0.0.1',...(declared?{'Content-Length':size}:{})}});
 const result=new Promise((resolve,reject)=>{req.on('response',res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});req.on('error',reject);});
 const chunk=Buffer.alloc(1_000_000);chunk.set([26,69,223,163]);
 (async()=>{let left=size;while(left){const length=Math.min(left,chunk.length);left-=length;if(!req.write(chunk.subarray(0,length)))await once(req,'drain');}req.end();})().catch(()=>{});
 return result;
}
try{
 const accepted=await send(200_000_000);assert.equal(accepted.status,201);assert.equal(accepted.body.bytes,200_000_000);assert.equal(cloudWrites,2);
 const rejected=await send(200_000_001,false);assert.equal(rejected.status,413);assert.equal(audits.at(-1).source,'server-body');assert.equal(cloudWrites,2);
 console.log(JSON.stringify({evidence:'real local HTTP gateway with synthetic bytes and mock storage',exact200MB:accepted.status,chunked200MBPlusOne:rejected.status,rejectionRecorded:true,maxRSS:process.resourceUsage().maxRSS}));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

});
