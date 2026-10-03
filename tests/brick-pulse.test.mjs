import test from 'node:test';
import assert from 'node:assert/strict';
import {BrickPulseEngine} from '../apps/integ-ar/src/originals/games/breakout/engine.js';

const advance=(game,ms,fps=60)=>{const events=[];for(let i=0;i<Math.round(ms/1000*fps);i++)events.push(...game.advance(1000/fps));return events;};
const miss=game=>{game.serveRemainingMs=0;game.ball={x:30,y:539,dx:0,dy:300};return game.advance(1000/120);};

test('a missed ball preserves points and bricks twice, then ends the round exactly once',()=>{
 const game=new BrickPulseEngine();game.score=120;
 const bricks=structuredClone(game.bricks);
 for(const lives of [2,1]){
  assert.deepEqual(miss(game),[{kind:'life-lost'}]);
  assert.equal(game.lives,lives);assert.equal(game.over,false);assert.equal(game.score,120);
  assert.deepEqual(game.bricks,bricks);assert.equal(game.serveRemainingMs,2000);
 }
 assert.deepEqual(miss(game),[{kind:'lost'}]);assert.equal(game.lives,0);assert.equal(game.snapshot().phase,'lost');
 const final=game.snapshot();assert.deepEqual(game.advance(1000),[]);assert.deepEqual(game.snapshot(),final);
});
test('a fresh serve follows the paddle and launches only after active preparation time',()=>{
 const game=new BrickPulseEngine();game.movePaddle(270);
 assert.equal(game.ball.x,310);assert.equal(game.ball.dy,0);
 assert.equal(advance(game,1500).length,0);assert.ok(game.serveRemainingMs>0);
 assert.deepEqual(advance(game,300),[{kind:'serve'}]);assert.equal(game.serveRemainingMs,0);assert.ok(game.ball.dy<0);
 // Reading a paused host's snapshot does not consume time or reset its ball.
 const frozen=game.snapshot();for(let i=0;i<20;i++)assert.deepEqual(game.snapshot(),frozen);
});
test('ball motion, collision scoring and life count are identical at 20, 30, 60 and 120 FPS',()=>{
 for(const duration of [8000,16000]){
  const results=[20,30,60,120].map(fps=>{
   const game=new BrickPulseEngine(),events=advance(game,duration,fps);
   return {snapshot:game.snapshot(),events};
  });
  for(const result of results.slice(1))assert.deepEqual(result,results[0]);
  // The first reinforced-row contact does not score. Exercise all three serves
  // to compare destruction, missed balls and final state as well as free motion.
  if(duration===16000){
   assert.equal(results[0].snapshot.score,10);assert.equal(results[0].snapshot.lives,0);
   assert.equal(results[0].events.filter(event=>event.kind==='serve').length,3);
  }
 }
});
test('paddle impacts preserve speed and reflect upward with directional control',()=>{
 for(const x of [110,150,190]){
  const game=new BrickPulseEngine();game.movePaddle(110);game.serveRemainingMs=0;
  game.ball={x,y:493,dx:0,dy:300};
  const events=game.advance(1000/120);assert.equal(events[0].kind,'paddle');assert.ok(game.ball.dy<0);
  assert.ok(Math.abs(Math.hypot(game.ball.dx,game.ball.dy)-300)<1e-6);
  if(x===110)assert.ok(game.ball.dx<0);if(x===190)assert.ok(game.ball.dx>0);
 }
});
test('a reinforced brick requires two collisions and only destruction scores',()=>{
 const game=new BrickPulseEngine();game.serveRemainingMs=0;game.bricks=[{x:150,y:150,hp:2},{x:20,y:100,hp:1}];
 for(const expected of [1,0]){
  game.ball={x:170,y:175,dx:0,dy:-300};const events=game.advance(1000/120);
  assert.equal(events[0].kind,'brick');assert.equal(events[0].cleared,expected===0);
  assert.equal(game.score,expected===0?10:0);
 }
 assert.equal(game.bricks.length,1);
});
test('clearing a level earns its bonus and prepares another serve without losing a life',()=>{
 const game=new BrickPulseEngine();game.lives=2;game.serveRemainingMs=0;game.bricks=[{x:150,y:150,hp:1}];
 game.ball={x:170,y:175,dx:0,dy:-300};const events=game.advance(1000/120);
 assert.deepEqual(events.map(event=>event.kind),['brick','level']);assert.equal(game.score,110);
 assert.equal(game.level,2);assert.equal(game.lives,2);assert.equal(game.serveRemainingMs,1800);
 assert.equal(game.bricks.length,48);
});
test('a long stall is bounded and invalid control/time input cannot corrupt the game',()=>{
 const game=new BrickPulseEngine(),reference=new BrickPulseEngine();
 game.advance(10000);reference.advance(100);assert.deepEqual(game.snapshot(),reference.snapshot());
 const before=game.snapshot();for(const value of [NaN,Infinity,-Infinity]){game.movePaddle(value);assert.deepEqual(game.advance(value),[]);}
 assert.deepEqual(game.snapshot(),before);game.reset();assert.equal(game.lives,3);assert.equal(game.score,0);
});
