// Reuses the baseline classic Worker approach for the unmodified WASM loader.
self.exports = {};
importScripts(new URL('vision_bundle.js', self.location.href).href);
const { FilesetResolver, PoseLandmarker, HandLandmarker } = self.exports;
let model, mode;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      mode = data.mode;
      const files = await FilesetResolver.forVisionTasks(new URL('wasm/', self.location.href).href);
      const hands = mode === 'hands';
      const options = {
        baseOptions: { modelAssetPath: new URL(hands ? 'hand_landmarker.task' : 'pose_landmarker_lite.task', self.location.href).href, delegate: 'CPU' },
        runningMode: 'VIDEO',
        ...(hands ? { numHands: 2, minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .6 }
          : { numPoses: 1, minPoseDetectionConfidence: .6, minPosePresenceConfidence: .6, minTrackingConfidence: .6 }),
      };
      model = await (hands ? HandLandmarker : PoseLandmarker).createFromOptions(files, options);
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      const start = performance.now();
      const result = model.detectForVideo(data.bitmap, data.time);
      self.postMessage({ type: 'result', landmarks: result.landmarks, handedness: result.handedness,
        time: data.time, inferenceMs: performance.now() - start });
    }
  } catch (error) { self.postMessage({ type: 'error', message: String(error.message) }); }
  finally { data.bitmap?.close(); }
};
