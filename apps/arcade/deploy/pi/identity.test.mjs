import test from 'node:test';
import assert from 'node:assert/strict';
import {createFederatedTokenProvider} from './identity.mjs';

test('federated refresh coalesces requests, caches, and refreshes before expiry',async()=>{
  let now=100000,calls=0;
  const provider=createFederatedTokenProvider({now:()=>now,refresh:async()=>{
    calls++;return {token:`synthetic-${calls}`,expiry:new Date(now+3600000).toISOString()};
  }});
  assert.deepEqual(await Promise.all([provider(),provider(),provider()]),Array(3).fill('synthetic-1'));
  assert.equal(calls,1);now+=3500000;assert.equal(await provider(),'synthetic-1');
  now+=50000;assert.equal(await provider(),'synthetic-2');assert.equal(calls,2);
});

test('failure is sanitized, retriable, and never returns expired credentials',async()=>{
  let calls=0;
  const provider=createFederatedTokenProvider({now:()=>100000,refresh:async()=>{
    calls++;
    if(calls===1)throw Error('sensitive provider response');
    if(calls===2)return {token:'expired',expiry:new Date(100000).toISOString()};
    return {token:'synthetic-good',expiry:new Date(3700000).toISOString()};
  }});
  for(let i=0;i<2;i++)await assert.rejects(provider(),e=>e.status===503&&!e.message.includes('sensitive'));
  assert.equal(await provider(),'synthetic-good');
});
