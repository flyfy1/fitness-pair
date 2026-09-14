export async function readStoredClip(page,game){
 return page.evaluate(async gameId=>{
  const clips=await new Promise((resolve,reject)=>{
   const request=indexedDB.open('fitness-pair-clips',1);
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
    const database=request.result,query=database.transaction('clips').objectStore('clips').getAll();
    query.onerror=()=>reject(query.error);
    query.onsuccess=()=>{database.close();resolve(query.result);};
   };
  });
  const clip=clips.filter(item=>item.game===gameId).sort((a,b)=>b.createdAt-a.createdAt)[0];
  if(!clip)return null;
  return {id:clip.id,sessionId:clip.sessionId,inputSource:clip.inputSource,trackingBytes:clip.trackingBytes,
   tracking:clip.tracking?{format:clip.tracking.format,sessionId:clip.tracking.sessionId,source:clip.tracking.source,
    durationMs:clip.tracking.video?.durationMs,sampleCount:clip.tracking.samples.length,
    sampleSessionIds:[...new Set(clip.tracking.samples.map(sample=>sample.pose.sessionId))],
    firstVideoMs:clip.tracking.samples[0]?.videoMs,lastVideoMs:clip.tracking.samples.at(-1)?.videoMs}:null};
 },game);
}
