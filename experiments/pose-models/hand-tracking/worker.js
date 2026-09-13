// Classic Worker: the unmodified MediaPipe WASM loader needs script semantics.
self.exports = {};
importScripts(new URL('vision_bundle.js', self.location.href).href);
const { FilesetResolver, HandLandmarker } = self.exports;
let model;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const files = await FilesetResolver.forVisionTasks(new URL('wasm/', self.location.href).href);
      model = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('hand_landmarker.task', self.location.href).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .6,
      });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      const started = performance.now();
      const result = model.detectForVideo(data.bitmap, data.tMs);
      self.postMessage({ type: 'hands', landmarks: result.landmarks, handedness: result.handedness,
        tMs: data.tMs, seq: data.seq, inferenceMs: performance.now() - started });
    }
  } catch (error) { self.postMessage({ type: 'error', message: String(error.message) }); }
  finally { if (data.type === 'frame') data.bitmap.close(); }
};
