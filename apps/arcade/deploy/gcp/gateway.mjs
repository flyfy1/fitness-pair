import http from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {webcrypto} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import worker from '../../server/worker.js';
import {createMetadataTokenProvider} from './identity.mjs';
import {createAccountStore} from './account-store.mjs';
import {createAuth} from './auth.mjs';

globalThis.crypto ??= webcrypto;

// Caddy owns static files/TLS. The existing Worker owns gallery API semantics.
export function createGateway({origin='https://fitness.integ.life',release={},env={},authFetcher=fetch,galleryWorker=worker}={}) {
  const runtimeEnv={...env};
  let auth=null,cleanup=null;
  if(env.INTEG_AUTH_CLIENT_ID){
    if(!env.FITNESS_STATE_DIR)throw Error('A durable account state directory is required.');
    const store=createAccountStore(env.FITNESS_STATE_DIR);
    auth=createAuth({origin,issuer:env.INTEG_AUTH_ISSUER||'https://auth.integ.life',clientId:env.INTEG_AUTH_CLIENT_ID,clientSecret:env.INTEG_AUTH_CLIENT_SECRET,store,fetcher:authFetcher});
    runtimeEnv.ACCOUNTS=auth;
    cleanup=setInterval(()=>store.pruneSessions().catch(()=>{}),3600000);cleanup.unref();
  }
  if(env.GCP_IMPERSONATE_SERVICE_ACCOUNT)runtimeEnv.GCP_ACCESS_TOKEN_PROVIDER=createMetadataTokenProvider({serviceAccount:env.GCP_IMPERSONATE_SERVICE_ACCOUNT});
  const server=http.createServer(async(req,res)=>{
    try {
      if(req.url==='/healthz' && ['GET','HEAD'].includes(req.method)) {
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(req.method==='HEAD'?undefined:JSON.stringify({ok:true,service:'fitness-arcade',...release}));
        return;
      }
      const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,
        ...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
      const response=await auth?.handle(request)||await galleryWorker.fetch(request,{...runtimeEnv,ASSETS:{fetch:()=>new Response('Not found',{status:404})}});
      const responseHeaders=Object.fromEntries(response.headers);
      // Node 18 Headers folds Set-Cookie. OAuth needs both transaction cleanup and session issuance.
      const setCookie=response.headers.get('set-cookie');
      if(setCookie)responseHeaders['set-cookie']=response.headers.getSetCookie?.()||setCookie.split(/, (?=[^;,]+=)/);
      res.writeHead(response.status,responseHeaders);
      if(req.method==='HEAD'||!response.body)res.end();
      else await pipeline(Readable.fromWeb(response.body),res);
    } catch(error) {
      if(res.headersSent)res.destroy();
      else {res.writeHead(error.status||503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:error.status?error.message:'Service unavailable.'}));}
    }
  });
  server.on('close',()=>{if(cleanup)clearInterval(cleanup);});
  return server;
}

if(process.argv[1] && realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  const release=JSON.parse(readFileSync(new URL('../../../../release.json',import.meta.url),'utf8'));
  const server=createGateway({release,env:process.env});
  server.requestTimeout=300000;
  server.headersTimeout=15000;
  server.listen(8411,'127.0.0.1',()=>console.log('Fitness arcade gateway listening on 127.0.0.1:8411'));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
    server.close(()=>process.exit(0));
    setTimeout(()=>process.exit(1),10000).unref();
  });
}
