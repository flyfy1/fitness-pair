import {isPlayableGame} from '../game-catalog.js';
const MAX_POSTER_BYTES=256*1024;
const MAX_BYTES=200_000_000, ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const fail=(status,message)=>Object.assign(new Error(message),{status});
const enc=new TextEncoder();
const tooLarge=(bytes,source)=>Object.assign(fail(413,'This video exceeds the 200 MB upload limit. Make a smaller copy, then try again.'),{uploadRejection:{bytes,source}});
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
async function equal(a,b){const x=await digest(a||''),y=await digest(b||'');let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0;}
const storageEnabled=env=>!!(env.GCP_BUCKET&&(env.GCP_SERVICE_ACCOUNT_JSON||typeof env.GCP_ACCESS_TOKEN_PROVIDER==='function'));
const enabled=env=>storageEnabled(env)&&!!env.ACCOUNTS;
export function validateUpload(request,url){
 const visibility=url.searchParams.get('visibility')||'public';
 const retention=url.searchParams.get('retention')||'7';
 if(!['1','7','30','90','never'].includes(retention))throw fail(400,'Choose a supported sharing expiry.');
 if(!['public','private'].includes(visibility))throw fail(400,'Choose public or private visibility.');
 // Older public-only gateways reject private-v1 instead of publishing it publicly.
 if(request.headers.get('X-Sharing-Consent')!==(visibility==='private'?'private-v1':'gallery-v1'))throw fail(400,'Confirm the selected visibility before uploading.');
 const title=(url.searchParams.get('title')||'').trim(),source=url.searchParams.get('source'),game=url.searchParams.get('game'),duration=Number(url.searchParams.get('duration'));
 const mime=(request.headers.get('Content-Type')||'').split(';')[0];
 if(!title||title.length>90||/[\x00-\x1f]/.test(title))throw fail(400,'Use a title of 1–90 characters.');
 if(!['replay','synthetic'].includes(source)||!isPlayableGame(game))throw fail(400,'Unknown game or recording source.');
 if(!Number.isFinite(duration)||duration<=0||duration>90)throw fail(400,'Record a clip of 90 seconds or less.');
 if(!['video/mp4','video/webm'].includes(mime))throw fail(415,'Use an MP4 or WebM recording.');
 const length=request.headers.get('Content-Length');if(length!==null){const bytes=Number(length);if(!Number.isSafeInteger(bytes)||bytes<=0)throw fail(400,'Use a nonempty video with a valid size.');if(bytes>MAX_BYTES)throw tooLarge(bytes,'server-header');}
 return {title,source,game,duration,mime,visibility,retention};
}
async function readBounded(request,maxBytes=MAX_BYTES){
 if(!request.body)throw fail(400,'Empty recording.');const reader=request.body.getReader(),chunks=[];let total=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes){await reader.cancel().catch(()=>{});throw maxBytes===MAX_BYTES?tooLarge(total,'server-body'):fail(413,'Media exceeds its size limit.');}chunks.push(value);}}finally{reader.releaseLock();}
 if(total<12)throw fail(415,'This recording is too short to be a video.');const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
