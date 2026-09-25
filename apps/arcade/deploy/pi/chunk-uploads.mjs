import {createReadStream} from 'node:fs';
import {mkdir,open,rm} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {createHash,randomUUID} from 'node:crypto';
import {validateUpload} from '../../server/worker.js';

const MAX=200_000_000,CHUNK=8_000_000,TTL=10*60*1000;
const fail=(status,message)=>Object.assign(Error(message),{status});
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fingerprint=(request,user)=>createHash('sha256').update(JSON.stringify([
  user?.userId||'',request.headers.get('Cookie')||'',request.headers.get('X-CSRF-Token')||'',request.headers.get('X-Management-Key')||''
])).digest('hex');

// One bounded temporary upload, same authorization as the original gallery.
// Finalization calls the original worker, which rechecks ownership and quota.
export async function chunkedWorker(worker,{directory,now=()=>Date.now()}={}) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const file=directory+'/pending.bin';
  await rm(file,{force:true}); // Only this adapter's incomplete temporary file.
  let job=null,busy=false;
  async function discard(){job=null;await rm(file,{force:true});}
  const prune=setInterval(()=>{
    if(!busy&&job&&job.expires<=now()){
      busy=true;discard().catch(()=>{}).finally(()=>{busy=false;});
    }
  },30000);prune.unref();
  return {close:()=>clearInterval(prune),async fetch(request,env){
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/chunk-uploads/'))return worker.fetch(request,env);
    if(busy)return json({error:'An upload is finishing. Please retry shortly.'},429);
    busy=true;
    try {
      if(request.headers.get('Origin')!==url.origin)throw fail(403,'Upload from the arcade website.');
      if(!env.ACCOUNTS||!env.GCP_BUCKET)throw fail(503,'Sharing is unavailable.');
      const user=await env.ACCOUNTS.user(request);
      if(user)await env.ACCOUNTS.requireUser(request,true);
      else if(request.headers.get('X-CSRF-Token'))throw fail(401,'Log in again before publishing.');
      const owner=fingerprint(request,user);
      if(job&&job.expires<=now())await discard();
      const match=/^\/api\/chunk-uploads\/([0-9a-f-]{36})(\/commit)?$/.exec(url.pathname);
      if(!match)throw fail(404,'Upload not found.');
      if(request.method==='POST'&&!match[2]){
        if(job)throw fail(429,'Another clip is uploading. Please retry shortly.');
        const total=Number(request.headers.get('X-Upload-Bytes'));
        if(!Number.isSafeInteger(total)||total<12||total>MAX)throw fail(413,'Use a video no larger than 200 MB.');
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(match[1]))throw fail(400,'Invalid clip ID.');
        const target=new URL('/api/clips/'+match[1]+url.search,url.origin);
        const headers=new Headers(request.headers);headers.set('Content-Length',String(total));
        const info=validateUpload(new Request(target,{headers}),target);
        if(!user&&(info.visibility!=='public'||info.retention!=='7'))throw fail(403,'Log in for private clips or a different expiry.');
        if(!user&&!/^[A-Za-z0-9_-]{32,128}$/.test(headers.get('X-Management-Key')||''))throw fail(400,'A device management key is required.');
        const handle=await open(file,'wx',0o600);await handle.close();
        job={id:randomUUID(),owner,total,offset:0,target:target.href,headers,expires:now()+TTL};
        return json({id:job.id,chunkBytes:CHUNK},201);
      }
      if(!job||job.id!==match[1]||job.owner!==owner)throw fail(404,'Upload not found or expired.');
      if(request.method==='DELETE'&&!match[2]){await discard();return json({cancelled:true});}
      if(request.method==='PUT'&&!match[2]){
        if(Number(request.headers.get('X-Upload-Offset'))!==job.offset)throw fail(409,'Upload position changed. Start again.');
        const reader=request.body?.getReader();if(!reader)throw fail(400,'Empty upload chunk.');
        const handle=await open(file,'a');let bytes=0;
        try {
          while(true){
            const {value,done}=await reader.read();if(done)break;
            bytes+=value.byteLength;
            if(bytes>CHUNK||job.offset+bytes>job.total)throw fail(413,'Upload chunk exceeds its limit.');
            await handle.writeFile(value);
          }
          if(!bytes)throw fail(400,'Empty upload chunk.');
          job.offset+=bytes;
        } catch(error){await reader.cancel().catch(()=>{});await discard();throw error;}
        finally {reader.releaseLock();await handle.close();}
        return json({offset:job.offset});
      }
      if(request.method==='POST'&&match[2]){
        if(job.offset!==job.total)throw fail(409,'Upload is incomplete.');
        const stream=createReadStream(file);
        try {return await worker.fetch(new Request(job.target,{method:'PUT',headers:job.headers,body:Readable.toWeb(stream),duplex:'half'}),env);}
        finally {stream.destroy();await discard();}
      }
      throw fail(405,'Unsupported upload method.');
    } catch(error){return json({error:error.status?error.message:'Upload is unavailable. Please retry.'},error.status||503);}
    finally {busy=false;}
  }};
}
