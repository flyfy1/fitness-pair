import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import worker from '../apps/arcade/server/worker.js';
const root=path.resolve('dist/client');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wasm':'application/wasm'};
const assets={async fetch(request){
  let filename=path.resolve(root,'.'+decodeURIComponent(new URL(request.url).pathname));
  if(!filename.startsWith(root+path.sep)&&filename!==root)return new Response('Not found',{status:404});
  try{if((await stat(filename)).isDirectory())filename=path.join(filename,'index.html');return new Response(await readFile(filename),{headers:{'Content-Type':types[path.extname(filename)]||'application/octet-stream'}});}
  catch{return new Response(await readFile(path.join(root,'index.html')),{headers:{'Content-Type':'text/html'}});}
}};
const server=http.createServer(async(req,res)=>{
  try{const request=new Request('http://127.0.0.1:5191'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});const response=await worker.fetch(request,{ASSETS:assets},{});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
  catch{res.writeHead(500);res.end('Preview request failed');}
});
server.listen(5191,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5191'));
