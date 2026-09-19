import {mkdir,readFile,readdir,open,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY=86400000;
const fail=(status,message)=>Object.assign(Error(message),{status});
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const hash=value=>createHash('sha256').update(value).digest('hex');
async function bodyJSON(request){
 const reader=request.body?.getReader();if(!reader)throw fail(400,'A session is required.');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw fail(413,'Session too large.');}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail(400,'Invalid JSON.');}
}
export function createPlayStats({directory,origin,games,getUser=async()=>null,adminEmails='',now=Date.now}){
 const root=path.join(directory,'play-sessions'),allowed=new Map(games.map(g=>[g.id,g]));
 const admins=new Set(adminEmails.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
 let queue=Promise.resolve();
 const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 async function save(body,request){
  if(!body||!UUID.test(body.id||'')||!UUID.test(body.playerId||'')||!allowed.has(body.gameId))throw fail(400,'Invalid session or game.');
  if(body.version!==1||!Number.isSafeInteger(body.sequence)||body.sequence<1||body.sequence>100000)throw fail(400,'Invalid sequence.');
  if(!Number.isSafeInteger(body.startedAt)||Math.abs(body.startedAt-now())>7*DAY||!Number.isSafeInteger(body.updatedAt)||body.updatedAt<body.startedAt||body.updatedAt>now()+60000||body.updatedAt-body.startedAt>DAY)throw fail(400,'Invalid session time.');
  if(!Number.isSafeInteger(body.activeMs)||body.activeMs<0||body.activeMs>body.updatedAt-body.startedAt+1000)throw fail(400,'Invalid active time.');
  if(!['camera','replay','synthetic','unknown'].includes(body.inputSource)||![null,'completed','stopped','left','restarted'].includes(body.endReason))throw fail(400,'Invalid session state.');
  const user=await getUser(request),deviceId=hash(body.playerId);
  return serial(async()=>{
   const day=new Date(body.startedAt).toISOString().slice(0,10),folder=path.join(root,day),target=path.join(folder,body.id+'.json');
   await mkdir(folder,{recursive:true,mode:0o700});
   let previous;try{previous=JSON.parse(await readFile(target,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
   if(previous){
    if(previous.deviceId!==deviceId||previous.gameId!==body.gameId||previous.startedAt!==body.startedAt)throw fail(409,'Session mismatch.');
    if(body.sequence<=previous.sequence||previous.endReason)return json({ok:true});
    if(body.activeMs<previous.activeMs||body.updatedAt<previous.updatedAt)throw fail(409,'Session time cannot decrease.');
   }else if((await readdir(folder)).length>=10000)throw fail(429,'Daily session limit reached.');
   const record={version:1,id:body.id,gameId:body.gameId,deviceId,playerId:previous?.playerId||(user?.userId?hash('account:'+user.userId):deviceId),identity:previous?.identity||(user?.userId?'account':'device'),startedAt:body.startedAt,updatedAt:body.updatedAt,receivedAt:now(),activeMs:body.activeMs,sequence:body.sequence,inputSource:body.inputSource,endReason:body.endReason};
   const temp=target+'.'+randomUUID();const file=await open(temp,'wx',0o600);
   try{await file.writeFile(JSON.stringify(record)+'\n');await file.sync();}finally{await file.close();}
   try{await rename(temp,target);const dir=await open(folder,'r');try{await dir.sync();}finally{await dir.close();}}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
   return json({ok:true},201);
  });
 }
 async function report(url,request){
  const user=await getUser(request);if(!user)return json({error:'Log in to view game statistics.'},401);
  if(!admins.has(user.email?.toLowerCase()))return json({error:'This account is not a statistics administrator.'},403);
  const from=url.searchParams.get('from')||new Date(now()-6*DAY).toISOString().slice(0,10),to=url.searchParams.get('to')||new Date(now()).toISOString().slice(0,10);
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  if(!date(from)||!date(to)||to<from||Date.parse(to)-Date.parse(from)>30*DAY)throw fail(400,'Choose up to 31 UTC days.');
  const gameId=url.searchParams.get('game')||'',source=url.searchParams.get('source')||'';
  if(gameId&&!allowed.has(gameId)||source&&!['camera','synthetic','replay','unknown'].includes(source))throw fail(400,'Invalid filter.');
  const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0)throw fail(400,'Invalid page.');
  const rows=[];
  for(let time=Date.parse(from);time<=Date.parse(to);time+=DAY){
   const folder=path.join(root,new Date(time).toISOString().slice(0,10));let files;try{files=await readdir(folder);}catch(e){if(e.code==='ENOENT')continue;throw e;}
   for(const filename of files.filter(f=>UUID.test(f.slice(0,-5))&&f.endsWith('.json'))){const row=JSON.parse(await readFile(path.join(folder,filename),'utf8'));if((!gameId||row.gameId===gameId)&&(!source||row.inputSource===source))rows.push(row);}
  }
  const summary=games.filter(g=>!gameId||g.id===gameId).map(game=>{const items=rows.filter(r=>r.gameId===game.id);return {gameId:game.id,title:game.title,players:new Set(items.map(r=>r.playerId)).size,sessions:items.length,activeMs:items.reduce((sum,r)=>sum+r.activeMs,0)};});
  rows.sort((a,b)=>b.startedAt-a.startedAt||a.id.localeCompare(b.id));
  const sessions=rows.slice(offset,offset+100).map(({deviceId,sequence,...row})=>({...row,status:row.endReason||(now()-row.receivedAt>45000?'interrupted':'active'),endedAt:row.endReason?row.updatedAt:null}));
  return json({from,to,total:rows.length,offset,nextOffset:offset+100<rows.length?offset+100:null,summary,sessions});
 }
 return {async handle(request){const url=new URL(request.url);
  if(url.pathname==='/api/admin/game-stats'){if(request.method!=='GET')return json({error:'Method not allowed.'},405);return report(url,request);}
  if(url.pathname!=='/api/play-sessions')return null;
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(request.headers.get('Origin')!==origin)throw fail(403,'Same-origin requests required.');
  if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')throw fail(415,'JSON required.');
  return save(await bodyJSON(request),request);
 }};
}
