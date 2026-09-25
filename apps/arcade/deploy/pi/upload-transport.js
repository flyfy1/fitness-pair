/* Host transport adapter: only large same-origin gallery Blob uploads. */
(() => {
  const original=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=typeof input==='string'?new URL(input,location.href):null;
    if(!url||url.origin!==location.origin||!/^\/api\/clips\/[0-9a-f-]{36}$/.test(url.pathname)||options.method!=='PUT'||!(options.body instanceof Blob)||options.body.size<=64_000_000)return original(input,options);
    const {body,...base}=options;
    const headers=new Headers(base.headers);
    headers.set('X-Upload-Bytes',String(body.size));
    const started=await original('/api/chunk-uploads/'+url.pathname.split('/').pop()+url.search,{...base,method:'POST',headers});
    if(!started.ok)return started;
    const {id,chunkBytes}=await started.json();
    const path='/api/chunk-uploads/'+id;
    let completed=false;
    try {
      for(let offset=0;offset<body.size;offset+=chunkBytes){
        const partHeaders=new Headers(base.headers);partHeaders.set('X-Upload-Offset',String(offset));
        const response=await original(path,{...base,method:'PUT',headers:partHeaders,body:body.slice(offset,offset+chunkBytes)});
        if(!response.ok)return response;
      }
      const response=await original(path+'/commit',{...base,method:'POST'});
      completed=true;return response;
    } finally {
      if(!completed)await original(path,{...base,method:'DELETE',signal:AbortSignal.timeout(5000)}).catch(()=>{});
    }
  };
})();
