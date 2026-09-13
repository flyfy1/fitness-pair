import test from 'node:test';
import assert from 'node:assert/strict';
import { Runner, MOTION_MAX_HEIGHT } from '../src/engine.js';

test('calibrated motion height directly follows rise/descent; progress never counts jumps', () => {
  const g = new Runner(); g.setControlMode('motion');
  const session = { sessionId: 'test', source: { kind: 'synthetic', id: 'fixture' } };
  g.bindMotionSession(session); g.command('start');
  let seq = 0;
  const frame = heightRatio => ({ version:1, ...session, inputSeq:++seq, tMs:seq*40,
    recognizerId:'jump-height-2d/1', action:'jump-height', phase:'active', cue:'jumping',
    progress:heightRatio, calibrationProgress:null, completion:null, heightRatio, calibrated:true, stage:'ready' });
  for (const ratio of [.25,.5,1,.5,0]) {
    assert.equal(g.applyMotion(frame(ratio)),true); g.step(.04);
    assert.equal(g.y,ratio*MOTION_MAX_HEIGHT); assert.equal(g.jumps,0);
  }
  assert.equal(g.command('jump'),false);
  const landing = {...frame(0),phase:'completed',completion:{id:'one',repIndex:1}};
  g.applyMotion(landing); assert.equal(g.jumps,1);
  g.applyMotion({...landing,inputSeq:++seq,tMs:seq*40}); assert.equal(g.jumps,1);
  g.applyMotion({...frame(.9),sessionId:'foreign'}); assert.equal(g.y,0);
  const stale = frame(.4); g.applyMotion(stale); g.applyMotion({...stale,heightRatio:1}); assert.equal(g.y,.4*MOTION_MAX_HEIGHT);
  g.command('pause'); g.applyMotion(frame(1)); assert.equal(g.y,.4*MOTION_MAX_HEIGHT);
});

test('motion mode rejects uncalibrated and missing poses and resets on control switch', () => {
  const g = new Runner();g.setControlMode('motion');
  const source={kind:'synthetic',id:'test'};g.bindMotionSession({sessionId:'test',source});
  const frame={version:1,sessionId:'test',source,inputSeq:1,tMs:40,recognizerId:'jump-height-2d/1',
    action:'jump-height',phase:'calibrating',cue:'stand-still',progress:0,calibrationProgress:.5,
    completion:null,calibrated:false,stage:'standing',heightRatio:0};
  assert.equal(g.applyMotion(frame),false);assert.equal(g.y,0);
  g.command('start');g.step(.1);g.setControlMode('keyboard');
  assert.equal(g.status,'ready');assert.equal(g.score,0);assert.equal(g.controlMode,'keyboard');
});

test('jump has one impulse, lands, and can jump again', () => {
  const game = new Runner(); game.command('start');
  assert.equal(game.command('jump'), true); assert.equal(game.command('jump'), false);
  for (let i=0;i<100;i++) game.step(1/120);
  assert.equal(game.y, 0); assert.equal(game.command('jump'), true);
});
test('collision ends the run; pause freezes; restart resets the round', () => {
  const game = new Runner(); game.command('start'); game.step(.1); game.command('pause');
  const before = game.snapshot(); game.step(.1); assert.deepEqual(game.snapshot(), before);
  assert.equal(game.command('jump'), false); game.command('resume');
  game.obstacles.push({x:110, w:30, h:50}); game.step(.02);
  assert.equal(game.status,'over'); const score = game.score; game.step(.1); assert.equal(game.score,score);
  game.command('restart'); assert.equal(game.status,'running'); assert.equal(game.score,0); assert.equal(game.obstacles.length,0);
});
test('timed jump clears a real obstacle at starting and maximum speeds', () => {
  for (const elapsed of [0,120]) {
    const game = new Runner(); game.command('start'); game.elapsed = elapsed; game.spawnIn = 100;
    const speed = Math.min(560,310+elapsed*2.4);
    game.obstacles.push({x:116+speed*.18, w:42, h:57, passed:false});
    game.command('jump'); for(let i=0;i<100;i++) game.step(1/120);
    assert.equal(game.status,'running'); assert.equal(game.passed,1);
  }
});
test('simulation is consistent at 30 and 120 FPS, ignores invalid time and caps interruptions', () => {
  const simulate = fps => { const g=new Runner();g.command('start');g.spawnIn=100;g.command('jump');for(let i=0;i<fps;i++)g.step(1/fps);return g; };
  const a=simulate(30), b=simulate(120); assert.ok(Math.abs(a.distance-b.distance)<.01); assert.equal(a.y,b.y);
  const snap=a.snapshot(); a.step(NaN);a.step(-1);assert.deepEqual(a.snapshot(),snap);
  a.step(300);assert.ok(a.elapsed<1.11);
});
