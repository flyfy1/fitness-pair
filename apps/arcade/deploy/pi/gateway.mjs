import {readFileSync} from 'node:fs';
import {createGateway} from '../gcp/gateway.mjs';
import {createFederatedTokenProvider} from './identity.mjs';
import worker from '../../server/worker.js';
import {directUploadWorker} from './direct-uploads.mjs';

// Preserve the deployed game release while adapting identity and upload transport.
const release=JSON.parse(readFileSync(new URL('../../../../release.json',import.meta.url),'utf8'));
const env={...process.env,GCP_ACCESS_TOKEN_PROVIDER:createFederatedTokenProvider()};
delete env.GCP_IMPERSONATE_SERVICE_ACCOUNT;
delete env.GCP_SERVICE_ACCOUNT_JSON;
const galleryWorker=await directUploadWorker(worker,{directory:env.FITNESS_STATE_DIR+'/direct-uploads'});
const server=createGateway({release:{...release,host:'songyy-pi'},env,galleryWorker});
server.requestTimeout=300000;
server.headersTimeout=15000;
server.listen(8411,'127.0.0.1',()=>console.log('Fitness arcade Pi gateway listening on 127.0.0.1:8411'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(1),10000).unref();
});
