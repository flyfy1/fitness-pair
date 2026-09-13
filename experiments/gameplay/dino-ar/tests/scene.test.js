import test from 'node:test';
import assert from 'node:assert/strict';
import { videoProjection, sceneGeometry } from '../src/scene.js';
import { intersects } from '../../../../apps/dino-run/src/engine.js';

test('mirrored cover projection matches cropped landscape and portrait video without changing input', () => {
  const joint = { x: .25, y: .25 };
  assert.deepEqual(videoProjection({ width: 640, height: 480 }, 1440, 960).point(joint), { x: 1080, y: 210 });
  const portrait = videoProjection({ width: 640, height: 480 }, 390, 844).point({ x: .5, y: .5 });
  assert.deepEqual(portrait, { x: 195, y: 422 });
  assert.deepEqual(joint, { x: .25, y: .25 });
});

test('visible collision boxes and engine collisions agree across viewports and jump heights', () => {
  for (const [width, height] of [[1440,960],[390,844],[844,390]]) {
    const g = sceneGeometry(width, height);
    assert.equal(g.sx,g.sy);
    assert.ok(g.player(165).y >= 99);
    assert.ok(g.player(0).x > 0);
    assert.ok(g.player(0).y + g.player(0).h < height);
    if (height > 600) assert.ok(g.player(0).h >= 75, 'Dinosaur should be readable at a distance');
    assert.ok(g.obstacle({x:g.worldWidth+30,w:18,h:58}).x > width);
    for (const rise of [0,20,80,165]) for (const x of [60,90,105,120,200]) {
      const o = { x, w:18, h:58 };
      assert.equal(intersects(g.player(rise), g.obstacle(o)),
        intersects({x:84,y:-rise-47,w:32,h:44},{x:x+4,y:-54,w:10,h:54}));
    }
  }
});

test('camera-independent playfield scales with the viewport and uses the full horizontal lane', () => {
  const desktop=sceneGeometry(1440,960), mobile=sceneGeometry(390,844);
  assert.ok(desktop.player(0).h>100);
  assert.ok(mobile.player(0).h>75);
  assert.equal(desktop.origin.y,960*.8);
  assert.equal(mobile.origin.y,844*.73);
  assert.ok(desktop.origin.x<1440*.3);
  assert.ok(mobile.origin.x<390*.3);
});
