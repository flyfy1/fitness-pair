# Readable hosted game footer

## MVP card

- Target user: a camera player on a narrow phone, in English or Chinese.
- Job: read the local-recording disclosure and tracking cue, then end the round
  without either text obscuring the native finish/sound/fullscreen controls.
- Main risk: reserving footer space might overlap another HUD or reset a camera
  round when language, text size, fullscreen or orientation changes.
- P1 loop: enter Flight → play → tracking pause → resize or enlarge disclosure
  text → see separate guidance, native controls and recording disclosure → finish
  → one playable local replay under the original camera session.
- Proof: failing overlap measurements before the fix, synthetic-camera browser
  checks in both languages across phone/landscape/desktop, and recorder continuity.
- Boundary: reuse the shared shell and original controls/disclosure; no game-name
  selectors in the shell, duplicate controls, new dependencies, game/input changes,
  uploads or human recognition claims.
- Appetite: one measured layout fix, validated and deployed before another slice.

Games can opt into footer reservation with `data-game-footer` and
`data-game-note`. The shell measures visible note and
footer sizes and publishes CSS clearance variables. Native styling consumes
those variables while retaining its normal minimum spacing. ResizeObserver and
fullscreen/viewport changes keep the spacing current; disposal releases observers.

## Validation

- Before the change, both new bilingual hosted-browser cases failed the measured
  clearance check at 390 × 844.
- After the change, 14 browser cases passed: two bilingual footer cases, one
  Flight tracking/replay case, six AR games, Jump Game, Motion Quest, and three
  standalone Flight cases. The footer cases cover 320/390-pixel phones, landscape,
  desktop, enlarged disclosure text, fullscreen, and one replay with the original
  camera session. Portrait and landscape screenshots were visually inspected.
- All 138 root unit tests and 35 deployment/server tests passed; all nine games
  built successfully. These checks use synthetic camera input and do not establish
  human tracking accuracy.
- Public acceptance additionally checks the served commit and asset hashes,
  bilingual clearances, tracking grace/recovery, camera/audio continuity, a playable
  local replay, resource cleanup, and zero video uploads.
