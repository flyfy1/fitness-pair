const METADATA='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const SCOPE='https://www.googleapis.com/auth/devstorage.read_write';
const unavailable=()=>Object.assign(new Error('Gallery authentication is unavailable. Please try later.'),{status:503});

/** Refresh short-lived storage credentials using the VM identity; never persist tokens or keys. */
export function createMetadataTokenProvider({serviceAccount,fetcher=fetch,now=()=>Date.now()}) {
  if(!/^[a-zA-Z0-9-]+@[a-zA-Z0-9-]+\.iam\.gserviceaccount\.com$/.test(serviceAccount))throw new Error('Invalid gallery service account.');
  let cached=null,pending=null;
  async function refresh(){
    const response=await fetcher(METADATA,{headers:{'Metadata-Flavor':'Google'},redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw unavailable();
    const identity=await response.json();
    if(typeof identity.access_token!=='string'||!identity.access_token)throw unavailable();
    const tokenResponse=await fetcher(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`,{
      method:'POST',headers:{Authorization:'Bearer '+identity.access_token,'Content-Type':'application/json'},
      body:JSON.stringify({scope:[SCOPE],lifetime:'3600s'}),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!tokenResponse.ok)throw unavailable();
    const result=await tokenResponse.json(),until=Date.parse(result.expireTime)-60000;
    if(typeof result.accessToken!=='string'||!result.accessToken||!Number.isFinite(until)||until<=now())throw unavailable();
    cached={token:result.accessToken,until};return cached.token;
  }
  return async()=>{
    if(cached&&cached.until>now())return cached.token;
    if(!pending)pending=refresh().catch(()=>{throw unavailable();}).finally(()=>{pending=null;});
    return pending;
  };
}
