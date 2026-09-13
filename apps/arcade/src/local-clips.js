export const MAX_BYTES=100*1024*1024;
function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('fitness-pair-clips',1);r.onupgradeneeded=()=>r.result.createObjectStore('clips',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Close other arcade tabs and retry.'));});}
async function transaction(mode,operation){const database=await db();return new Promise((resolve,reject)=>{const t=database.transaction('clips',mode);const request=operation(t.objectStore('clips'));t.oncomplete=()=>{resolve(request.result);database.close();};t.onerror=t.onabort=()=>{reject(t.error||new Error('Local storage is unavailable'));database.close();};});}
export const clipBytes=clip=>clip.blob.size+(clip.conversation?.blob?.size||0);
export async function saveClip(clip){if(!(clip.blob instanceof Blob)||!clip.blob.size||clip.blob.size>MAX_BYTES)throw new Error('The recording is empty or too large.');const existing=await listClips();if(existing.reduce((n,c)=>n+clipBytes(c),0)+clipBytes(clip)>150*1024*1024)throw new Error('Your local clip library is full. Download or delete a clip, then retry.');await transaction('readwrite',s=>s.put(clip));}
export const listClips=async()=> (await transaction('readonly',s=>s.getAll())).sort((a,b)=>b.createdAt-a.createdAt);
export const deleteClip=id=>transaction('readwrite',s=>s.delete(id));
export const updateClip=clip=>transaction('readwrite',s=>s.put(clip));
