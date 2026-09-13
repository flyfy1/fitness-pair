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
