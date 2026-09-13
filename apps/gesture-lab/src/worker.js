// This provider adapts model-specific arrays before emitting app-local observations.
self.exports = {};
importScripts(new URL('vision_bundle.js', self.location.href).href);
const { FilesetResolver, GestureRecognizer } = self.exports;
const names = ['wrist', 'thumbCmc', 'thumbMcp', 'thumbIp', 'thumbTip', 'indexMcp',
  'indexPip', 'indexDip', 'indexTip', 'middleMcp', 'middlePip', 'middleDip', 'middleTip',
  'ringMcp', 'ringPip', 'ringDip', 'ringTip', 'pinkyMcp', 'pinkyPip', 'pinkyDip', 'pinkyTip'];
let recognizer;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks(`${data.base}runtime/wasm`);
      recognizer = await GestureRecognizer.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${data.base}runtime/gesture_recognizer.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .6,
        minHandPresenceConfidence: .6, minTrackingConfidence: .6,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message) }); }
  } else if (data.type === 'frame') {
    try {
      const start = performance.now();
      const result = recognizer.recognizeForVideo(data.bitmap, data.time);
      const hands = result.landmarks.map((points, i) => ({
        side: result.handedness[i]?.[0]?.categoryName ?? 'Unknown',
        category: result.gestures[i]?.[0]?.categoryName ?? 'None',
        score: result.gestures[i]?.[0]?.score ?? 0,
        joints: Object.fromEntries(points.map((p, j) => [names[j], { x: p.x, y: p.y, confidence: null }])),
      }));
      self.postMessage({ type: 'hands', hands, time: data.time, inferenceMs: performance.now() - start });
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message) }); }
    finally { data.bitmap.close(); }
  }
};
