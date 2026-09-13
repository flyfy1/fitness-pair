// Feature detection is per device: playback support does not imply encoding support.
export const RECORDING_FORMATS = [
  'video/mp4;codecs=avc1.424028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp8',
  'video/webm;codecs=vp9',
  'video/webm',
];
export const AUDIO_RECORDING_FORMATS = [
  'video/mp4;codecs=avc1.424028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];
export const containerType = mime => String(mime || '').split(';')[0].trim().toLowerCase();
export const videoExtension = blob => containerType(blob.type) === 'video/mp4' ? 'mp4' : 'webm';
export const formatLabel = blob => videoExtension(blob) === 'mp4' ? 'MP4' : 'WebM';

// Wire handlers before start; retry synchronous encoder failures without losing
// the stream. An asynchronous recording failure is reported by the owner.
export function startVideoRecorder(stream, wire, {Recorder = globalThis.MediaRecorder, videoBitsPerSecond = 2200000} = {}) {
  for (const mimeType of (stream.getAudioTracks?.().length ? AUDIO_RECORDING_FORMATS : RECORDING_FORMATS)) {
    if (!Recorder?.isTypeSupported(mimeType)) continue;
    let recorder;
    try {
      recorder = new Recorder(stream, {mimeType, videoBitsPerSecond});
      wire(recorder);
      recorder.start(500);
      return recorder;
    } catch {
      if (recorder) {
        recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
    }
  }
  throw new Error('This browser could not start video recording. Try an updated Chrome or Edge; you can still play.');
}

export async function recordedBlob(chunks, mime) {
  const blob = new Blob(chunks);
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const actual = bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp' ? 'video/mp4'
    : bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163 ? 'video/webm' : null;
  if (!actual) throw new Error('The browser returned an unreadable video. Try an updated Chrome or Edge.');
  // Never turn WebM bytes into an MP4 by changing the MIME or extension.
  const declared = containerType(chunks.find(chunk => chunk.size && chunk.type)?.type || mime);
  if (declared && declared !== actual) throw new Error('The browser returned a video format that does not match its recording. Please retry.');
  return blob.slice(0, blob.size, actual);
}
