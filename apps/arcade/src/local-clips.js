export const MAX_BYTES=100*1024*1024;
export const MAX_CLIPS=2;
const LIBRARY_BYTES=150*1024*1024;
function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('fitness-pair-clips',1);r.onupgradeneeded=()=>r.result.createObjectStore('clips',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Close other arcade tabs and retry.'));});}
export const clipBytes=clip=>clip.blob.size+(clip.conversation?.blob?.size||0)+(clip.thumbnail?.size||0);
// Selection and eviction share one transaction, including concurrent round saves.
async function changeLibrary({clip,updateOnly=false,deleteId,thumbnailUpdate}={}){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const tx=database.transaction('clips','readwrite'),store=tx.objectStore('clips');let kept=[];
  const request=store.getAll();
  request.onsuccess=()=>{
   const all=new Map(request.result.map(item=>[item.id,item]));
   if(clip&&(!updateOnly||all.has(clip.id)))all.set(clip.id,clip);
   if(thumbnailUpdate&&all.has(thumbnailUpdate.id))all.set(thumbnailUpdate.id,{...all.get(thumbnailUpdate.id),thumbnail:thumbnailUpdate.thumbnail});
   if(deleteId)all.delete(deleteId);
   let bytes=0;
   for(const clip of [...all.values()].sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id))){
    if(kept.length<MAX_CLIPS&&bytes+clipBytes(clip)<=LIBRARY_BYTES){kept.push(clip);bytes+=clipBytes(clip);}
   }
   const retained=new Set(kept.map(item=>item.id));
   for(const item of request.result)if(!retained.has(item.id))store.delete(item.id);
   if(clip&&retained.has(clip.id))store.put(clip);
   if(thumbnailUpdate&&retained.has(thumbnailUpdate.id))store.put(all.get(thumbnailUpdate.id));
  };
  tx.oncomplete=()=>{database.close();globalThis.dispatchEvent?.(new CustomEvent('local-clips:changed',{detail:kept.map(c=>c.id)}));resolve(kept);};
  tx.onerror=tx.onabort=()=>{database.close();reject(tx.error||new Error('Local storage is unavailable'));};
 });
}
export async function saveClip(clip){
 if(!(clip.blob instanceof Blob)||!clip.blob.size||clip.blob.size>MAX_BYTES||clipBytes(clip)>LIBRARY_BYTES)throw new Error('The recording is empty or too large.');
 return changeLibrary({clip});
}
export const listClips=()=>changeLibrary();
export const deleteClip=id=>changeLibrary({deleteId:id});
// A late publication or transcode must never resurrect an evicted replay.
export const updateClip=clip=>changeLibrary({clip,updateOnly:true});
// Preserve concurrent publication/conversation edits and never restore an evicted video.
export const updateClipThumbnail=(id,thumbnail)=>changeLibrary({thumbnailUpdate:{id,thumbnail}});
