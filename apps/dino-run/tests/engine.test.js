import test from 'node:test';
import assert from 'node:assert/strict';
import { Runner } from '../src/engine.js';

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
