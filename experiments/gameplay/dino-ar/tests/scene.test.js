import test from 'node:test';
import assert from 'node:assert/strict';
import { videoProjection, sceneGeometry, anchorFromPose } from '../src/scene.js';
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
    const anchor = { image: { width: 640, height: 480 }, x: .5, y: .88, peakRise: .14 };
    const g = sceneGeometry(anchor, width, height);
    assert.ok(Math.abs(g.player(0).y - g.player(165).y - .14 * videoProjection(anchor.image,width,height).height) < 1e-8);
    for (const rise of [0,20,80,165]) for (const x of [60,90,105,120,200]) {
      const o = { x, w:18, h:58 };
      assert.equal(intersects(g.player(rise), g.obstacle(o)),
        intersects({x:84,y:-rise-47,w:32,h:44},{x:x+4,y:-54,w:10,h:54}));
    }
  }
});

test('anchor uses feet or torso explicitly and rejects unknown confidence', () => {
  const frame = { image: {width:640,height:480}, joints: {
    leftAnkle: {x:.4,y:.88,confidence:.9}, rightAnkle:{x:.6,y:.88,confidence:.9},
    leftHip:{x:.4,y:.48,confidence:.9}, rightHip:{x:.6,y:.48,confidence:.9},
  } };
  assert.equal(anchorFromPose(frame,{trackingMode:'full-body',peakRise:.14}).y,.88);
  assert.equal(anchorFromPose(frame,{trackingMode:'upper-body',peakRise:.14}).y,.88);
  frame.joints.leftAnkle.confidence = null;
  assert.equal(anchorFromPose(frame,{trackingMode:'upper-body',peakRise:.14}).y,.48);
  frame.joints.leftHip.confidence = null;
  assert.equal(anchorFromPose(frame,{trackingMode:'full-body',peakRise:.14}),null);
});
