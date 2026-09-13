import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {migrateRetention,retentionRules} from './retention-policy.mjs';

test('retention migration replaces only the known seven-day rule and fails closed on broader deletion rules',()=>{
 const other={action:{type:'Delete'},condition:{age:1,matchesPrefix:['unrelated/']}};
 const rules=retentionRules([other,{action:{type:'Delete'},condition:{age:7,matchesPrefix:['gallery/','videos/']}}]);
 assert.deepEqual(rules,[other,{action:{type:'Delete'},condition:{daysSinceCustomTime:0,matchesPrefix:['gallery/','videos/']}}]);
 assert.throws(()=>retentionRules([{action:{type:'Delete'},condition:{age:7}}]));
 assert.deepEqual(retentionRules(rules),rules);
});
test('migration stamps legacy videos and posters, excludes permanent objects, preserves records, and is idempotent',async t=>{
 const temporary=await mkdtemp(tmpdir()+'/hopmodo-retention-');t.after(()=>rm(temporary,{recursive:true,force:true}));
 const finite='550e8400-e29b-41d4-a716-446655440000',permanent='550e8400-e29b-41d4-a716-446655440001';
 const objects=[finite,permanent].flatMap(id=>['gallery/'+id+'.json','videos/'+id,'videos/'+id+'.jpg'].map(name=>({name,generation:'1',metageneration:'1',timeCreated:'2026-09-14T00:00:00Z'})));
 objects.push({name:'videos/550e8400-e29b-41d4-a716-446655440002',generation:'1',metageneration:'1',timeCreated:'2026-09-14T00:00:00Z',customTime:'2026-10-14T00:00:00Z'});
 const records=new Map([[finite,{id:finite,ownerId:'owner',expiresAt:Date.parse('2026-09-21T00:00:00Z')}],[permanent,{id:permanent,ownerId:'owner',expiresAt:null}]]);
 let bucket={metageneration:'1',lifecycle:{rule:[{action:{type:'Delete'},condition:{age:7,matchesPrefix:['gallery/','videos/']}}]}},writes=0;
 const options={tokenProvider:()=> 'mock',log:()=>{},fetcher:async(raw,options)=>{
  const url=new URL(raw),name=decodeURIComponent(url.pathname.split('/o/')[1]||'');
  if(options.method==='PATCH'){
   writes++;assert.equal(options.headers.Authorization,'Bearer mock');
   const data=JSON.parse(options.body);
   if(!name){assert.equal(url.searchParams.get('ifMetagenerationMatch'),'1');bucket={...bucket,...data};return Response.json(bucket);}
   assert.equal(url.searchParams.get('ifGenerationMatch'),'1');const item=objects.find(item=>item.name===name);Object.assign(item,data);return Response.json(item);
  }
  if(name)return Response.json(records.get(name.slice(8,-5)));
  if(url.pathname.endsWith('/o'))return Response.json({items:objects.filter(item=>item.name.startsWith(url.searchParams.get('prefix')))});
  return Response.json(bucket);
 }};
 assert.equal((await migrateRetention(options)).expiryUpdates,3);assert.equal(writes,0);
 assert.equal((await migrateRetention({...options,apply:true,backupDirectory:temporary+'/first'})).expiryUpdates,3);assert.equal(writes,4);
 assert.equal((await migrateRetention({...options,apply:true,backupDirectory:temporary+'/again'})).expiryUpdates,0);assert.equal(writes,4);
 assert.equal(objects.find(item=>item.name==='videos/'+permanent).customTime,undefined);
});
