import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const run=promisify(execFile);
const unavailable=()=>Object.assign(new Error('Gallery authentication is unavailable. Please try later.'),{status:503});

// The helper writes credentials only to its private stdout pipe, never disk/logs.
export function createFederatedTokenProvider({now=()=>Date.now(),refresh=async()=>{
  const {stdout}=await run('/opt/fitness-arcade/auth-venv/bin/python',
    [fileURLToPath(new URL('./federated_credentials.py',import.meta.url))],
    {timeout:30000,maxBuffer:16384,env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:'/etc/fitness-arcade/gcs-wif.json'}});
  return JSON.parse(stdout);
}}={}) {
  let cached=null,pending=null;
  return async()=>{
    if(cached&&cached.until>now())return cached.token;
    if(!pending)pending=(async()=>{
      try {
        const result=await refresh();
        const until=Date.parse(result.expiry)-60000;
        if(typeof result.token!=='string'||!result.token||!Number.isFinite(until)||until<=now())throw unavailable();
        cached={token:result.token,until};
        return cached.token;
      } catch {throw unavailable();}
      finally {pending=null;}
    })();
    return pending;
  };
}
