import {assertActionFrame, sameSource} from '../../../contracts/index.js';

/** The only path from recognizer observations into original game commands. */
export function createBodyInput(session, game) {
  let seq = -1, time = -1;
  const consumed = new Set();
  return frame => {
    assertActionFrame(frame);
    if (frame.sessionId !== session.sessionId || !sameSource(frame.source, session.source)
      || frame.action !== 'body-arcade' || frame.inputSeq <= seq || frame.tMs <= time) return false;
    seq = frame.inputSeq; time = frame.tMs;
    if (!['active', 'ready', 'completed'].includes(frame.phase)) return false;
    const control = frame.controls;
    if (!control || !Number.isFinite(control.horizontal) || Math.abs(control.horizontal) > 1) return false;
    if (control.aim && (![control.aim.x, control.aim.y].every(Number.isFinite)
      || [control.aim.x, control.aim.y].some(value => value < 0 || value > 1))) return false;
    const primary = !!frame.completion && !consumed.has(frame.completion.id);
    if (primary) consumed.add(frame.completion.id);
    game.input({horizontal: control.horizontal, aim: control.aim, primary});
    return true;
  };
}
