# Result-sharing evidence — 2026-09-13

## Local verification

- `node --test server.test.mjs`: four integration groups passed. Real FFmpeg-created
  synthetic MP4/WebM inputs exercise persistent uploads, restart/readback, escaped
  social HTML, poster generation, byte ranges, unauthorized/authorized deletion,
  upload code and consent, origin/type/size/quota rejection, streaming WebM duration,
  long-video rejection, expiry, and abandoned-file cleanup.
- Real desktop Chrome, served by this worktree on port 8410: synthetic canvas demo
  generated locally without camera/microphone; preview displayed; explicit consent
  and test upload code produced a live share URL and separate management link.
- Streaming MediaRecorder WebM is finalized with FFmpeg codec-copy remuxing to make
  duration and seeking available on the public player.
- Bounded self-review checked storage publication ordering, secret separation,
  escaping, file paths, MIME/codec limits, resource lifecycle, and deployment isolation.

## Deployment verification

Pending the first committed release and public browser verification. Do not treat
local checks as evidence that fitness.integ.life is deployed.

## Limitations

No private footage, camera session, participant recording or human accuracy trial was
used. Automatic game-end capture and highlight selection are not integrated. Real
social-app preview rendering and iOS/WeChat playback have not been established.
