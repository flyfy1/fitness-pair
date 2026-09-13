import { fromMediaPipe } from '../../../packages/pose-mediapipe/index.js';
export const upperNames = ['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist'];
export const bodyEdges = [['leftShoulder','rightShoulder'], ['leftShoulder','leftElbow'], ['leftElbow','leftWrist'], ['rightShoulder','rightElbow'], ['rightElbow','rightWrist'], ['leftShoulder','leftHip'], ['rightShoulder','rightHip'], ['leftHip','rightHip'], ['leftHip','leftKnee'], ['leftKnee','leftAnkle'], ['rightHip','rightKnee'], ['rightKnee','rightAnkle']];
export const handNames = ['wrist', 'thumbCMC', 'thumbMCP', 'thumbIP', 'thumbTip', 'indexMCP', 'indexPIP', 'indexDIP', 'indexTip', 'middleMCP', 'middlePIP', 'middleDIP', 'middleTip', 'ringMCP', 'ringPIP', 'ringDIP', 'ringTip', 'pinkyMCP', 'pinkyPIP', 'pinkyDIP', 'pinkyTip'];
export const handEdges = [
  ['wrist','thumbCMC','thumbMCP','thumbIP','thumbTip'], ['wrist','indexMCP','indexPIP','indexDIP','indexTip'],
  ['indexMCP','middleMCP','middlePIP','middleDIP','middleTip'], ['middleMCP','ringMCP','ringPIP','ringDIP','ringTip'],
  ['ringMCP','pinkyMCP','pinkyPIP','pinkyDIP','pinkyTip'], ['pinkyMCP','wrist'],
].flatMap(chain => chain.slice(1).map((name, i) => [chain[i], name]));
export function usable(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
    && (p.confidence === null || p.confidence >= .6);
}
export function adaptResult(result, meta, mode) {
  if (mode !== 'hands') {
    const frame = fromMediaPipe({ landmarks: result.landmarks[0] ?? [], ...meta });
    if (mode === 'upper') frame.joints = Object.fromEntries(Object.entries(frame.joints).filter(([name]) => upperNames.includes(name)));
    return frame;
  }
  return { version: 'experiment-hands-v1', sessionId: meta.sessionId, seq: meta.seq, tMs: meta.tMs,
    source: { ...meta.source }, coordinateSpace: 'image-normalized-unmirrored',
    modelId: 'mediapipe-hand-f16-v1/tasks-vision-0.10.32', image: { width: meta.width, height: meta.height },
    hands: result.landmarks.map((points, i) => ({
      side: result.handedness?.[i]?.[0]?.categoryName ?? 'Unknown',
      sideConfidence: result.handedness?.[i]?.[0]?.score ?? null,
      joints: Object.fromEntries(handNames.flatMap((name, j) => {
        const p = points[j];
        return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? [[name, { x: p.x, y: p.y, confidence: null }]] : [];
      })),
    })),
  };
}
export function pinchRatio(joints, image) {
  if (!['thumbTip','indexTip','indexMCP','pinkyMCP'].every(name => usable(joints[name]))) return null;
  const distance = (a, b) => Math.hypot((joints[a].x - joints[b].x) * image.width, (joints[a].y - joints[b].y) * image.height);
  const palm = distance('indexMCP', 'pinkyMCP');
  return palm > 1 ? distance('thumbTip', 'indexTip') / palm : null;
}
