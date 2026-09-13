const MAX_BYTES=20*1024*1024, TTL=7*86400000, ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(status,message)=>Object.assign(new Error(message),{status});
const enc=new TextEncoder();
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
async function equal(a,b){const x=await digest(a||''),y=await digest(b||'');let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0;}
const storageEnabled=env=>!!(env.GCP_BUCKET&&(env.GCP_SERVICE_ACCOUNT_JSON||typeof env.GCP_ACCESS_TOKEN_PROVIDER==='function'));
const enabled=env=>storageEnabled(env)&&!!env.ACCOUNTS;
export function validateUpload(request,url){
 if(request.headers.get('X-Sharing-Consent')!=='gallery-v1')throw fail(400,'Confirm gallery sharing before uploading.');
 const title=(url.searchParams.get('title')||'').trim(),source=url.searchParams.get('source'),game=url.searchParams.get('game'),duration=Number(url.searchParams.get('duration'));
 const mime=(request.headers.get('Content-Type')||'').split(';')[0];
 if(!title||title.length>90||/[\x00-\x1f]/.test(title))throw fail(400,'Use a title of 1–90 characters.');
 if(!['replay','synthetic'].includes(source)||!['motion-quest','dino-run','dino-ar','plank-flight','camera-start'].includes(game))throw fail(400,'Unknown game or recording source.');
 if(!Number.isFinite(duration)||duration<=0||duration>60)throw fail(400,'Record a clip of 60 seconds or less.');
 if(!['video/mp4','video/webm'].includes(mime))throw fail(415,'Use an MP4 or WebM recording.');
 const length=request.headers.get('Content-Length');if(length!==null&&(!Number.isSafeInteger(Number(length))||Number(length)<=0||Number(length)>MAX_BYTES))throw fail(413,'Clip must be nonempty and no larger than 20 MiB.');
 return {title,source,game,duration,mime};
}
async function readBounded(request){
 if(!request.body)throw fail(400,'Empty recording.');const reader=request.body.getReader(),chunks=[];let total=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>MAX_BYTES){await reader.cancel();throw fail(413,'Clip is larger than 20 MiB.');}chunks.push(value);}}finally{reader.releaseLock();}
 if(total<12)throw fail(415,'This recording is too short to be a video.');const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
