import test from 'node:test';
import assert from 'node:assert/strict';
import {GuardianWave} from '../src/guardian-wave.js';

test('guardians approach only during active play and preserve spacing at the front', () => {
  const wave = new GuardianWave(); wave.update(0, false, 0);
  for (let time = 100; time <= 2000; time += 100) wave.update(time, false, 0);
  assert.equal(wave.position(0), .84);
  for (let time = 2100; time <= 22000; time += 100) wave.update(time, true, 0);
  assert.equal(wave.position(0), .50);
  assert.ok(wave.position(1) - wave.position(0) >= .18 - Number.EPSILON);
  const stopped = wave.position(0); wave.update(23000, false, 0);
  assert.equal(wave.position(0), stopped);
});

test('a scored hit brings the next guardian forward without scoring from elapsed time', () => {
  const wave = new GuardianWave(); wave.update(0, true, 0);
  for (let time = 100; time <= 2000; time += 100) wave.update(time, true, 0);
  assert.equal(wave.defeated, 0);
  const next = wave.position(1);
  for (let time = 2100; time <= 4000; time += 100) wave.update(time, true, 1);
  assert.ok(wave.position(1) < next);
  assert.equal(wave.defeated, 1);
  wave.reset(); assert.equal(wave.position(0), .84); assert.equal(wave.defeated, 0);
});
