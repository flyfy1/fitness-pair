import test from 'node:test';
import assert from 'node:assert/strict';
import {readLanguage,saveLanguage,subscribeLanguage,preferredLanguage,normalizeLanguage} from '../packages/gameplay/locale.js';
import baseCatalog from '../packages/gameplay/translations/zh-CN.json' with {type:'json'};

import sharingCatalog from '../packages/gameplay/translations/sharing.zh-CN.json' with {type:'json'};
const catalog=[...baseCatalog,...sharingCatalog];
const stateKey=Symbol.for('hopmodo.language.preference');
test('browser preference, explicit choice, unsupported languages and storage denial',()=>{
 const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try {
  delete globalThis[stateKey];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{languages:['zh-TW','en-US']}});
  let saved=null;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>saved,setItem:(_,value)=>{saved=value;}}});
  assert.equal(readLanguage(),'zh');assert.equal(saved,null,'automatic choice must not become an explicit preference');
  const changes=[],unsubscribe=subscribeLanguage(value=>changes.push(value));
  saveLanguage('en');assert.equal(readLanguage(),'en');assert.equal(saved,'en');
  unsubscribe();saveLanguage('zh-CN');assert.deepEqual(changes,['en']);
  delete globalThis[stateKey];assert.equal(readLanguage(),'zh','saved choice survives a new document');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('blocked');}});
  delete globalThis[stateKey];assert.equal(readLanguage(),'zh');saveLanguage('en');assert.equal(readLanguage(),'en');
  assert.equal(preferredLanguage(['fr-FR','zh-CN']),'en');
  assert.equal(preferredLanguage(['zh-HK']),'zh');assert.equal(preferredLanguage([]),'en');
  assert.equal(normalizeLanguage('zh_CN'),'zh');assert.equal(normalizeLanguage('zhanything'),'en');
 } finally {
  delete globalThis[stateKey];
  if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;
  if(originalStorage)Object.defineProperty(globalThis,'localStorage',originalStorage);else delete globalThis.localStorage;
 }
});
test('translation IDs and sources are unique and preserve interpolation slots',()=>{
 const ids=new Set(),sources=new Set();
 for(const {id,en,zh} of catalog){
  assert.ok(id&&en&&zh,id);assert.ok(!ids.has(id),`Duplicate ID ${id}`);ids.add(id);
  const source=en.replace(/\s+/g,' ').trim();assert.ok(!sources.has(source),`Duplicate source ${en}`);sources.add(source);
  assert.deepEqual([...en.matchAll(/\{\d+\}/g)].map(x=>x[0]).sort(),[...zh.matchAll(/\{\d+\}/g)].map(x=>x[0]).sort(),id);
 }
});

test('dynamic messages preserve empty slots, separators and directional decorations',async()=>{
 const {translateText,message}=await import('../packages/gameplay/i18n.js');
 assert.equal(message('landing.arcade',[],'zh'),'游戏大厅');
 assert.equal(translateText('Play replay','zh'),'播放回放');
 assert.equal(translateText('Manage my shared clips →','zh'),'管理我分享的片段 →');
 assert.equal(translateText('Synthetic gameplay · 7 seconds · MP4 · Saved on this device','zh'),'模拟游戏内容 · 7 秒 · MP4 · 已保存到此设备');
 assert.match(translateText('Recording 1 / 90 seconds · MP4 · stays on this device','zh'),/^正在录制 1 \/ 90 秒/);
 assert.equal(translateText('Unrecognized product copy','zh'),'Unrecognized product copy');
});
