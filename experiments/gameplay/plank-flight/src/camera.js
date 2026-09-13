// Adapted from apps/dino-run/src/camera.js; kept local to this experiment.
import { fromMediaPipe } from './pose-provider.js';

const INITIALIZATION_TIMEOUT_MS = 330_000;
const INFERENCE_TIMEOUT_MS = 3_000;
const FRAME_INTERVAL_MS = 1000 / 30;

/** A single local camera session; the host explicitly starts each new attempt. */
export class PoseCamera {
  constructor({ video, onPose = () => {}, onStatus = () => {}, onError = () => {}, onStop = () => {} }) {
    this.video = video;
    this.onPose = onPose;
    this.onStatus = onStatus;
    this.onError = onError;
    this.onStop = onStop;
    this.attempt = null;
  }

  get active() { return this.attempt !== null; }
  get running() { return this.attempt?.ready === true; }

  /** Resolves session metadata when ready, or null after cancellation/failure. */
  async start() {
    if (this.attempt) return this.attempt.promise;
    const session = { sessionId: crypto.randomUUID(), source: { kind: 'camera', id: crypto.randomUUID() } };
    const attempt = { session, ready: false, stream: null, worker: null, seq: 0,
      pending: null, lastVideoTime: -1, lastSampleTime: -Infinity, lastResultAt: 0 };
    attempt.promise = new Promise(resolve => { attempt.resolve = resolve; });
    this.attempt = attempt;
    attempt.hidden = () => { if (document.hidden) this.stop('hidden'); };
    attempt.pagehide = () => this.stop('pagehide');
    document.addEventListener('visibilitychange', attempt.hidden);
    window.addEventListener('pagehide', attempt.pagehide);
    attempt.initializationTimer = setTimeout(() => {
      this.fail(attempt, new Error('Camera or pose model initialization timed out. Please try again.'));
    }, INITIALIZATION_TIMEOUT_MS);
    this.onStatus({ state: 'requesting', ...session });
    if (document.hidden) this.stop('hidden');
    else if (this.attempt === attempt) void this.open(attempt);
    return attempt.promise;
  }

  async open(attempt) {
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires localhost or HTTPS in a supported browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
      if (this.attempt !== attempt) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      attempt.stream = stream;
      attempt.ended = () => this.fail(attempt, new Error('The camera disconnected. Reconnect it and try again.'));
      for (const track of stream.getTracks()) track.addEventListener('ended', attempt.ended);
      this.video.srcObject = stream;
      await this.video.play();
      if (this.attempt !== attempt) return;
      const base = new URL(import.meta.env?.BASE_URL ?? '/', window.location.href);
      const worker = new Worker(new URL('runtime/pose-worker.js', base));
      attempt.worker = worker;
      worker.onmessage = ({ data }) => this.receive(attempt, data);
      worker.onerror = () => this.fail(attempt, new Error('The local pose model worker failed. Please try again.'));
      worker.onmessageerror = () => this.fail(attempt, new Error('The local pose model returned an unreadable result.'));
      this.onStatus({ state: 'loading', ...attempt.session });
      worker.postMessage({ type: 'init', base: base.href });
    } catch (error) { this.fail(attempt, error); }
  }

  receive(attempt, data) {
    if (this.attempt !== attempt) return;
    if (data.type === 'error') {
      this.fail(attempt, new Error(data.message || 'The local pose model failed.'));
    } else if (data.type === 'ready' && !attempt.ready) {
      clearTimeout(attempt.initializationTimer);
      attempt.ready = true;
      attempt.lastResultAt = performance.now();
      attempt.watchdog = setInterval(() => {
        if (performance.now() - attempt.lastResultAt > INFERENCE_TIMEOUT_MS) {
          this.fail(attempt, new Error('Camera tracking stalled. Check the camera and start again.'));
        }
      }, 100);
      this.onStatus({ state: 'ready', ...attempt.session });
      if (this.attempt !== attempt) return;
      attempt.resolve(attempt.session);
      attempt.raf = requestAnimationFrame(time => this.sample(attempt, time));
    } else if (data.type === 'pose' && attempt.ready && attempt.pending?.tMs === data.time) {
      const input = attempt.pending;
      attempt.pending = null;
      attempt.lastResultAt = performance.now();
      try {
        this.onPose(fromMediaPipe({ landmarks: data.landmarks, ...attempt.session,
          seq: input.seq, tMs: input.tMs, width: input.width, height: input.height }));
      } catch (error) { this.fail(attempt, error); }
    }
  }

  sample(attempt, time) {
    if (this.attempt !== attempt || !attempt.ready) return;
    attempt.raf = requestAnimationFrame(nextTime => this.sample(attempt, nextTime));
    if (attempt.pending || this.video.readyState < 2 || !this.video.videoWidth || !this.video.videoHeight ||
      this.video.currentTime === attempt.lastVideoTime || time - attempt.lastSampleTime < FRAME_INTERVAL_MS) return;
    attempt.lastSampleTime = time;
    attempt.lastVideoTime = this.video.currentTime;
    attempt.pending = { seq: ++attempt.seq, tMs: time, width: this.video.videoWidth, height: this.video.videoHeight };
    void this.sendBitmap(attempt, time);
  }

  async sendBitmap(attempt, time) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(this.video);
      if (this.attempt !== attempt) { bitmap.close(); return; }
      attempt.worker.postMessage({ type: 'frame', bitmap, time }, [bitmap]);
      // The worker closes a successfully transferred bitmap in its finally block.
    } catch (error) {
      bitmap?.close();
      this.fail(attempt, error);
    }
  }

  fail(attempt, error) {
    if (this.attempt !== attempt) return;
    this.stop('error');
    this.onError(error instanceof Error ? error : new Error(String(error)));
  }

  stop(reason = 'stopped') {
    const attempt = this.attempt;
    if (!attempt) return;
    this.attempt = null;
    clearTimeout(attempt.initializationTimer);
    clearInterval(attempt.watchdog);
    cancelAnimationFrame(attempt.raf);
    document.removeEventListener('visibilitychange', attempt.hidden);
    window.removeEventListener('pagehide', attempt.pagehide);
    if (attempt.worker) {
      attempt.worker.onmessage = null;
      attempt.worker.onerror = null;
      attempt.worker.onmessageerror = null;
      attempt.worker.terminate();
    }
    for (const track of attempt.stream?.getTracks() ?? []) {
      track.removeEventListener('ended', attempt.ended);
      track.stop();
    }
    if (attempt.stream && this.video.srcObject === attempt.stream) {
      this.video.pause();
      this.video.srcObject = null;
    }
    attempt.resolve(null);
    this.onStop({ reason, ...attempt.session });
  }
}
