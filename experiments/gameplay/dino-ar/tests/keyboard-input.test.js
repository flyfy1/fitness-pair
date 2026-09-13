import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardInput } from '../src/keyboard-input.js';
import { Runner } from '../../../../apps/dino-run/src/engine.js';

function harness() {
  const input = new KeyboardInput(); input.reset('synthetic-test');
  let time=0;
  return {input, step:(dt=.02)=>input.update(time+=dt*1000,dt)};
}
test('keyboard produces proportional recognizer frames and a single completed landing event',()=>{
  for (const peak of [.25,.6,1]) {
    const {input,step}=harness();
    const ready=step(); assert.equal(ready.heightRatio,0);
    assert.deepEqual(ready.source,{kind:'synthetic',id:'keyboard-preview'});
    assert.equal(input.jump(peak),true);
    const frames=Array.from({length:60},()=>step());
    const maximum=Math.max(...frames.map(f=>f.heightRatio));
    assert.ok(Math.abs(maximum-peak)<.003);
    const complete=frames.filter(f=>f.completion); assert.equal(complete.length,1);
    assert.equal(complete[0].heightRatio,0); assert.equal(complete[0].bestHeightRatio,peak);
    assert.ok(frames.findIndex(f=>f.completion)>frames.findIndex(f=>f.heightRatio===maximum));
    assert.ok(frames.every((f,i)=>!i||f.tMs>frames[i-1].tMs&&f.inputSeq>frames[i-1].inputSeq));
  }
});
test('held or repeated keys cannot retrigger in flight; pausing preserves height and retries have distinct identities',()=>{
  const {input,step}=harness(); input.jump(); step();
  assert.equal(input.jump(),false);
  const before=step(), paused=input.update(before.tMs+1000,0);
  assert.equal(paused.heightRatio,before.heightRatio);
  assert.equal(input.update(before.tMs+1000,0),null);
  let result;
  for(let i=0;i<50;i++) { const f=input.update(before.tMs+1020+i*20,.02); if(f.completion)result=f; }
  assert.ok(result.completion);
  input.reset('new-session'); input.jump();
  let next;
  for(let i=0;i<50;i++){const f=input.update(i*20,.02);if(f.completion)next=f;}
  assert.notEqual(next.completion.id,result.completion.id);
});
test('the same motion-mode Runner consumes synthetic output and rejects camera or stale frames',()=>{
  const {input,step}=harness(), runner=new Runner(); runner.setControlMode('motion');
  runner.bindMotionSession(input.session); runner.command('start'); input.jump(.6);
  for(let i=0;i<50;i++) {
    const f=step(); assert.equal(runner.applyMotion(f),true);
    assert.equal(runner.y,f.heightRatio*165);
    assert.equal(runner.applyMotion(f),false);
    assert.equal(runner.applyMotion({...f,inputSeq:f.inputSeq+1000,tMs:f.tMs+1000,source:{kind:'camera',id:'other'}}),false);
  }
  assert.equal(runner.jumps,1); assert.equal(runner.y,0);
});
