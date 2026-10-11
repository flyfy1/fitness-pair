/** Fixed screen lanes for a mirrored preview; detector ordering is never identity. */
export function assignPoseLanes(frames, sessions, input) {
  const candidates = [[], []];
  for (const frame of frames) {
    const a = frame.joints.leftShoulder, b = frame.joints.rightShoulder;
    if (!a || !b || a.confidence < .6 || b.confidence < .6 || a.confidence === null || b.confidence === null) continue;
    const x = (a.x + b.x) / 2;
    // A center buffer and two shoulders in the same half prevent boundary chatter.
    const lane = x > .54 && a.x > .5 && b.x > .5 ? 0
      : x < .46 && a.x < .5 && b.x < .5 ? 1 : -1;
    if (lane >= 0) candidates[lane].push(frame);
  }
  return sessions.map((session, lane) => ({...input, ...session,
    source: {...session.source},
    joints: candidates[lane].length === 1 ? candidates[lane][0].joints : {}}));
}
