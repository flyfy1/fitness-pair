import {createReadStream} from 'node:fs';
import {mkdir,open,readFile,readdir,link,unlink,rename,stat} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import path from 'node:path';
import {assertPoseFrame,sameSource} from '../../../../contracts/index.js';

const JSON_LIMIT=16*1024*1024;
export const DEBUG_VIDEO_LIMIT=105*1024*1024;
export const DEBUG_RETENTION_MS=30*86400000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers={'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const fail=(status,message)=>Object.assign(new Error(message),{status});
const text=(value,limit)=>typeof value==='string'&&value.length<=limit?value:null;

async function readJSON(request){
 const declared=Number(request.headers.get('Content-Length'));
 if(Number.isFinite(declared)&&declared>JSON_LIMIT)throw fail(413,'Diagnostic data is too large.');
 if(!request.body)throw fail(400,'Diagnostic data is required.');
 const chunks=[];let bytes=0;
 for await(const chunk of request.body){bytes+=chunk.byteLength;if(bytes>JSON_LIMIT)throw fail(413,'Diagnostic data is too large.');chunks.push(Buffer.from(chunk));}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(400,'Diagnostic data must be valid JSON.');}
}
function refererPath(request,origin){
 const raw=request.headers.get('Referer');if(!raw)return null;
 try{const url=new URL(raw);return text(url.origin===origin?url.pathname:url.origin,512);}catch{return null;}
}
function validateTracking(tracking,sessionId,gameId){
 if(tracking===null)return null;
 if(tracking?.format!=='fitness-pair/tracking-session/1'||tracking.sessionId!==sessionId||tracking.game!==gameId||tracking.source?.kind!=='camera'||!text(tracking.source.id,160)||!text(tracking.createdAt,50)||!Number.isFinite(Date.parse(tracking.createdAt))||!Array.isArray(tracking.samples)||tracking.samples.length>3000)throw fail(400,'Invalid movement tracking data.');
 if(!Number.isFinite(tracking.video?.startTMs)||!Number.isFinite(tracking.video?.durationMs)||tracking.video.durationMs<=0||tracking.video.durationMs>90500)throw fail(400,'Invalid movement tracking window.');
 let previous=-Infinity;
 for(const sample of tracking.samples){
  if(!Number.isFinite(sample?.videoMs)||sample.videoMs<previous)throw fail(400,'Invalid movement tracking timeline.');
  try{assertPoseFrame(sample.pose);}catch{throw fail(400,'Invalid movement tracking frame.');}
  if(sample.pose.sessionId!==sessionId||!sameSource(sample.pose.source,tracking.source))throw fail(400,'Movement tracking does not match the game session.');
  previous=sample.videoMs;
 }
 return {format:tracking.format,sessionId,createdAt:tracking.createdAt,game:gameId,source:tracking.source,video:tracking.video,samples:tracking.samples};
}
function validateReport(body,allowed,now){
 const game=allowed.get(body?.gameId);
 if(body?.version!==1||!UUID.test(body?.id||'')||!game)throw fail(400,'Unknown game or diagnostic report.');
 if(body.consent!=='debug-data-v1'||!['button','voice'].includes(body.trigger)||typeof body.includeVideo!=='boolean')throw fail(400,'Confirm this diagnostic upload.');
 if(!Number.isSafeInteger(body.requestedAt)||Math.abs(body.requestedAt-now)>7*86400000)throw fail(400,'Invalid diagnostic time.');
 if(body.sourcePage!==`/play/${game.id}`||!UUID.test(body.sessionId||''))throw fail(400,'Invalid game session.');
 const clip=body.clip;
 if(!clip||!UUID.test(clip.id||'')||clip.sessionId!==body.sessionId||!Number.isSafeInteger(clip.createdAt)||!Number.isFinite(clip.duration)||clip.duration<=0||clip.duration>90.5)throw fail(400,'Invalid diagnostic recording.');
 if(!Number.isSafeInteger(clip.width)||clip.width<=0||clip.width>8192||!Number.isSafeInteger(clip.height)||clip.height<=0||clip.height>8192||!Number.isSafeInteger(clip.bytes)||clip.bytes<=0||clip.bytes>200_000_000)throw fail(400,'Invalid diagnostic recording size.');
 const mime=text(clip.mime,120)?.split(';',1)[0];
 if(!['video/mp4','video/webm'].includes(mime)||!['replay','synthetic'].includes(clip.source))throw fail(400,'Invalid diagnostic recording type.');
 const input=clip.inputSource;
 if(input!==null&&(!['camera','replay','synthetic'].includes(input?.kind)||!text(input.id,160)))throw fail(400,'Invalid diagnostic input source.');
 const state=body.gameState;
 if(!state||!['setup','playing','paused','ending','complete','idle',null].includes(state.phase)||state.score!==null&&!text(state.score,160))throw fail(400,'Invalid diagnostic game state.');
 const client=body.client,viewport=client?.viewport;
 if(client?.locale!==null&&!text(client.locale,40)||!Number.isSafeInteger(viewport?.width)||viewport.width<=0||viewport.width>10000||!Number.isSafeInteger(viewport?.height)||viewport.height<=0||viewport.height>10000||!Number.isFinite(client?.devicePixelRatio)||client.devicePixelRatio<=0||client.devicePixelRatio>10)throw fail(400,'Invalid diagnostic client details.');
 const source=state.source;
 if(source!==null&&(!['camera','replay','synthetic'].includes(source?.kind)||!text(source.id,160)))throw fail(400,'Invalid diagnostic game source.');
 const round=state.round===null?null:text(state.round,160);if(state.round!==null&&!round)throw fail(400,'Invalid diagnostic round.');
 return {game,tracking:validateTracking(body.tracking,body.sessionId,game.id),
  clip:{id:clip.id,sessionId:clip.sessionId,createdAt:clip.createdAt,duration:clip.duration,width:clip.width,height:clip.height,bytes:clip.bytes,mime,source:clip.source,inputSource:input,stopReason:clip.stopReason===null?null:text(clip.stopReason,160),finalScore:clip.finalScore===null?null:text(clip.finalScore,160)},
  gameState:{phase:state.phase,score:state.score,round,source},client:{locale:client.locale,viewport:{width:viewport.width,height:viewport.height},devicePixelRatio:client.devicePixelRatio}};
}
async function writeNew(target,value){
 const temporary=target+'.'+randomBytes(8).toString('hex');const file=await open(temporary,'wx',0o600);
 try{await file.writeFile(JSON.stringify(value)+'\n');await file.sync();}finally{await file.close();}
 try{await link(temporary,target);return value;}catch(error){if(error.code!=='EEXIST')throw error;return JSON.parse(await readFile(target,'utf8'));}finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
async function replaceJSON(target,value){
 const temporary=target+'.'+randomBytes(8).toString('hex');const file=await open(temporary,'wx',0o600);
 try{await file.writeFile(JSON.stringify(value)+'\n');await file.sync();}finally{await file.close();}
 await rename(temporary,target);
}
async function fileHash(filename){const hash=createHash('sha256');for await(const chunk of createReadStream(filename))hash.update(chunk);return hash.digest('hex');}

export function createDebugReportCollector({directory,origin,games,release={},getUser=async()=>null,now=Date.now}={}){
 if(!directory)throw Error('A durable diagnostic directory is required.');
 const allowed=new Map(games.map(game=>[game.id,game]));
 const root=path.join(directory,'debug-reports'),events=path.join(root,'events'),videos=path.join(root,'videos');
 async function prune(){
  let names;try{names=await readdir(events);}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const name of names){
   if(!UUID.test(name.replace(/\.json$/,''))||!name.endsWith('.json'))continue;
   const target=path.join(events,name);let record;try{record=JSON.parse(await readFile(target,'utf8'));}catch{continue;}
   if(!Number.isFinite(record.expiresAt)||record.expiresAt>now())continue;
   const id=name.slice(0,-5);for(const extension of ['.mp4','.webm'])await unlink(path.join(videos,id+extension)).catch(error=>{if(error.code!=='ENOENT')throw error;});
   await unlink(target).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
 }
 async function uploadVideo(request,id){
  if(request.headers.get('Origin')!==origin)throw fail(403,'Debug uploads must come from this website.');
  if(request.headers.get('X-Debug-Video-Consent')!=='debug-video-v1')throw fail(400,'Confirm the diagnostic video upload.');
  const targetRecord=path.join(events,id+'.json');let record;
  try{record=JSON.parse(await readFile(targetRecord,'utf8'));}catch(error){if(error.code==='ENOENT')throw fail(404,'Diagnostic report not found.');throw error;}
  if(!record.includeVideo)throw fail(409,'This report did not request a video.');
  const mime=(request.headers.get('Content-Type')||'').split(';',1)[0];if(!['video/mp4','video/webm'].includes(mime))throw fail(415,'Use an MP4 or WebM diagnostic video.');
  if(record.clip.mime!==mime)throw fail(415,'Diagnostic video type does not match the report.');
  const length=request.headers.get('Content-Length'),declared=length===null?null:Number(length);if(declared!==null&&(!Number.isSafeInteger(declared)||declared<=0||declared>DEBUG_VIDEO_LIMIT))throw fail(413,'Diagnostic video exceeds the 105 MiB limit.');
  if(!request.body)throw fail(400,'Diagnostic video is required.');
  await mkdir(videos,{recursive:true,mode:0o700});
  const extension=mime==='video/mp4'?'.mp4':'.webm',target=path.join(videos,id+extension),temporary=target+'.'+randomBytes(8).toString('hex');
  const file=await open(temporary,'wx',0o600),hash=createHash('sha256'),head=[];let bytes=0,complete=false;
  try{
   for await(const chunk of request.body){bytes+=chunk.byteLength;if(bytes>DEBUG_VIDEO_LIMIT)throw fail(413,'Diagnostic video exceeds the 105 MiB limit.');if(head.reduce((sum,item)=>sum+item.length,0)<12)head.push(Buffer.from(chunk).subarray(0,12));hash.update(chunk);await file.write(chunk);}
   if(!bytes)throw fail(400,'Diagnostic video is empty.');
   const prefix=Buffer.concat(head).subarray(0,12),valid=mime==='video/webm'?prefix.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])):prefix.subarray(4,8).toString('ascii')==='ftyp';
   if(!valid)throw fail(415,'Diagnostic video contents do not match the selected format.');
   await file.sync();complete=true;
  }finally{await file.close();if(!complete)await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  const digest=hash.digest('hex');let linked=false;
  try{await link(temporary,target);linked=true;}catch(error){if(error.code!=='EEXIST')throw error;}finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  if(!linked){const info=await stat(target);if(info.size!==bytes||await fileHash(target)!==digest)throw fail(409,'A different video already exists for this report.');}
  record={...record,video:{status:'ready',mime,bytes,sha256:digest,storedAt:now()}};await replaceJSON(targetRecord,record);
  return json({ok:true,id,video:{bytes,mime}},linked?201:200);
 }
 return {prune,async handle(request){
  const url=new URL(request.url),match=/^\/api\/debug-reports\/([0-9a-f-]+)\/video$/.exec(url.pathname);
  if(match){if(request.method!=='PUT')return json({error:'Method not allowed.'},405);if(!UUID.test(match[1]))throw fail(404,'Diagnostic report not found.');return uploadVideo(request,match[1]);}
  if(url.pathname!=='/api/debug-reports')return null;
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(request.headers.get('Origin')!==origin)throw fail(403,'Debug uploads must come from this website.');
  if(request.headers.get('Content-Type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')throw fail(415,'Diagnostic data must use JSON.');
  await prune();
  const body=await readJSON(request),{game,tracking,clip,gameState,client}=validateReport(body,allowed,now());
  await mkdir(events,{recursive:true,mode:0o700});
  const session=await getUser(request);
  const receivedAt=now();const record={version:1,id:body.id,consent:'debug-data-v1',trigger:body.trigger,includeVideo:body.includeVideo,requestedAt:body.requestedAt,receivedAt,expiresAt:receivedAt+DEBUG_RETENTION_MS,
   game:{id:game.id,title:game.title},sourcePage:body.sourcePage,sessionId:body.sessionId,gameState,
   clip,tracking,client,video:{status:body.includeVideo?'pending':'not-requested'},
   request:{origin,referer:refererPath(request,origin),userAgent:text(request.headers.get('User-Agent'),1024),secFetchSite:text(request.headers.get('Sec-Fetch-Site'),32)},
   user:session?{id:session.userId,email:session.email}:null,
   serviceRelease:{commit:text(release.commit,160),builtAt:text(release.builtAt,80)}};
  const saved=await writeNew(path.join(events,record.id+'.json'),record);
  return json({ok:true,id:saved.id,receivedAt:saved.receivedAt,video:saved.video},saved===record?201:200);
 }};
}
