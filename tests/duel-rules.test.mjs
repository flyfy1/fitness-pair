import test from 'node:test';
import assert from 'node:assert/strict';
import {duelScore,duelResult,seededRandom} from '../apps/integ-ar/src/duel-rules.js';
test('duels retain every knife hit across native stage score resets', () => {
  assert.equal(duelScore('knife',{score:7,targets:8}),7);
  assert.equal(duelScore('knife',{score:0,targets:11}),8);
  assert.equal(duelScore('knife',{score:2,targets:14}),21);
  assert.equal(duelScore('stack',{score:50}),50);
  assert.equal(duelResult([8,8]),'Draw');
  assert.equal(duelResult([8,7]),'Left player wins');
  assert.equal(duelResult([7,8]),'Right player wins');
});
test('separate board random generators retain matching initial conditions without sharing mutable state', () => {
  const a = seededRandom(123), b = seededRandom(123);
  const first = Array.from({length:20},a);
  assert.deepEqual(Array.from({length:20},b),first);
  assert.ok(first.every(value => value >= 0 && value < 1));
});
