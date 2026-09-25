/* Host adapter for existing gallery UI. Video bytes go directly to Google Storage. */
(() => {
  const original=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=typeof input==='string'?new URL(input,location.href):null;
    if(!url||url.origin!==location.origin||!/^\/api\/clips\/[0-9a-f-]{36}$/.test(url.pathname)||options.method!=='PUT'||!(options.body instanceof Blob))return original(input,options);
    const {body,...base}=options;
    const headers=new Headers(base.headers);headers.set('X-Upload-Bytes',String(body.size));
    const path='/api/direct-uploads/'+url.pathname.split('/').pop();
    const started=await original(path+url.search,{...base,method:'POST',headers});
    if(!started.ok)return started;
    const session=await started.json();
    if(session.published)return Response.json(session.published);
    const target=new URL(session.uploadURL);
    if(target.origin!=='https://storage.googleapis.com'||!target.pathname.startsWith('/upload/storage/v1/b/')||!target.searchParams.has('upload_id'))throw Error('Invalid cloud upload destination.');
    let uploaded=false,completed=false;
    try {
      // Never forward application cookies, CSRF or account credentials to Google.
      const sent=await original(target.href,{method:'PUT',headers:{'Content-Type':body.type},body,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:base.signal||AbortSignal.timeout(600000)});
      if(!sent.ok)throw Error('Cloud upload did not finish. Please retry.');
      uploaded=true;
      const response=await original(path+'/complete',{...base,method:'POST'});
      completed=response.ok;return response;
    } finally {
      if(!completed){
        if(!uploaded)await original(target.href,{method:'DELETE',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.timeout(5000)}).catch(()=>{});
        await original(path,{...base,method:'DELETE',signal:AbortSignal.timeout(10000)}).catch(()=>{});
      }
    }
  };
})();
