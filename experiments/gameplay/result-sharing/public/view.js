const $=id=>document.getElementById(id), url=$('share-url').value;
const key=new URLSearchParams(location.hash.slice(1)).get('manage');
const status=message=>{$('status').textContent=message;};
if(key&&/^[a-f0-9]{64}$/.test(key))$('management').hidden=false;
async function copy(){try{await navigator.clipboard.writeText(url);status('Public link copied.');}catch{$('share-url').select();status('Select and copy the link above.');}}
$('copy').onclick=copy;$('share').onclick=async()=>{if(!navigator.share)return copy();try{await navigator.share({title:document.title,url});}catch(e){if(e.name!=='AbortError')await copy();}};
$('clip').addEventListener('error',()=>status('This clip is no longer available, or this browser cannot play its format. Try a current browser.'));
$('remove').onclick=async()=>{
  if(!$('remove-confirm').checked){status('Select the removal confirmation first.');return;}
  $('remove').disabled=true;
  try{const response=await fetch(`/api/clips/${location.pathname.split('/').pop()}`,{method:'DELETE',headers:{Authorization:`Bearer ${key}`}});if(!response.ok)throw new Error('The clip could not be removed. Check your management link and retry.');$('clip').pause();$('clip').removeAttribute('src');$('clip').load();$('management').hidden=true;status('Clip removed. Its public link is now unavailable.');}catch(error){status(error.message);$('remove').disabled=false;}
};
window.addEventListener('pagehide',()=>$('clip').pause());
