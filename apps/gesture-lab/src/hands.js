import { GestureActions, consumeAction, initialState } from './gestures.js';

export const SIDES = ['Left', 'Right'];

/** Two independent action lanes, keyed by model side labels, never array order.
 * Labels are not persistent person identity; overlapping/ambiguous hands pause. */
export class HandControls {
  constructor(session, options) {
    this.session = session; this.seq = -1; this.time = -Infinity;
    this.lanes = Object.fromEntries(SIDES.map(side => [side, {
      recognizer: new GestureActions(session, { ...options, handId: side }),
      state: initialState(session),
    }]));
    this.history = [];
  }

  update(frame) {
    if (frame.sessionId !== this.session.sessionId || frame.source.id !== this.session.source.id ||
      frame.source.kind !== this.session.source.kind || frame.seq <= this.seq || frame.tMs <= this.time) return null;
    this.seq = frame.seq; this.time = frame.tMs;
    const hands = frame.hands ?? [];
    let ambiguous = hands.some(hand => !SIDES.includes(hand.side)) ||
      SIDES.some(side => hands.filter(hand => hand.side === side).length > 1);
    if (hands.length === 2) {
      const a = hands[0].joints.wrist, b = hands[1].joints.wrist;
      if (a && b && Math.hypot(a.x - b.x, (a.y - b.y) * frame.image.height / frame.image.width) < .12) ambiguous = true;
    }
    const views = {};
    for (const side of SIDES) {
      const lane = this.lanes[side];
      const hand = hands.find(hand => hand.side === side) ?? null;
      if (ambiguous) {
        lane.recognizer.interrupt(); views[side] = { hand, action: null }; continue;
      }
      const action = lane.recognizer.update({ ...frame, hands: hand ? [hand] : [] });
      const next = consumeAction(lane.state, action);
      if (next.history[0]?.id !== lane.state.history[0]?.id) {
        this.history.unshift({ ...next.history[0], hand: side });
        this.history = this.history.slice(0, 8);
      }
      lane.state = next;
      views[side] = { hand, action };
    }
    return { views, ambiguous, state: this.snapshot() };
  }

  snapshot() {
    const states = SIDES.map(side => this.lanes[side].state);
    return { confirm: states.reduce((sum, s) => sum + s.confirm, 0),
      no: states.reduce((sum, s) => sum + s.no, 0),
      ratingCount: states.reduce((sum, s) => sum + s.ratingCount, 0),
      rating: this.history.find(item => item.rating)?.rating ?? null,
      ratings: Object.fromEntries(SIDES.map(side => [side, this.lanes[side].state.rating])),
      history: this.history.map(item => ({ ...item })) };
  }
}
