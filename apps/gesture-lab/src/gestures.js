export const GESTURES = [
  { id: 'Thumb_Up', icon: '👍', name: 'Thumbs up', command: 'Confirm', hint: 'Raise your thumb; curl the other fingers. Hold briefly.' },
  { id: 'Wave', icon: '👋', name: 'Wave side to side', command: 'No', hint: 'Face an open palm toward the camera. Move left, right, then left.', experimental: true },
  { id: 'Thumb_Down', icon: '👎', name: 'Thumbs down', hint: 'Point your thumb down; curl the other fingers.' },
  { id: 'Open_Palm', icon: '✋', name: 'Open palm', hint: 'Spread all five fingers, with your palm toward the camera.' },
  { id: 'Closed_Fist', icon: '✊', name: 'Closed fist', hint: 'Curl your fingers into a fist.' },
  { id: 'Pointing_Up', icon: '☝️', name: 'Pointing up', hint: 'Extend only your index finger upward.' },
  { id: 'Victory', icon: '✌️', name: 'Victory / V', hint: 'Extend your index and middle fingers in a V.' },
  { id: 'ILoveYou', icon: '🤟', name: 'I love you', hint: 'Extend your thumb, index finger and pinky.' },
];

/** App-local experiment over PoseFrame + optional named hand observations.
 * Emits compatible ActionFrames; no raw MediaPipe indices cross this boundary. */
export class GestureActions {
  constructor(session) {
    this.session = session;
    this.seq = -1; this.time = -Infinity; this.count = 0;
    this.candidate = ''; this.since = 0; this.latched = false; this.releaseSince = null;
    this.wave = null; this.handKey = null;
  }

  update(frame) {
    if (frame.sessionId !== this.session.sessionId || frame.source.kind !== this.session.source.kind ||
      frame.source.id !== this.session.source.id || !Number.isFinite(frame.tMs) ||
      frame.seq <= this.seq || frame.tMs <= this.time) return null;
    const gap = frame.tMs - this.time;
    this.seq = frame.seq; this.time = frame.tMs;
    const hand = frame.hands?.length === 1 ? frame.hands[0] : null;
    const category = hand?.score >= .6 ? hand.category : 'None';
    const known = GESTURES.some(g => !g.experimental && g.id === category);
    const key = hand?.side ?? null;
    if (gap > 250 || key !== this.handKey) {
      this.wave = null; this.candidate = ''; this.releaseSince = null;
    }
    this.handKey = key;
    // A fresh neutral interval is required after any completed action.
    if (this.latched) {
      if (!hand || category === 'None') {
        this.releaseSince ??= frame.tMs;
        if (frame.tMs - this.releaseSince >= 350) {
          this.latched = false; this.candidate = ''; this.wave = null;
        }
      } else this.releaseSince = null;
    }
    let gesture = known ? category : null;
    let progress = 0;
    let complete = false;
    if (!this.latched) {
      if (gesture !== this.candidate) { this.candidate = gesture; this.since = frame.tMs; }
      if (gesture) progress = Math.min(1, (frame.tMs - this.since) / 450);
      const waved = this.updateWave(hand, category, frame.tMs, frame.image);
      if (waved) { gesture = 'Wave'; progress = 1; complete = true; }
      // An open palm is observable but never a command and never blocks a wave.
      else if (gesture && gesture !== 'Open_Palm' && progress === 1) complete = true;
    }
    let completion = null;
    if (complete) {
      this.latched = true; this.releaseSince = null;
      completion = { id: `${frame.sessionId}:gesture:${++this.count}`, repIndex: this.count };
    }
    return { version: 1, sessionId: frame.sessionId, source: { ...frame.source }, inputSeq: frame.seq,
      tMs: frame.tMs, recognizerId: 'gesture-lab-v1', action: gesture ?? 'None',
      phase: completion ? 'completed' : !hand ? 'missing' : 'ready',
      progress, calibrationProgress: null, cue: this.latched ? 'Release your hand to try again' :
        frame.hands?.length > 1 ? 'Show one hand at a time' : 'Hold a gesture or wave side to side', completion };
  }

  updateWave(hand, category, time, image) {
    const p = hand?.joints?.wrist, middle = hand?.joints?.middleMcp;
    if (category !== 'Open_Palm' || !p || !middle ||
      ![p.x, p.y, middle.x, middle.y].every(Number.isFinite)) { this.wave = null; return false; }
    const aspect = image.width / image.height;
    const size = Math.hypot(p.x - middle.x, (p.y - middle.y) / aspect);
    if (size < .025) { this.wave = null; return false; }
    let w = this.wave;
    if (!w || time - w.start > 1800 || Math.abs(p.y - w.y) / aspect > w.size * .8 ||
      size / w.size > 1.5 || size / w.size < .65) {
      this.wave = { start: time, x: p.x, y: p.y, size, direction: 0, legs: 0 };
      return false;
    }
    const dx = p.x - w.x;
    const threshold = Math.max(.075, w.size * .65);
    if (w.direction === 0) {
      if (Math.abs(dx) >= threshold) { w.direction = Math.sign(dx); w.legs = 1; w.x = p.x; }
    } else if (dx * w.direction > 0) w.x = p.x;
    else if (Math.abs(dx) >= threshold) { w.direction *= -1; w.legs++; w.x = p.x; }
    if (w.legs >= 3 && time - w.start >= 300) { this.wave = null; return true; }
    return false;
  }
}

/** Session-bound consumer. Only explicit unique completions can trigger commands. */
export function consumeAction(state, frame) {
  if (!frame || frame.sessionId !== state.sessionId || frame.source.kind !== state.source.kind ||
    frame.source.id !== state.source.id || frame.inputSeq <= state.lastSeq || frame.tMs <= state.lastTime) return state;
  const next = { ...state, lastSeq: frame.inputSeq, lastTime: frame.tMs };
  if (!frame.completion || frame.phase !== 'completed' || state.ids.includes(frame.completion.id)) return next;
  const command = GESTURES.find(g => g.id === frame.action)?.command ?? null;
  return { ...next, ids: [...state.ids, frame.completion.id],
    confirm: state.confirm + (command === 'Confirm' ? 1 : 0), no: state.no + (command === 'No' ? 1 : 0),
    history: [{ gesture: frame.action, command, id: frame.completion.id, tMs: frame.tMs }, ...state.history].slice(0, 8) };
}

export function initialState(session) {
  return { ...session, lastSeq: -1, lastTime: -Infinity, ids: [], confirm: 0, no: 0, history: [] };
}
