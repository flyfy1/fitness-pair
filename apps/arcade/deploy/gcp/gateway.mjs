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
import {createFeedbackCollector} from './feedback.mjs';
import {createDebugReportCollector} from './debug-reports.mjs';
import {createPlayStats} from './play-stats.mjs';
import {gameCatalog,playableGames} from '../../game-catalog.js';

globalThis.crypto ??= webcrypto;

// Anonymous write endpoints. Origin checks only stop browsers; these bound non-browser clients too.
export const WRITE_RATE_LIMITS=[
  {name:'feedback',match:(method,pathname)=>method==='POST'&&pathname==='/api/feedback',perClient:{limit:30,windowMs:600000},global:{limit:600,windowMs:3600000}},
  {name:'debug-report',match:(method,pathname)=>method==='POST'&&pathname==='/api/debug-reports',perClient:{limit:6,windowMs:3600000},global:{limit:30,windowMs:3600000}},
  {name:'debug-video',match:(method,pathname)=>method==='PUT'&&pathname.startsWith('/api/debug-reports/'),perClient:{limit:8,windowMs:3600000},global:{limit:60,windowMs:3600000}},
];

// Cloudflare Tunnel overwrites CF-Connecting-IP; without it every client shares the proxy's loopback address.
export function clientKey(req){
  const forwarded=req.headers['cf-connecting-ip'];
  return typeof forwarded==='string'&&forwarded.length<=64&&forwarded.trim()?forwarded.trim():req.socket.remoteAddress||'unknown';
}

// Fixed-window counters held in memory; a restart resets them. maxKeys bounds memory under address churn.
export function createRateLimiter({rules=WRITE_RATE_LIMITS,now=Date.now,maxKeys=10000}={}){
  const windows=new Map();
  function take(key,{limit,windowMs}){
    const time=now();let entry=windows.get(key);
    if(!entry||entry.resetAt<=time){
      if(!entry&&windows.size>=maxKeys){
        for(const [old,value] of windows)if(value.resetAt<=time)windows.delete(old);
        if(windows.size>=maxKeys)windows.delete(windows.keys().next().value);
      }
      windows.delete(key);entry={count:0,resetAt:time+windowMs};windows.set(key,entry);
    }
    if(entry.count>=limit)return Math.ceil((entry.resetAt-time)/1000);
    entry.count++;return 0;
  }
  return {
    // Returns the seconds until retry when limited, otherwise 0.
    check(method,pathname,client){
      const rule=rules.find(candidate=>candidate.match(method,pathname));
      if(!rule)return 0;
      return take(rule.name+' '+client,rule.perClient)||take(rule.name,rule.global);
    },
  };
}

// Caddy owns static files/TLS. The existing Worker owns gallery API semantics.
export function createGateway({origin='https://fitness.integ.life',release={},env={},authFetcher=fetch,galleryWorker=worker,rateLimiter=createRateLimiter()}={}) {
  const runtimeEnv={...env};
  let auth=null;const cleanups=[];
  if(env.INTEG_AUTH_CLIENT_ID){
    if(!env.FITNESS_STATE_DIR)throw Error('A durable account state directory is required.');
    const store=createAccountStore(env.FITNESS_STATE_DIR);
    auth=createAuth({origin,issuer:env.INTEG_AUTH_ISSUER||'https://auth.integ.life',clientId:env.INTEG_AUTH_CLIENT_ID,clientSecret:env.INTEG_AUTH_CLIENT_SECRET,store,fetcher:authFetcher});
    runtimeEnv.ACCOUNTS=auth;
    const cleanup=setInterval(()=>store.pruneSessions().catch(()=>{}),3600000);cleanup.unref();cleanups.push(cleanup);
  }
  const stats=env.FITNESS_STATE_DIR?createPlayStats({directory:env.FITNESS_STATE_DIR,origin,games:gameCatalog,getUser:request=>auth?.user(request),adminEmails:env.FITNESS_STATS_ADMIN_EMAILS||''}):null;
  const feedback=env.FITNESS_STATE_DIR?createFeedbackCollector({directory:env.FITNESS_STATE_DIR,origin,games:playableGames,getUser:request=>auth?.user(request)}):null;
  const debugReports=env.FITNESS_STATE_DIR?createDebugReportCollector({directory:env.FITNESS_STATE_DIR,origin,games:playableGames,release,getUser:request=>auth?.user(request)}):null;
  for(const collector of [feedback,debugReports].filter(Boolean)){collector.prune().catch(()=>{});const cleanup=setInterval(()=>collector.prune().catch(()=>{}),3600000);cleanup.unref();cleanups.push(cleanup);}
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
      const pathname=new URL(request.url).pathname;
      const retryAfter=rateLimiter.check(req.method,pathname,clientKey(req));
      if(retryAfter){
        res.writeHead(429,{'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(retryAfter)});
        res.end(JSON.stringify({error:'Too many requests. Please try again later.'}));
        return;
      }
      const statsResponse=await stats?.handle(request);
      const debugResponse=statsResponse?null:await debugReports?.handle(request);
      const feedbackResponse=debugResponse?null:await feedback?.handle(request);
      const unavailable=!debugResponse&&pathname.startsWith('/api/debug-reports')?Response.json({error:'Diagnostic storage is unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}}):!feedbackResponse&&pathname==='/api/feedback'?Response.json({error:'Feedback storage is unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}}):null;
      const statsUnavailable=!stats&&['/api/play-sessions','/api/admin/game-stats'].includes(pathname)?Response.json({error:'Game statistics are unavailable.'},{status:503}):null;
      const response=statsResponse||statsUnavailable||debugResponse||feedbackResponse||unavailable||await auth?.handle(request)||await galleryWorker.fetch(request,{...runtimeEnv,ASSETS:{fetch:()=>new Response('Not found',{status:404})}});
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
  server.on('close',()=>{for(const cleanup of cleanups)clearInterval(cleanup);});
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
