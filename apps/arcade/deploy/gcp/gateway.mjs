import http from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {webcrypto} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import worker from '../../server/worker.js';

globalThis.crypto ??= webcrypto;

// Caddy owns static files/TLS. The existing Worker owns gallery API semantics.
export function createGateway({origin='https://fitness.integ.life',release={},env={}}={}) {
  return http.createServer(async(req,res)=>{
    try {
      if(req.url==='/healthz' && ['GET','HEAD'].includes(req.method)) {
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(req.method==='HEAD'?undefined:JSON.stringify({ok:true,service:'fitness-arcade',...release}));
        return;
      }
      const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,
        ...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
      const response=await worker.fetch(request,{...env,ASSETS:{fetch:()=>new Response('Not found',{status:404})}});
      res.writeHead(response.status,Object.fromEntries(response.headers));
      if(req.method==='HEAD'||!response.body)res.end();
      else await pipeline(Readable.fromWeb(response.body),res);
    } catch {
      if(res.headersSent)res.destroy();
      else {res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Service unavailable."}');}
    }
  });
}

if(process.argv[1] && realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  const release=JSON.parse(readFileSync(new URL('../../../../release.json',import.meta.url),'utf8'));
  const server=createGateway({release,env:process.env});
  server.requestTimeout=90000;
  server.headersTimeout=15000;
  server.listen(8411,'127.0.0.1',()=>console.log('Fitness arcade gateway listening on 127.0.0.1:8411'));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
    server.close(()=>process.exit(0));
    setTimeout(()=>process.exit(1),10000).unref();
  });
}
