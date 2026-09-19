// Synthetic local account + real gateway/durable storage. Never targets production.
import http from 'node:http';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {createGateway} from '../deploy/gcp/gateway.mjs';
import {createAccountStore} from '../deploy/gcp/account-store.mjs';
const directory=await mkdtemp(tmpdir()+'/hopmodo-browser-stats-'),origin='http://127.0.0.1:5194';
const store=createAccountStore(directory);
await store.write('sessions',createHash('sha256').update('s'.repeat(43)).digest('hex'),{userId:'a'.repeat(64),email:'owner@example.test',csrf:'synthetic',expiresAt:Date.now()+3600000});
const gateway=createGateway({origin,env:{FITNESS_STATE_DIR:directory,INTEG_AUTH_CLIENT_ID:'synthetic-stats-test',INTEG_AUTH_CLIENT_SECRET:'x'.repeat(32),FITNESS_STATS_ADMIN_EMAILS:'owner@example.test'}});
gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
const root=path.resolve('dist/client'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm','.wav':'audio/wav','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{try{
 if(req.url.startsWith('/api/')||req.url==='/healthz'){const proxy=http.request({hostname:'127.0.0.1',port:gateway.address().port,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});req.pipe(proxy);return;}
 let file=path.resolve(root,'.'+new URL(req.url,origin).pathname);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(404).end();return;}
 try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');}catch{file=path.join(root,'index.html');}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(await readFile(file));
 }catch{res.writeHead(500).end();}});
server.listen(5194,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{server.closeAllConnections();server.close();gateway.closeAllConnections();gateway.close();await rm(directory,{recursive:true,force:true});process.exit(0);});