function publicClip(record){const {id,title,source,game,duration,mime,createdAt,expiresAt,bytes}=record;return {id,title,source,game,duration,mime,createdAt,expiresAt,bytes,url:'/clips/'+id};}
export function createWorker({fetcher=fetch,now=()=>Date.now()}={}){
 let tokenCache=null,uploadBusy=false;
 async function accessToken(env){
  if(typeof env.GCP_ACCESS_TOKEN_PROVIDER==='function')return env.GCP_ACCESS_TOKEN_PROVIDER();
  if(tokenCache?.identity===env.GCP_SERVICE_ACCOUNT_JSON&&tokenCache.until>now())return tokenCache.token;
  const account=JSON.parse(env.GCP_SERVICE_ACCOUNT_JSON),seconds=Math.floor(now()/1000);
  if(!account.client_email||!account.private_key)throw fail(503,'Gallery identity is not configured.');
  const header=base64(enc.encode(JSON.stringify({alg:'RS256',typ:'JWT'}))),claims=base64(enc.encode(JSON.stringify({iss:account.client_email,scope:'https://www.googleapis.com/auth/devstorage.read_write',aud:'https://oauth2.googleapis.com/token',iat:seconds,exp:seconds+3600})));
  const der=Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=base64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(header+'.'+claims))));
  const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:header+'.'+claims+'.'+signature}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw fail(503,'Gallery authentication is unavailable. Please try later.');const data=await response.json();tokenCache={identity:env.GCP_SERVICE_ACCOUNT_JSON,token:data.access_token,until:now()+Math.min(Number(data.expires_in)||3600,3500)*1000};return data.access_token;
 }
 async function gcp(env,name,{method='GET',body,mime,query='',range}={}){
  const bucket=encodeURIComponent(env.GCP_BUCKET),object=encodeURIComponent(name);
  const url=method==='POST'?`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&ifGenerationMatch=0&name=${object}`:`https://storage.googleapis.com/storage/v1/b/${bucket}/o${name?'/'+object:''}${query}`;
  const headers={Authorization:'Bearer '+await accessToken(env)};if(mime)headers['Content-Type']=mime;if(range)headers.Range=range;
  return fetcher(url,{method,headers,body,signal:AbortSignal.timeout(30000),redirect:'error'});
 }
 async function record(env,id){const response=await gcp(env,`gallery/${id}.json`,{query:'?alt=media'});if(response.status===404)throw fail(404,'This clip has expired or was removed.');if(!response.ok)throw fail(503,'The gallery is unavailable. Try again shortly.');const data=await response.json();if(data.id!==id||!ID.test(data.id)||data.expiresAt<=now())throw fail(404,'This clip has expired or was removed.');return data;}
 async function routes(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/config'&&request.method==='GET')return json({sharingEnabled:enabled(env)});
  if(path==='/api/auth/session'&&request.method==='GET')return json({enabled:false,user:null,csrfToken:null});
  if(path==='/api/account/clips'&&request.method==='GET'){
   if(!enabled(env))throw fail(503,'Account sharing is unavailable. Please try again later.');
   const user=await env.ACCOUNTS.requireUser(request),account=await env.ACCOUNTS.list(user.userId);
   const clips=[];
   // Bound storage fan-out; include unfinished uploads so their owner can remove them.
   for(let start=0;start<account.clips.length;start+=12){
    const batch=await Promise.all(account.clips.slice(start,start+12).map(async item=>{
     try{const entry=await record(env,item.id);if(entry.ownerId!==user.userId)throw fail(503,'Shared clip ownership could not be verified.');return {...publicClip(entry),canDelete:true};}
     catch(error){if(error.status!==404)throw error;return {...publicClip(item),unavailable:true,canDelete:true};}
    }));clips.push(...batch);
   }
   return json({clips:clips.sort((a,b)=>b.createdAt-a.createdAt),usedBytes:account.usedBytes,limitBytes:account.limitBytes});
  }
  if(path==='/api/clips'&&request.method==='GET'){
   if(!storageEnabled(env))return json({enabled:false,clips:[]});
   const page=url.searchParams.get('page')||'';if(page.length>1500)throw fail(400,'Invalid gallery page.');
   const response=await gcp(env,'',{query:'?prefix=gallery%2F&maxResults=24'+(page?'&pageToken='+encodeURIComponent(page):'')});if(!response.ok)throw fail(503,'The gallery could not load. Please retry.');
   const listing=await response.json();const names=(listing.items||[]).map(x=>x.name).filter(n=>/^gallery\/[0-9a-f-]+\.json$/.test(n));
   const settled=await Promise.allSettled(names.map(n=>record(env,n.slice(8,-5))));for(const r of settled)if(r.status==='rejected'&&r.reason.status!==404)throw r.reason;
   const clips=settled.filter(r=>r.status==='fulfilled').map(r=>publicClip(r.value)).sort((a,b)=>b.createdAt-a.createdAt);return json({enabled:true,clips,nextPageToken:listing.nextPageToken||null});
  }
  const match=/^\/api\/(clips|media)\/([^/]+)$/.exec(path);
  if(match){
   const [,kind,id]=match;if(!ID.test(id))throw fail(404,'Clip not found.');if(!storageEnabled(env))throw fail(503,'Community publishing is being connected. Your local clips remain on this device.');
   if(['PUT','DELETE'].includes(request.method)){const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)throw fail(403,'Publish or remove clips from the arcade website.');}
   if(request.method==='DELETE'&&uploadBusy)throw fail(429,'An upload is finishing. Please retry removal shortly.');
   if(kind==='clips'&&request.method==='PUT'){
    if(!enabled(env))throw fail(503,'Log in is being connected. Your local clips remain on this device.');
    const user=await env.ACCOUNTS.requireUser(request,true);
    const info=validateUpload(request,url);if(uploadBusy)throw fail(429,'Another clip is uploading. Please retry shortly.');uploadBusy=true;
    try{
     try{const existing=await record(env,id);if(existing.ownerId!==user.userId)throw fail(409,'This clip was published by another account.');return json(publicClip(existing));}catch(error){if(error.status!==404)throw error;}
     const body=await readBounded(request);const valid=info.mime==='video/webm'?body[0]===26&&body[1]===69&&body[2]===223&&body[3]===163:String.fromCharCode(...body.slice(4,8))==='ftyp';if(!valid)throw fail(415,'The recording does not match its video format.');
     const entry={...info,id,createdAt:now(),expiresAt:now()+TTL,bytes:body.length,ownerId:user.userId};
     await env.ACCOUNTS.reserve(user.userId,publicClip(entry));
     try{
      const upload=await gcp(env,`videos/${id}`,{method:'POST',body,mime:info.mime});if(!upload.ok)throw fail(503,'Upload did not finish. Check My shared clips before retrying.');
      const marker=await gcp(env,`gallery/${id}.json`,{method:'POST',body:JSON.stringify(entry),mime:'application/json'});
      if(!marker.ok)throw fail(503,'Publication did not finish. Check My shared clips before retrying.');
     }catch(error){
      // An ambiguous write may have succeeded. Retain its reservation and let the owner
      // inspect or remove it; never release quota while stored bytes might remain.
      throw fail(503,error.status?error.message:'Upload was interrupted. Check My shared clips before retrying.');
     }
     return json(publicClip(entry),201);
    }finally{uploadBusy=false;}
   }
   let entry;
   try{entry=await record(env,id);}catch(error){
    if(error.status!==404||kind!=='clips'||request.method!=='DELETE'||!env.ACCOUNTS)throw error;
    const user=await env.ACCOUNTS.requireUser(request,true),account=await env.ACCOUNTS.list(user.userId);
    if(!account.clips.some(clip=>clip.id===id))throw error;
    const media=await gcp(env,`videos/${id}`,{method:'DELETE'});
    if(!media.ok&&media.status!==404)throw fail(503,'Could not remove this upload. Please retry.');
    await env.ACCOUNTS.release(user.userId,id);return json({removed:true});
   }
   if(kind==='clips'&&request.method==='DELETE'){
    if(entry.ownerId){
     if(!env.ACCOUNTS)throw fail(503,'Account sharing is unavailable.');
     const user=await env.ACCOUNTS.requireUser(request,true);
     if(entry.ownerId!==user.userId)throw fail(403,'Only the account that published this clip can remove it.');
    }else{
     const key=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');if(!entry.keyHash||!await equal(await digest(key),entry.keyHash))throw fail(403,'Use the device that published this older clip to remove it.');
    }
    const result=await gcp(env,`gallery/${id}.json`,{method:'DELETE'});if(!result.ok&&result.status!==404)throw fail(503,'Could not remove this clip. Please retry.');
    const media=await gcp(env,`videos/${id}`,{method:'DELETE'});
    if(!media.ok&&media.status!==404)throw fail(503,'The link was removed. Retry removal in My shared clips to release its storage.');
    if(entry.ownerId)await env.ACCOUNTS.release(entry.ownerId,id);
    return json({removed:true});
   }
   if(!['GET','HEAD'].includes(request.method))throw fail(405,'Method not allowed.');
   if(kind==='clips'){
    const user=env.ACCOUNTS?await env.ACCOUNTS.user(request):null;
    return json({...publicClip(entry),canDelete:!!(user&&entry.ownerId===user.userId),legacy:!entry.ownerId});
   }
   const range=request.headers.get('Range');if(range&&!/^bytes=(\d+-\d*|-\d+)$/.test(range))throw fail(416,'Invalid byte range.');
   const media=await gcp(env,`videos/${id}`,{query:'?alt=media',range});if(![200,206,416].includes(media.status))throw fail(404,'This video is unavailable.');
   const headers=new Headers({'Content-Type':entry.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline','Accept-Ranges':'bytes','Cross-Origin-Resource-Policy':'same-origin'});for(const name of ['Content-Length','Content-Range'])if(media.headers.has(name))headers.set(name,media.headers.get(name));
   return new Response(request.method==='HEAD'?null:media.body,{status:media.status,headers});
  }
  if(path.startsWith('/api/'))throw fail(404,'Not found.');
  if(!['GET','HEAD'].includes(request.method))throw fail(405,'Method not allowed.');
  if(/^\/(play\/[^/]+|gallery|library|shared|clips\/[^/]+)\/?$/.test(path))return env.ASSETS.fetch(new Request(new URL('/',url),request));
  const runtime=/^\/games\/(?:motion-quest|dino-run|dino-ar|plank-flight|camera-start)\/runtime\/(.+)$/.exec(path);
  if(runtime)return env.ASSETS.fetch(new Request(new URL('/runtime/'+runtime[1],url),request));
  return env.ASSETS.fetch(request);
 }
 return {async fetch(request,env){try{return await routes(request,env);}catch(error){return json({error:error.status?error.message:'The gallery is unavailable. Please try again later.'},error.status||503);}}};
}
export default createWorker();