function publicClip(record){const {id,title,source,game,duration,mime,createdAt,expiresAt,bytes}=record;return {id,title,source,game,duration,mime,createdAt,expiresAt,bytes,visibility:record.visibility||'public',url:'/clips/'+id+(record.visibility==='private'?(record.shareToken?'?share='+record.shareToken:new URL(record.url||'/', 'https://arcade.invalid').search):'')};}
export function createWorker({fetcher=fetch,now=()=>Date.now(),audit=event=>console.info(JSON.stringify(event))}={}){
 let tokenCache=null,uploadBusy=false,anonymousInventory=null;
 function reportRejection(bytes,source){audit({event:'video_upload_rejected',timestamp:new Date(now()).toISOString(),reason:'file_too_large',bytes,limitBytes:MAX_BYTES,source});}
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
 async function gcp(env,name,{method='GET',body,mime,query='',range,expiresAt}={}){
  const bucket=encodeURIComponent(env.GCP_BUCKET),object=encodeURIComponent(name);
  const finite=method==='POST'&&Number.isSafeInteger(expiresAt);
  const url=method==='POST'?`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=${finite?'multipart':'media'}&ifGenerationMatch=0&name=${object}`:`https://storage.googleapis.com/storage/v1/b/${bucket}/o${name?'/'+object:''}${query}`;
  const headers={Authorization:'Bearer '+await accessToken(env)};if(mime)headers['Content-Type']=mime;if(range)headers.Range=range;
  if(finite){
   // Save expiry and bytes atomically, including staged anonymous uploads.
   const boundary='hopmodo-'+crypto.randomUUID();
   const metadata=JSON.stringify({name,contentType:mime,customTime:new Date(expiresAt).toISOString()});
   const prefix=enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),suffix=enc.encode(`\r\n--${boundary}--\r\n`),bytes=typeof body==='string'?enc.encode(body):body;
   // Stream multipart framing without making another full 200 MB copy.
   let offset=0,started=false;
   body=new ReadableStream({pull(controller){if(!started){started=true;controller.enqueue(prefix);}else if(offset<bytes.length){const end=Math.min(offset+1024*1024,bytes.length);controller.enqueue(bytes.subarray(offset,end));offset=end;}else{controller.enqueue(suffix);controller.close();}}});
   headers['Content-Type']='multipart/related; boundary='+boundary;
   headers['Content-Length']=String(prefix.length+bytes.length+suffix.length);
  }
  const response=await fetcher(url,{method,headers,body,...(finite?{duplex:'half'}:{}),signal:AbortSignal.timeout(method==='POST'?120000:30000),redirect:'error'});
  return response;
 }
 async function record(env,id){const response=await gcp(env,`gallery/${id}.json`,{query:'?alt=media'});if(response.status===404)throw fail(404,'This clip has expired or was removed.');if(!response.ok)throw fail(503,'The gallery is unavailable. Try again shortly.');const data=await response.json();if(data.id!==id||!ID.test(data.id)||(data.expiresAt!==null&&data.expiresAt<=now()))throw fail(404,'This clip has expired or was removed.');return data;}
 // Import older ownerless publications before admitting anonymous uploads. Failed
 // reservations remain in the ledger until deletion or expiry, including after restart.
 async function anonymousQuota(env){
  if(!anonymousInventory){
   anonymousInventory=(async()=>{
    const imported=[];let page='';const seen=new Set();
    do{
     if(seen.has(page))throw fail(503,'Anonymous storage inventory is unavailable.');seen.add(page);
     const response=await gcp(env,'',{query:'?prefix=gallery%2F&maxResults=100'+(page?'&pageToken='+encodeURIComponent(page):'')});
     if(!response.ok)throw fail(503,'Anonymous storage inventory is unavailable.');
     const listing=await response.json();
     for(const item of listing.items||[]){
      if(!/^gallery\/[0-9a-f-]+\.json$/.test(item.name))continue;
      try{const clip=await record(env,item.name.slice(8,-5));if(!clip.ownerId)imported.push({...publicClip(clip),keyHash:clip.keyHash});}
      catch(error){if(error.status!==404)throw error;}
     }
     page=listing.nextPageToken||'';
    }while(page);
    await env.ACCOUNTS.syncAnonymous(imported);
   })().catch(error=>{anonymousInventory=null;throw error;});
  }
  await anonymousInventory;
  const {usedBytes,limitBytes}=await env.ACCOUNTS.list(null);return {usedBytes,limitBytes};
 }
 async function writeUser(request,env,url){
  const user=await env.ACCOUNTS.user(request);
  if(user)return env.ACCOUNTS.requireUser(request,true);
  // An expired signed-in attempt must never silently publish anonymously.
  if(request.headers.get('X-CSRF-Token'))throw fail(401,'Log in again before publishing this clip.');
  if(request.headers.get('Origin')!==url.origin)throw fail(403,'Publish or remove clips from the arcade website.');
  return null;
 }
 async function manageAnonymous(request,entry){
  const key=(request.headers.get('Authorization')||'').replace(/^Bearer /,'')||request.headers.get('X-Management-Key')||'';
  if(!entry.keyHash||!await equal(await digest(key),entry.keyHash))throw fail(403,'Use the device that published this clip to manage it.');
 }
 async function routes(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/config'&&request.method==='GET')return json({sharingEnabled:enabled(env),...(enabled(env)?{maxUploadBytes:MAX_BYTES,retentionOptions:['1','7','30','90','never'],anonymous:{...await anonymousQuota(env),replacement:'oldest'}}:{})});
  if(path==='/api/upload-rejections'&&request.method==='POST'){
   if(!enabled(env))throw fail(503,'Sharing is unavailable.');
   await writeUser(request,env,url);
   let report;try{report=JSON.parse(new TextDecoder().decode(await readBounded(request,1024)));}catch{throw fail(400,'Invalid upload report.');}
   if(!Number.isSafeInteger(report?.bytes)||report.bytes<=MAX_BYTES||report.reason!=='file_too_large')throw fail(400,'Invalid upload report.');
   reportRejection(report.bytes,'client-reported');return json({recorded:true});
  }
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
   const clips=settled.filter(r=>r.status==='fulfilled'&&r.value.visibility!=='private').map(r=>publicClip(r.value)).sort((a,b)=>b.createdAt-a.createdAt);return json({enabled:true,clips,nextPageToken:listing.nextPageToken||null});
  }
  const match=/^\/api\/(clips|media|posters)\/([^/]+)$/.exec(path);
  if(match){
   const [,kind,id]=match;if(!ID.test(id))throw fail(404,'Clip not found.');if(!storageEnabled(env))throw fail(503,'Community publishing is being connected. Your local clips remain on this device.');
   if(['PUT','DELETE'].includes(request.method)){const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)throw fail(403,'Publish or remove clips from the arcade website.');}
   if(request.method==='DELETE'&&uploadBusy)throw fail(429,'An upload is finishing. Please retry removal shortly.');
   if(kind==='clips'&&request.method==='PUT'){
    if(!enabled(env))throw fail(503,'Log in is being connected. Your local clips remain on this device.');
    const user=await writeUser(request,env,url);
    const info=validateUpload(request,url);
    if(!user&&info.visibility!=='public')throw fail(403,'Log in to upload a private clip.');
    if(!user&&info.retention!=='7')throw fail(403,'Anonymous shares expire after 7 days. Log in to choose another expiry.');
    const managementKey=request.headers.get('X-Management-Key')||'';
    if(!user&&!/^[A-Za-z0-9_-]{32,128}$/.test(managementKey))throw fail(400,'A device management key is required for anonymous uploads.');if(uploadBusy)throw fail(429,'Another clip is uploading. Please retry shortly.');uploadBusy=true;
    try{
     try{const existing=await record(env,id);if(existing.ownerId){if(existing.ownerId!==user?.userId)throw fail(409,'This clip was published by another account.');}else await manageAnonymous(request,existing);return json(publicClip(existing));}catch(error){if(error.status!==404)throw error;}
     // The host may provide a verified private GCS object; this is never a request field.
     const prepared=env.PREPARED_UPLOAD?.id===id?env.PREPARED_UPLOAD:null;
     const body=prepared?prepared.head:await readBounded(request);const valid=info.mime==='video/webm'?body[0]===26&&body[1]===69&&body[2]===223&&body[3]===163:String.fromCharCode(...body.slice(4,8))==='ftyp';if(!valid)throw fail(415,'The recording does not match its video format.');
     const createdAt=now();
     const entry={...info,id,createdAt,expiresAt:info.retention==='never'?null:createdAt+Number(info.retention)*86400000,bytes:prepared?prepared.bytes:body.length,ownerId:user?.userId||null,...(!user?{keyHash:await digest(managementKey)}:{}),...(info.visibility==='private'?{shareToken:base64(crypto.getRandomValues(new Uint8Array(32)))}:{})};
     let victims=[],reserved=false,staged=false;
     if(!user){await anonymousQuota(env);victims=await env.ACCOUNTS.anonymousEvictions(entry);}
     else{await env.ACCOUNTS.reserve(entry.ownerId,publicClip(entry));reserved=true;}
     try{
      // New bytes must be durable before any older anonymous publication is revoked.
      staged=!user;
      const upload=prepared?await prepared.upload(entry):await gcp(env,`videos/${id}`,{method:'POST',body,mime:info.mime,expiresAt:entry.expiresAt});
      if(upload.status===412)staged=false;
      if(!upload.ok)throw fail(503,'Upload did not finish. Check your shared clips before retrying.');staged=true;
      for(const victim of victims){
       try{const previous=await record(env,victim);if(previous.ownerId)throw fail(503,'Anonymous storage ownership could not be verified.');}
       catch(error){if(error.status!==404)throw error;}
       for(const name of [`gallery/${victim}.json`,`videos/${victim}`,`videos/${victim}.jpg`]){
        const removed=await gcp(env,name,{method:'DELETE'});
        if(!removed.ok&&removed.status!==404)throw fail(503,'Could not free anonymous storage. Please retry shortly.');
       }
       await env.ACCOUNTS.release(null,victim);
      }
      if(!user){await env.ACCOUNTS.reserve(null,{...publicClip(entry),keyHash:entry.keyHash});reserved=true;}
      const marker=await gcp(env,`gallery/${id}.json`,{method:'POST',body:JSON.stringify(entry),mime:'application/json',expiresAt:entry.expiresAt});
      if(!marker.ok)throw fail(503,'Publication did not finish. Check My shared clips before retrying.');
     }catch(error){
      if(!user&&!reserved&&staged)await gcp(env,`videos/${id}`,{method:'DELETE'}).catch(()=>{});
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
    const user=await writeUser(request,env,url);
    let ownerId=user?.userId||null,account=await env.ACCOUNTS.list(ownerId),pending=account.clips.find(clip=>clip.id===id);
    if(!pending&&user){ownerId=null;account=await env.ACCOUNTS.list(null);pending=account.clips.find(clip=>clip.id===id);}
    if(!pending)throw error;
    if(ownerId===null)await manageAnonymous(request,pending);
    const media=await gcp(env,`videos/${id}`,{method:'DELETE'});
    if(!media.ok&&media.status!==404)throw fail(503,'Could not remove this upload. Please retry.');
    const poster=await gcp(env,`videos/${id}.jpg`,{method:'DELETE'});
    if(!poster.ok&&poster.status!==404)throw fail(503,'Could not remove the thumbnail. Please retry.');
    await env.ACCOUNTS.release(ownerId,id);return json({removed:true});
   }
   if(kind==='clips'&&request.method==='DELETE'){
    if(entry.ownerId){
     if(!env.ACCOUNTS)throw fail(503,'Account sharing is unavailable.');
     const user=await env.ACCOUNTS.requireUser(request,true);
     if(entry.ownerId!==user.userId)throw fail(403,'Only the account that published this clip can remove it.');
    }else{
     await manageAnonymous(request,entry);
    }
    const result=await gcp(env,`gallery/${id}.json`,{method:'DELETE'});if(!result.ok&&result.status!==404)throw fail(503,'Could not remove this clip. Please retry.');
    const media=await gcp(env,`videos/${id}`,{method:'DELETE'});
    if(!media.ok&&media.status!==404)throw fail(503,'The link was removed. Retry removal in My shared clips to release its storage.');
    const poster=await gcp(env,`videos/${id}.jpg`,{method:'DELETE'});
    if(!poster.ok&&poster.status!==404)throw fail(503,'Could not remove the thumbnail. Please retry removal.');
    if(env.ACCOUNTS)await env.ACCOUNTS.release(entry.ownerId||null,id);
    return json({removed:true});
   }
   if(kind==='posters'&&request.method==='PUT'){
    if(!enabled(env))throw fail(503,'Account sharing is unavailable.');
    if(entry.ownerId){const user=await env.ACCOUNTS.requireUser(request,true);if(entry.ownerId!==user.userId)throw fail(403,'Only the publishing account can add this thumbnail.');}
    else{await writeUser(request,env,url);await manageAnonymous(request,entry);}
    if(request.headers.get('X-Sharing-Consent')!=='gallery-v1')throw fail(400,'Confirm sharing before uploading a thumbnail.');
    if(request.headers.get('Content-Type')!=='image/jpeg')throw fail(415,'Use a JPEG thumbnail.');
    const length=Number(request.headers.get('Content-Length'));
    if(length>MAX_POSTER_BYTES)throw fail(413,'Thumbnail must be no larger than 256 KiB.');
    if(uploadBusy)throw fail(429,'An upload is finishing. Please retry shortly.');uploadBusy=true;
    try{
     const body=await readBounded(request,MAX_POSTER_BYTES);
     if(body[0]!==255||body[1]!==216||body.at(-2)!==255||body.at(-1)!==217)throw fail(415,'The thumbnail is not a JPEG.');
     const response=await gcp(env,`videos/${id}.jpg`,{method:'POST',body,mime:'image/jpeg',expiresAt:entry.expiresAt});
     if(!response.ok&&response.status!==412)throw fail(503,'Video published, but its thumbnail could not be saved. Retry publishing to finish it.');
     // A concurrent removal must not leave a newly written poster available.
     try{await record(env,id);}catch(error){if(error.status===404)await gcp(env,`videos/${id}.jpg`,{method:'DELETE'});throw error;}
     return json({url:'/api/posters/'+id},response.status===412?200:201);
    }finally{uploadBusy=false;}
   }
   if(!['GET','HEAD'].includes(request.method))throw fail(405,'Method not allowed.');
   const user=env.ACCOUNTS?await env.ACCOUNTS.user(request):null;
   if(entry.visibility==='private'&&(!user||entry.ownerId!==user.userId)&&(!entry.shareToken||!await equal(url.searchParams.get('share'),entry.shareToken)))throw fail(404,'Clip not found.');
   if(kind==='clips'){
    return json({...publicClip(entry),canDelete:!!(user&&entry.ownerId===user.userId),legacy:!entry.ownerId});
   }
   const range=request.headers.get('Range');if(range&&!/^bytes=(\d+-\d*|-\d+)$/.test(range))throw fail(416,'Invalid byte range.');
   const poster=kind==='posters';
   const media=await gcp(env,`videos/${id}${poster?'.jpg':''}`,{query:'?alt=media',range});if(![200,206,416].includes(media.status))throw fail(404,'This video is unavailable.');
   const headers=new Headers({'Content-Type':poster?'image/jpeg':entry.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Disposition':'inline','Accept-Ranges':'bytes','Cross-Origin-Resource-Policy':'same-origin'});for(const name of ['Content-Length','Content-Range'])if(media.headers.has(name))headers.set(name,media.headers.get(name));
   return new Response(request.method==='HEAD'?null:media.body,{status:media.status,headers});
  }
  if(path.startsWith('/api/'))throw fail(404,'Not found.');
  if(!['GET','HEAD'].includes(request.method))throw fail(405,'Method not allowed.');
  if(/^\/(play\/[^/]+|gallery|library|shared|clips\/[^/]+)\/?$/.test(path))return env.ASSETS.fetch(new Request(new URL('/',url),request));
  const runtime=/^\/games\/([^/]+)\/runtime\/(.+)$/.exec(path);
  if(runtime&&isPlayableGame(runtime[1]))return env.ASSETS.fetch(new Request(new URL('/runtime/'+runtime[2],url),request));
  return env.ASSETS.fetch(request);
 }
 return {async fetch(request,env){try{return await routes(request,env);}catch(error){if(error.uploadRejection)reportRejection(error.uploadRejection.bytes,error.uploadRejection.source);return json({error:error.status?error.message:'The gallery is unavailable. Please try again later.'},error.status||503);}}};
}
export default createWorker();
