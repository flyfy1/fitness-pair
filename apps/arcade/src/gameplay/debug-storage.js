const MAX_BYTES=25*1024*1024,MAX_CAPTURES=3;
function database(){return new Promise((resolve,reject)=>{
 const request=indexedDB.open('fitness-pair-debug',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('captures',{keyPath:'id'});
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 request.onblocked=()=>reject(Error('Close other debug tabs and try again.'));
});}
export async function saveDebugCapture(capture){
 const bytes=capture.clip.blob.size+new TextEncoder().encode(JSON.stringify(capture.report)).byteLength;
 if(bytes>MAX_BYTES)throw Error('Debug capture exceeds local storage limits.');
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('captures','readwrite'),store=tx.objectStore('captures'),all=store.getAll();
  all.onsuccess=()=>{
   const values=[...all.result.filter(item=>item.id!==capture.id),{...capture,bytes}].sort((a,b)=>b.createdAt-a.createdAt);
   let total=0;const kept=new Set();
   for(const item of values)if(kept.size<MAX_CAPTURES&&total+item.bytes<=MAX_BYTES){kept.add(item.id);total+=item.bytes;}
   for(const item of all.result)if(!kept.has(item.id))store.delete(item.id);
   if(kept.has(capture.id))store.put({...capture,bytes});
  };
  tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('Debug could not be saved locally.'));};
 });
}
export async function latestDebugCapture(gameId){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('captures','readonly'),request=tx.objectStore('captures').getAll();
  request.onsuccess=()=>resolve(request.result.filter(item=>item.gameId===gameId).sort((a,b)=>b.createdAt-a.createdAt)[0]||null);
  tx.oncomplete=()=>db.close();tx.onerror=tx.onabort=()=>{db.close();reject(tx.error);};
 });
}
