// Snapshot the first composed frame while recording/encoding already owns it.
// Never open a saved video just to populate a browsing preview.
export function captureClipThumbnail(source){
 return new Promise(resolve=>{
  const timeout=setTimeout(()=>resolve(null),2000);
  const finish=blob=>{clearTimeout(timeout);resolve(blob);};
  try{
   const canvas=document.createElement('canvas');
   const scale=Math.min(1,480/Math.max(source.width,source.height));
   canvas.width=Math.max(1,Math.round(source.width*scale));
   canvas.height=Math.max(1,Math.round(source.height*scale));
   canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
   canvas.toBlob(finish,'image/jpeg',.8);
  }catch{finish(null);}
 });
}

// Explicit repair/publication action only. Browsing never calls this decoder.
export async function thumbnailFromVideo(blob,{signal}={}){
 const video=document.createElement('video'),url=URL.createObjectURL(blob);
 const controller=new AbortController();
 const abort=()=>controller.abort(new DOMException('Thumbnail preparation cancelled.','AbortError'));
 const visibility=()=>{if(document.hidden)abort();};
 signal?.addEventListener('abort',abort,{once:true});window.addEventListener('pagehide',abort);document.addEventListener('visibilitychange',visibility);
 try{
  if(signal?.aborted||document.hidden)abort();controller.signal.throwIfAborted();
  video.muted=true;video.playsInline=true;video.preload='auto';
  await new Promise((resolve,reject)=>{
   const finish=error=>{clearTimeout(timer);video.removeEventListener('loadeddata',ready);video.removeEventListener('error',failed);controller.signal.removeEventListener('abort',cancelled);error?reject(error):resolve();};
   const ready=()=>finish(),failed=()=>finish(new Error('Could not read this video. Your original is unchanged.')),cancelled=()=>finish(controller.signal.reason);
   const timer=setTimeout(()=>finish(new Error('Reading the video took too long. Please retry.')),10000);
   video.addEventListener('loadeddata',ready,{once:true});video.addEventListener('error',failed,{once:true});controller.signal.addEventListener('abort',cancelled,{once:true});
   video.src=url;video.load();
  });
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);
  const thumbnail=await captureClipThumbnail(canvas);controller.signal.throwIfAborted();
  if(!thumbnail)throw new Error('Could not create a thumbnail. Your original is unchanged.');
  return thumbnail;
 }finally{
  video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
  signal?.removeEventListener('abort',abort);window.removeEventListener('pagehide',abort);document.removeEventListener('visibilitychange',visibility);
 }
}
