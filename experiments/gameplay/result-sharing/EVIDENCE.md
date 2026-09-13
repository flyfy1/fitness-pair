# Result-sharing evidence — 2026-09-13

## Local verification

- `node --test server.test.mjs`: five integration groups passed. Real FFmpeg-created
  synthetic MP4/WebM inputs exercise persistent uploads, restart/readback, escaped
  social HTML, poster generation, byte ranges, unauthorized/authorized deletion,
  upload code and consent, origin/type/size/quota rejection, streaming WebM duration,
  long-video rejection, expiry, abandoned-file cleanup, and the release-symlink CLI entry.
- Real desktop Chrome, served by this worktree on port 8410: synthetic canvas demo
  generated locally without camera/microphone; preview displayed; explicit consent
  and test upload code produced a live share URL and separate management link.
- Streaming MediaRecorder WebM is finalized with FFmpeg codec-copy remuxing to make
  duration and seeking available on the public player.
- Bounded self-review checked storage publication ordering, secret separation,
  escaping, file paths, MIME/codec limits, resource lifecycle, and deployment isolation.

## Deployment verification

- Deployed code: `7588a1b27ec523c0c90927657e200a34d282351e`.
- Release: `20260913T032047Z-7588a1b27ec5`, on GCP `integ-prod`.
- Cloudflare control-plane readback: DNS-only A record `fitness.integ.life` points
  to `35.198.216.126`. Both the router resolver and Tailscale resolver returned it.
- Dedicated application and proxy systemd units are active/enabled. Caddy obtained
  a valid Let's Encrypt certificate. The legacy shared Caddy remains untouched.
- Public HTTPS API test, using ordinary DNS from GCP: a real browser-generated
  synthetic WebM was uploaded, persisted, finalized, and served with public metadata,
  a JPEG poster, and a successful byte-range response. No private recordings used.
- Public sample: https://fitness.integ.life/s/51533202dda304b7120d5444e94afbf7
  (expires 2026-09-20). This is an animation, not a verified workout.
- Initial deployment found a CLI path comparison bug when launched through a release
  symlink. Fixed in `5df5876` with a regression test before the successful deployment.

## Stopped at user request / remaining verification

Work stopped on 2026-09-13 for teammate handoff. Public browser end-to-end checks are
unfinished: the Mac system/browser retained the pre-creation NXDOMAIN result even
though authoritative/upstream DNS and the live HTTPS origin were correct. Browser
cache-management navigation was blocked by the browser tool; no workaround or security
setting changes were made. Allow normal DNS cache expiry before retrying.

The local code-file picker test was also unfinished: the extension's file access is
not enabled, and native selection did not complete. Normal manual code entry was
verified. A requested 390px browser viewport did not take effect (actual width remained
1728px), so narrow-screen verification must not be claimed. View playback/seek after
WebM finalization and removal through the browser UI still need confirmation. Automated
API tests cover deletion and restart; public deletion was not run before the stop.

## Limitations

No private footage, camera session, participant recording or human accuracy trial was
used. Automatic game-end capture and highlight selection are not integrated. Real
social-app preview rendering and iOS/WeChat playback have not been established.
