// Copied to the host app's public/runtime by its prepare-assets script.
// A dedicated classic worker supports MediaPipe's unmodified WASM loader.
self.exports = {};
importScripts(new URL('vision_bundle.js', self.location.href).href);
const { FilesetResolver, PoseLandmarker } = self.exports;

let landmarker;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks(`${data.base}runtime/wasm`);
      const options = { baseOptions: { modelAssetPath: `${data.base}runtime/pose_landmarker_lite.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .6,
        minPosePresenceConfidence: .6, minTrackingConfidence: .6 };
      landmarker = await PoseLandmarker.createFromOptions(files, options);
      self.postMessage({ type: 'ready', delegate: 'CPU' });
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message) }); }
  } else if (data.type === 'frame') {
    try {
      const start = performance.now();
      const result = landmarker.detectForVideo(data.bitmap, data.time);
      self.postMessage({ type: 'pose', landmarks: result.landmarks[0] ?? [], time: data.time,
        inferenceMs: performance.now() - start });
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message) }); }
    finally { data.bitmap.close(); }
  }
};
