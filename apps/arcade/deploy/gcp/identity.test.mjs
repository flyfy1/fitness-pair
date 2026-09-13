import test from 'node:test';
import assert from 'node:assert/strict';
import {createMetadataTokenProvider} from './identity.mjs';

test('metadata credentials are exchanged for the dedicated identity, coalesced and refreshed before expiry',async()=>{
  let time=Date.UTC(2026,8,13),metadataCalls=0,exchanges=0;
  const provider=createMetadataTokenProvider({serviceAccount:'gallery@example-project.iam.gserviceaccount.com',now:()=>time,fetcher:async(url,options)=>{
    assert.equal(options.redirect,'error');assert.ok(options.signal);
    if(url.startsWith('http://metadata.google.internal/')){
      metadataCalls++;assert.equal(options.headers['Metadata-Flavor'],'Google');
      return Response.json({access_token:'synthetic-vm-token'});
    }
    exchanges++;assert.match(url,/gallery%40example-project\.iam\.gserviceaccount\.com:generateAccessToken$/);
    assert.equal(options.headers.Authorization,'Bearer synthetic-vm-token');
    assert.deepEqual(JSON.parse(options.body),{scope:['https://www.googleapis.com/auth/devstorage.read_write'],lifetime:'3600s'});
    return Response.json({accessToken:'synthetic-storage-token-'+exchanges,expireTime:new Date(time+3600000).toISOString()});
  }});
  assert.deepEqual(await Promise.all(Array.from({length:24},()=>provider())),Array(24).fill('synthetic-storage-token-1'));
  assert.equal(metadataCalls,1);assert.equal(exchanges,1);
  time+=3539000;assert.equal(await provider(),'synthetic-storage-token-1');
  time+=2000;assert.equal(await provider(),'synthetic-storage-token-2');assert.equal(exchanges,2);
});

test('failed credential refresh exposes no upstream secrets and can be retried',async()=>{
  let calls=0;
  const provider=createMetadataTokenProvider({serviceAccount:'gallery@example-project.iam.gserviceaccount.com',fetcher:async()=>{
    calls++;throw new Error('A sensitive upstream response must never reach the browser');
  }});
  for(let i=0;i<2;i++)await assert.rejects(provider(),error=>error.status===503&&error.message==='Gallery authentication is unavailable. Please try later.');
  assert.equal(calls,2);
});
