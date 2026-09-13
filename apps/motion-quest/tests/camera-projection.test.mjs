import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraPoint } from '../src/camera-projection.js';

test('wide camera viewport crops vertically and mirrors only display coordinates', () => {
  const input = { x: .25, y: .25 };
  assert.deepEqual(cameraPoint(input, 1280, 720, 640, 480), { x: 320, y: 120 });
  assert.deepEqual(cameraPoint(input, 1280, 720, 640, 480, true), { x: 960, y: 120 });
  assert.deepEqual(input, { x: .25, y: .25 });
});

test('portrait cover crop keeps the body center aligned and offscreen joints offscreen', () => {
  assert.deepEqual(cameraPoint({ x: .5, y: .5 }, 390, 844, 640, 480, true), { x: 195, y: 422 });
  assert.ok(cameraPoint({ x: 0, y: .5 }, 390, 844, 640, 480).x < 0);
  assert.ok(cameraPoint({ x: 0, y: .5 }, 390, 844, 640, 480, true).x > 390);
});
