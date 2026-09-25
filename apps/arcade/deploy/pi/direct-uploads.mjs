import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {validateUpload} from '../../server/worker.js';

const MAX=200_000_000,TTL=10*60*1000;
const fail=(status,message)=>Object.assign(Error(message),{status});
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const hash=value=>createHash('sha256').update(value).digest('hex');
const validSession=value=>{
 try {const u=new URL(value);return u.origin==='https://storage.googleapis.com'&&u.pathname.startsWith('/upload/storage/v1/b/')&&u.searchParams.has('upload_id');}catch{return false;}
};

// A bounded, durable pending record contains no credential or upload session URL.
// GCS owns video bytes; this adapter reads only metadata and the first 12 bytes.
export async function directUploadWorker(worker,{directory,fetcher=fetch,now=()=>Date.now()}={}) {
 await mkdir(directory,{recursive:true,mode:0o700});
 const filename=directory+'/pending.json';let pending=null,sessionURL=null,busy=false;
 try{pending=JSON.parse(await readFile(filename,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 async function save(value){await writeFile(filename+'.new',JSON.stringify(value),{mode:0o600});await rename(filename+'.new',filename);pending=value;}
 async function forget(){await unlink(filename).catch(error=>{if(error.code!=='ENOENT')throw error;});pending=null;sessionURL=null;}
 async function cloud(env,url,options={}){
  const token=await env.GCP_ACCESS_TOKEN_PROVIDER();
  return fetcher(url,{...options,headers:{Authorization:'Bearer '+token,...options.headers},redirect:'error',signal:AbortSignal.timeout(30000)});
 }
 const objectURL=(env,name)=>`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(env.GCP_BUCKET)}/o/${encodeURIComponent(name)}`;
 async function discard(env){
  if(sessionURL){
   const response=await fetcher(sessionURL,{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(15000)});
   if(![200,204,404,410,499].includes(response.status))throw fail(503,'Could not cancel this upload. Try again shortly.');
  }
  if(pending){const response=await cloud(env,objectURL(env,pending.object),{method:'DELETE'});if(!response.ok&&response.status!==404)throw fail(503,'Could not remove the unfinished upload.');}
  await forget();
 }
 return {async fetch(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/direct-uploads/'))return worker.fetch(request,env);
  if(busy)return json({error:'Another upload is finishing. Please retry shortly.'},429);
  busy=true;
  try {
   if(request.headers.get('Origin')!==url.origin)throw fail(403,'Upload from the arcade website.');
   if(!env.ACCOUNTS||!env.GCP_BUCKET||typeof env.GCP_ACCESS_TOKEN_PROVIDER!=='function')throw fail(503,'Direct sharing is unavailable.');
   const user=await env.ACCOUNTS.user(request);
   if(user)await env.ACCOUNTS.requireUser(request,true);
   else if(request.headers.get('X-CSRF-Token'))throw fail(401,'Log in again before publishing.');
   const managementKey=request.headers.get('X-Management-Key')||'';
   const owner=user?.userId||hash(managementKey);
   const match=/^\/api\/direct-uploads\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(\/complete)?$/.exec(url.pathname);
   if(!match)throw fail(404,'Upload not found.');
   const id=match[1];
   if(pending&&pending.until<=now())await discard(env);
   if(request.method==='POST'&&!match[2]){
    const total=Number(request.headers.get('X-Upload-Bytes'));
    if(!Number.isSafeInteger(total)||total<12||total>MAX)throw fail(413,'Use a video no larger than 200 MB.');
    const target=new URL('/api/clips/'+id+url.search,url.origin);
    const headers=new Headers(request.headers);headers.set('Content-Length',String(total));
    const info=validateUpload(new Request(target,{headers}),target);
    if(!user&&(info.visibility!=='public'||info.retention!=='7'))throw fail(403,'Log in for private clips or a different expiry.');
    if(!user&&!/^[A-Za-z0-9_-]{32,128}$/.test(managementKey))throw fail(400,'A device management key is required.');
    if(pending){
     if(pending.owner!==owner||pending.id!==id)throw fail(429,'Another clip is uploading. Please retry shortly.');
     await discard(env);
    }
    // Existing publication retries retain original ownership and never issue another capability.
    const existing=await cloud(env,objectURL(env,'gallery/'+id+'.json')+'?alt=media');
    if(existing.ok){
     const record=await existing.json();
     if(record.ownerId?record.ownerId!==user?.userId:record.keyHash!==hash(managementKey))throw fail(409,'This clip belongs to another publisher.');
     const result=await worker.fetch(new Request(target,{headers:request.headers}),env);
     if(!result.ok)return result;return json({published:await result.json()});
    }
    if(existing.status!==404)throw fail(503,'Could not verify existing publications.');
    // Reuse gallery inventory and account quota; finalization rechecks both atomically.
    if(!user){const config=await worker.fetch(new Request(new URL('/api/config',url.origin)),env);if(!config.ok)throw fail(503,'Storage inventory is unavailable.');}
    const account=await env.ACCOUNTS.list(user?.userId||null);
    if(user&&account.usedBytes+total>account.limitBytes)throw fail(413,'Your storage is full. Remove a shared clip first.');
    if(account.clips.some(clip=>clip.id===id))throw fail(409,'Remove the unfinished shared clip before retrying.');
    const object='videos/.pending/'+randomUUID(),until=now()+TTL;
    const response=await cloud(env,`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(env.GCP_BUCKET)}/o?uploadType=resumable&ifGenerationMatch=0`,{
     method:'POST',headers:{Origin:url.origin,'Content-Type':'application/json','X-Upload-Content-Type':info.mime,'X-Upload-Content-Length':String(total)},
     body:JSON.stringify({name:object,contentType:info.mime,customTime:new Date(until).toISOString(),metadata:{fitnessUpload:id}})
    });
    const location=response.headers.get('Location');
    if(!response.ok||!validSession(location))throw fail(503,'Could not prepare the cloud upload.');
    sessionURL=location;
    await save({id,owner,object,total,until,target:target.href,mime:info.mime,consent:headers.get('X-Sharing-Consent')});
    return json({uploadURL:sessionURL,expiresAt:until},201);
   }
   if(!pending||pending.id!==id){
    if(request.method==='POST'&&match[2])return worker.fetch(new Request(new URL('/api/clips/'+id,url.origin),{headers:request.headers}),env);
    throw fail(404,'Upload not found or expired.');
   }
   if(pending.owner!==owner)throw fail(404,'Upload not found or expired.');
   if(request.method==='DELETE'&&!match[2]){await discard(env);return json({cancelled:true});}
   if(request.method!=='POST'||!match[2])throw fail(405,'Unsupported upload method.');
   if(request.headers.get('X-Sharing-Consent')!==pending.consent)throw fail(400,'Confirm the selected visibility before publishing.');
   const metadata=await cloud(env,objectURL(env,pending.object));
   if(metadata.status===404)throw fail(409,'The cloud upload is not complete.');
   if(!metadata.ok)throw fail(503,'Could not verify the uploaded video.');
   const object=await metadata.json();
   if(object.name!==pending.object||Number(object.size)!==pending.total||object.contentType!==pending.mime||!/^\d+$/.test(object.generation||'')){
    await discard(env);throw fail(400,'Uploaded video size or type does not match.');
   }
   const headResponse=await cloud(env,objectURL(env,pending.object)+'?alt=media&generation='+object.generation,{headers:{Range:'bytes=0-11'}});
   if(headResponse.status!==206||Number(headResponse.headers.get('Content-Length'))!==12){await headResponse.body?.cancel();throw fail(503,'Could not inspect the uploaded video.');}
   const head=new Uint8Array(await headResponse.arrayBuffer());
   const source=pending.object;
   const prepared={id,bytes:pending.total,head,async upload(entry){
    const endpoint=objectURL(env,source)+'/rewriteTo/b/'+encodeURIComponent(env.GCP_BUCKET)+'/o/'+encodeURIComponent('videos/'+id);
    let rewriteToken='';
    for(let attempt=0;attempt<4;attempt++){
     const response=await cloud(env,endpoint+'?ifGenerationMatch=0&ifSourceGenerationMatch='+object.generation+(rewriteToken?'&rewriteToken='+encodeURIComponent(rewriteToken):''),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contentType:pending.mime,metadata:{},customTime:entry.expiresAt===null?null:new Date(entry.expiresAt).toISOString()})
     });
     if(!response.ok)return response;
     const result=await response.json();if(result.done)return new Response(null,{status:200});rewriteToken=result.rewriteToken;
     if(typeof rewriteToken!=='string'||!rewriteToken)break;
    }
    throw fail(503,'Cloud finalization is still pending. Check your shared clips before retrying.');
   }};
   const headers=new Headers(request.headers);headers.set('Content-Type',pending.mime);headers.set('Content-Length',String(pending.total));
   const result=await worker.fetch(new Request(pending.target,{method:'PUT',headers}),{...env,PREPARED_UPLOAD:prepared});
   if(result.ok){sessionURL=null;await discard(env);}
   else if(result.status===415){await discard(env);}
   return result;
  }catch(error){return json({error:error.status?error.message:'Direct upload is unavailable. Please retry.'},error.status||503);}
  finally{busy=false;}
 }};
}
