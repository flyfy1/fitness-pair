// Match the centered object-fit: cover video without changing recognition input.
export function cameraPoint(point, width, height, videoWidth, videoHeight, mirrored = false) {
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const x = (width - videoWidth * scale) / 2 + point.x * videoWidth * scale;
  return { x: mirrored ? width - x : x, y: (height - videoHeight * scale) / 2 + point.y * videoHeight * scale };
}
