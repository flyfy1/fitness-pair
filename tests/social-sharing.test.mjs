import test from 'node:test';
import assert from 'node:assert/strict';
import {shareMessage,socialLinks} from '../apps/arcade/src/social-sharing.js';
const clip={id:'fixture',game:'motion-quest',source:'synthetic',title:'Demo',visibility:'private',url:'/clips/fixture?share=synthetic%2Btoken%2F%3D&manage=never-share',expiresAt:Date.UTC(2026,9,2)};
test('private message preserves access token and expiry but excludes management parameters',()=>{
 const message=shareMessage(clip,{origin:'https://example.test'});
 assert.equal(new URL(message.url).searchParams.get('share'),'synthetic+token/=');
 assert.match(message.text,/2026-10-02/);assert.match(message.text,/Anyone with it can watch/);
 assert.ok(!message.text.includes('manage'));assert.match(message.text,/demo/);
 assert.throws(()=>shareMessage({...clip,url:'/clips/fixture'}),/private sharing link is unavailable/);
});
test('public platform links contain the viewer URL without private or management tokens',()=>{
 const message=shareMessage({...clip,visibility:'public'},{origin:'https://example.test'});
 for(const [name,href] of socialLinks(message)){
  const parsed=new URL(href);assert.equal(parsed.searchParams.get(name==='Facebook'?'u':'url'),'https://example.test/clips/fixture');
  assert.ok(!href.includes('token'));assert.ok(!href.includes('manage'));
 }
});
test('local messages invite play and require a video attachment, without fabricating a watch link',()=>{
 const message=shareMessage(clip,{local:true});
 assert.match(message.text,/attachment/);assert.match(message.url,/\/play\/motion-quest$/);
 assert.ok(!message.text.includes('/clips/'));assert.ok(!message.text.includes('token'));
});
