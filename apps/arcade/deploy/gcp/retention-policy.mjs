import {isDeepStrictEqual} from 'node:util';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const BUCKET='project-e8ef2daf-0520-4018-b9f-fitness-sharing';
const prefixes=['gallery/','videos/'];
export function retentionRules(existing=[]){
 const retained=[];
 for(const rule of existing){
  const condition=rule.condition||{},matches=condition.matchesPrefix||[];
  const affects=rule.action?.type==='Delete'&&(!matches.length||matches.some(p=>prefixes.some(ours=>ours.startsWith(p)||p.startsWith(ours))));
  if(!affects){retained.push(rule);continue;}
  const exact=matches.length===2&&prefixes.every(p=>matches.includes(p));
  const known=exact&&Object.keys(condition).length===2&&(condition.age===7||condition.daysSinceCustomTime===0);
  if(!known)throw Error('Unexpected deletion rule affecting shared videos. Review the bucket policy before migration.');
 }
 return [...retained,{action:{type:'Delete'},condition:{daysSinceCustomTime:0,matchesPrefix:prefixes}}];
}

// Runs on the release machine with its existing gcloud identity. Never logs tokens,
// publication contents, or sharing links. Generation preconditions reject races.
export async function migrateRetention({apply=false,backupDirectory,fetcher=fetch,tokenProvider=()=>execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim(),log=console.log}={}){
 const token=await tokenProvider(),base='https://storage.googleapis.com/storage/v1/b/'+BUCKET;
 const request=async(path,options={})=>{
  const response=await fetcher(base+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Storage retention request failed: '+response.status);
  return response.json();
 };
 const bucket=await request(''),desired={rule:retentionRules(bucket.lifecycle?.rule||[])};
 const objects=[];
 for(const prefix of prefixes){
  let page='';const visited=new Set();
  do{
   if(visited.has(page))throw Error('Repeated storage page.');visited.add(page);
   const listing=await request('/o?prefix='+encodeURIComponent(prefix)+(page?'&pageToken='+encodeURIComponent(page):''));
   objects.push(...listing.items||[]);page=listing.nextPageToken||'';
  }while(page);
 }
 const expiries=new Map();
 for(const item of objects.filter(item=>/^gallery\/[0-9a-f-]{36}\.json$/.test(item.name))){
  const record=await request('/o/'+encodeURIComponent(item.name)+'?alt=media&generation='+item.generation);
  if(item.name!=='gallery/'+record.id+'.json'||(record.expiresAt!==null&&!Number.isSafeInteger(record.expiresAt))||(!record.ownerId&&record.expiresAt===null))throw Error('Invalid publication expiry.');
  expiries.set(record.id,record.expiresAt);
 }
 const updates=[];
 for(const item of objects){
  const match=/^(?:gallery\/([0-9a-f-]{36})\.json|videos\/([0-9a-f-]{36})(?:\.jpg)?)$/.exec(item.name);
  if(!match)throw Error('Unexpected object under the shared-video prefixes.');
  const id=match[1]||match[2],expiry=expiries.has(id)?expiries.get(id):item.customTime?Date.parse(item.customTime):Date.parse(item.timeCreated)+7*86400000;
  if(expiry===null){if(item.customTime)throw Error('A permanent object already has a deletion time. Review it before migration.');continue;}
  if(!Number.isSafeInteger(expiry))throw Error('Invalid object creation time.');
  if(item.customTime&&Date.parse(item.customTime)!==expiry)throw Error('Object deletion time differs from its publication.');
  if(!item.customTime)updates.push({name:item.name,generation:item.generation,metageneration:item.metageneration,customTime:new Date(expiry).toISOString()});
 }
 const stats={mode:apply?'apply':'dry-run',scannedObjects:objects.length,expiryUpdates:updates.length,policyChanged:!isDeepStrictEqual(bucket.lifecycle,desired)};
 if(apply){
  if(!backupDirectory)throw Error('A private backup directory is required.');
  await mkdir(backupDirectory,{recursive:true,mode:0o700});
  await writeFile(backupDirectory+'/retention-before.json',JSON.stringify({bucket:BUCKET,lifecycle:bucket.lifecycle,updates},null,2)+'\n',{mode:0o600,flag:'wx'});
  for(const item of updates)await request('/o/'+encodeURIComponent(item.name)+'?ifGenerationMatch='+item.generation+'&ifMetagenerationMatch='+item.metageneration,{method:'PATCH',body:JSON.stringify({customTime:item.customTime})});
  if(stats.policyChanged)await request('?ifMetagenerationMatch='+bucket.metageneration,{method:'PATCH',body:JSON.stringify({lifecycle:desired})});
  const verified=await request('');
  if(!isDeepStrictEqual(verified.lifecycle,desired))throw Error('Bucket lifecycle verification failed.');
 }
 log(JSON.stringify(stats));return stats;
}
if(process.argv[1]&&await realpath(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await migrateRetention({apply:process.argv.includes('--apply'),backupDirectory:process.argv.find(arg=>arg.startsWith('--backup='))?.slice(9)});}
 catch(error){console.error(error.message);process.exitCode=1;}
}
