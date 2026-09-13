// Classic Worker: preload never requests a camera or creates a detector.
importScripts(new URL('asset-cache.js', self.location.href).href);
let landmarker;
self.onmessage = async ({ data }) => {
  if (data.type === 'init' || data.type === 'preload') {
    const urls = [];
    const blobURL = (bytes, type = 'text/javascript') => {
      const url = URL.createObjectURL(new Blob([bytes], { type })); urls.push(url); return url;
    };
    try {
      const { buffers, selected, persistent } = await HopmodoTrackingAssets.load({ base: data.base,
        onProgress: progress => self.postMessage({ type: 'progress', ...progress }),
        select: async bundle => {
          self.exports = {};
          importScripts(blobURL(bundle));
          const simd = await self.exports.FilesetResolver.isSimdSupported();
          const name = `wasm/vision_wasm_${simd ? '' : 'nosimd_'}internal`;
          return [`${name}.js`, `${name}.wasm`];
        } });
      if (data.type === 'preload') { self.postMessage({ type: 'preloaded', persistent }); return; }
      self.postMessage({ type: 'progress', state: 'initializing' });
      const files = { wasmLoaderPath: blobURL(buffers[selected[0]]),
        wasmBinaryPath: blobURL(buffers[selected[1]], 'application/wasm') };
      const options = { baseOptions: { modelAssetBuffer: new Uint8Array(buffers['pose_landmarker_lite.task']), delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .6,
        minPosePresenceConfidence: .6, minTrackingConfidence: .6 };
      landmarker = await self.exports.PoseLandmarker.createFromOptions(files, options);
      self.postMessage({ type: 'ready', delegate: 'CPU' });
    } catch (error) { self.postMessage({ type: 'error', name: error.name, message: String(error.message) }); }
    finally { urls.forEach(url => URL.revokeObjectURL(url)); }
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
