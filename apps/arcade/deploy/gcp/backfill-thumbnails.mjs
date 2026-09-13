import {mkdtemp,writeFile,readFile,rm,mkdir,realpath} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createMetadataTokenProvider} from './identity.mjs';

const origin='https://fitness.integ.life';
const validID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const execute=promisify(execFile),hash=bytes=>createHash('sha256').update(bytes).digest('hex');

async function firstFrame(bytes,stateDir){
 const base=stateDir+'/.local';await mkdir(base,{recursive:true,mode:0o700});
 const temp=await mkdtemp(base+'/thumbnail-');
 try{
  await writeFile(temp+'/input',bytes,{mode:0o600});
  await execute('ffmpeg',['-nostdin','-v','error','-threads','1','-protocol_whitelist','file,pipe','-i',temp+'/input','-frames:v','1','-vf',"scale=480:480:force_original_aspect_ratio=decrease",'-q:v','3',temp+'/poster.jpg'],{timeout:20000,maxBuffer:16384});
  return await readFile(temp+'/poster.jpg');
 }finally{await rm(temp,{recursive:true,force:true});}
}

// Add only missing derived JPEGs. No video, publication marker, ownership, or
// account ledger is rewritten. JPEGs inherit the publication expiry; permanent videos have no custom deletion time.
export async function backfillThumbnails({apply=false,env=process.env,fetcher=fetch,encode=firstFrame,tokenProvider,log=console.log}={}){
 const token=tokenProvider||(apply?createMetadataTokenProvider({serviceAccount:env.GCP_IMPERSONATE_SERVICE_ACCOUNT}):null);
 if(apply&&(!env.GCP_BUCKET||!env.FITNESS_STATE_DIR))throw Error('Storage and state directory must be configured.');
 const request=async(url,options={})=>fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});
 const stats={scanned:0,created:0,existing:0,missing:0,failed:0};
 const visited=new Set();let page='';
 do{
  if(visited.has(page))throw Error('Gallery pagination repeated.');visited.add(page);
  const listing=await request(origin+'/api/clips'+(page?'?page='+encodeURIComponent(page):''));
  if(!listing.ok)throw Error('Could not list the gallery.');
  const data=await listing.json();if(!data.enabled||!Array.isArray(data.clips))throw Error('Gallery is unavailable.');
  for(const clip of data.clips){
   if(!validID.test(clip.id))throw Error('Invalid gallery clip ID.');stats.scanned++;
   try{
    const poster=await request(origin+'/api/posters/'+clip.id,{method:'HEAD'});
    if(poster.ok){stats.existing++;continue;}
    if(poster.status!==404)throw Error('Could not check the thumbnail.');
    stats.missing++;if(!apply)continue;
    const media=await request(origin+'/api/media/'+clip.id);
    if(!media.ok||Number(media.headers.get('Content-Length'))>200_000_000)throw Error('Could not read the bounded video.');
    const bytes=Buffer.from(await media.arrayBuffer());if(!bytes.length||bytes.length>200_000_000)throw Error('Video exceeds the size limit.');
    const image=await encode(bytes,env.FITNESS_STATE_DIR);
    if(image.length>256*1024||image[0]!==255||image[1]!==216||image.at(-2)!==255||image.at(-1)!==217)throw Error('Invalid thumbnail output.');
    // Recheck visibility after decoding in case its owner removed the clip.
    if(!(await request(origin+'/api/clips/'+clip.id)).ok)throw Error('Clip was removed during preparation.');
    const name='videos/'+clip.id+'.jpg';
    const upload=await request('https://storage.googleapis.com/upload/storage/v1/b/'+encodeURIComponent(env.GCP_BUCKET)+'/o?uploadType=media&ifGenerationMatch=0&name='+encodeURIComponent(name),{
     method:'POST',headers:{Authorization:'Bearer '+await token(),'Content-Type':'image/jpeg'},body:image,
    });
    if(!upload.ok&&upload.status!==412)throw Error('Thumbnail upload failed.');
    if(Number.isSafeInteger(clip.expiresAt)){
     const expiry=await request('https://storage.googleapis.com/storage/v1/b/'+encodeURIComponent(env.GCP_BUCKET)+'/o/'+encodeURIComponent(name),{method:'PATCH',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify({customTime:new Date(clip.expiresAt).toISOString()})});
     if(!expiry.ok)throw Error('Thumbnail expiry update failed.');
    }
    if(upload.status===412){stats.existing++;continue;}
    const served=await request(origin+'/api/posters/'+clip.id);
    if(!served.ok||hash(Buffer.from(await served.arrayBuffer()))!==hash(image))throw Error('Thumbnail readback failed.');
    stats.created++;log(JSON.stringify({id:clip.id,thumbnailBytes:image.length,videoSHA256:hash(bytes),thumbnailSHA256:hash(image)}));
   }catch{stats.failed++;log(JSON.stringify({id:clip.id,error:'Thumbnail preparation failed; original video unchanged.'}));}
  }
  page=data.nextPageToken||'';
 }while(page);
 log(JSON.stringify({mode:apply?'apply':'dry-run',...stats}));return stats;
}

if(process.argv[1]&&await realpath(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await backfillThumbnails({apply:process.argv.includes('--apply')});if(result.failed)process.exitCode=1;}
 catch{console.error('Thumbnail backfill failed. Check service configuration and access.');process.exitCode=1;}
}
