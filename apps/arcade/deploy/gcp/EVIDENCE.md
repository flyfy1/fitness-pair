# GCP arcade deployment evidence — 2026-09-13

- Public origin: `https://fitness.integ.life`.
- Initial full-arcade source: `7c52fe1acbcd2ad8005ab5688f402675c4c5b085`, from pushed `main`.
- Initial release: `20260913T075614Z-7c52fe1acbcd`.
- Scope: complete landing page, game mounts, local recordings and clip library;
  separate from the existing GPT Sites publication.

## Checks

- 65 repository tests and seven gateway/Worker tests passed. The complete arcade
  build passed with the GCP website address. Caddy validated on the destination VM.
- Public `/healthz` reports the exact commit and GCP origin. The arcade gateway,
  existing sharing service and dedicated proxy are active under their separate
  users. The legacy shared `caddy.service` remains inactive. Rollback configuration
  exists under `/opt/fitness-arcade/rollback/20260913T075614Z-7c52fe1acbcd`.
- Live desktop Chrome ran the existing synthetic Motion Quest recording regression
  against GCP: five complete actions, automatic replay, IndexedDB persistence after
  reload, decoded playback/seek, logo/name/website footer and ending, native-share
  payload with the GCP game URL, actual MP4 download, disabled-gallery feedback,
  and local deletion. No clip upload or camera/microphone access occurred in this
  regression. Its isolated runner is in the ignored `.local/gcp-browser/` directory.
- That regression was adapted for the GCP address. Its initial website-pixel check
  expected over 400 dark pixels for the longer Sites hostname; the shorter GCP
  hostname produced 329. The GCP-only check requires over 200, retaining the other
  image checks and the exact GCP URL assertion. The complete adapted check passed.
- Browser inspection confirmed the public 390px homepage has no horizontal overflow,
  loads its artwork and tracking assets, and mounts Motion Quest at exactly
  390×844. Desktop navigation and native game controls also load.
- `/highlights` and existing unlisted clip pages/posters remain available. A
  synthetic clip created before the full arcade cutover still returns `206` with
  `Content-Range: bytes 0-99/645373` for a 100-byte media request.

## Independent publications and limits

The GPT Sites publication still serves `/assets/index-D8n_qfSb.js` and
`/assets/index-BuqiS9ra.css`, unchanged from before the GCP deployment. The initial GCP release served
`/assets/index-BmrDT9rM.js` with its own canonical website address. Full Sites HTML
contains changing edge challenge data, so raw HTML equality is not a deployment
identity check. No Sites configuration, access, source push, version save or
deployment operation was performed.

The initial release kept Gallery disabled; the keyless GCP activation below
supersedes that state. GPT Sites Gallery remains disabled. The standalone sharing service continues using its existing VM
storage and uploader code. Separate origins have separate local clip libraries.
All verification used synthetic content; human recognition accuracy and real
iOS/WeChat playback remain outside this deployment evidence.


## Keyless GCP gallery activation

Backend source `b0f40a4a6d2989f25568c6879b006c1e9ace790a` was deployed as
`20260913T081211Z-b0f40a4a6d29` from clean, pushed `main`.

- 65 repository tests, ten gateway/identity/Worker tests and the full build passed.
- The existing VM identity can impersonate only the dedicated storage service
  account through its account-level Token Creator binding. No private key was
  created. The root-only environment file configures this adapter and reuses the
  existing private pilot upload code.
- Bucket public-access prevention and uniform access remain enabled. The lifecycle
  rule deletes `gallery/` and `videos/` objects at age seven days. Existing seven-day
  soft-delete retention remains unchanged; cleanup timing has not been observed.
- Public `/api/config` returns `sharingEnabled: true`; GPT Sites still returns
  `false`. No GPT Sites deployment or runtime configuration was changed.
- A live Chrome regression recorded five synthetic Motion Quest actions, reloaded
  the local library, decoded branded frames and ending, and downloaded a real MP4.
  The form rejected an invalid code, then published with explicit consent and the
  private code. The 1,244,776-byte MP4 and metadata were independently read back
  from GCS with matching title, synthetic provenance and a seven-day expiration.
- A fresh browser context saw the gallery card, opened the clip page, played and
  sought the video. A 100-byte media range returned 206. Public API responses did
  not expose the management key/hash; an unauthorized delete returned 403.
- Owner deletion through the UI removed both live GCS objects. Public metadata and
  media returned 404 and the gallery card disappeared. The local video remained
  in My clips, then the test removed that local copy. The temporary clip
  ID was `52830e22-a86e-46a2-bc4d-8b43e8806bb8`; it is intentionally unavailable.
- The isolated live runner `.local/gcp-browser/gallery.spec.js` passed in 23.9s.
  It uses synthetic content and no camera or microphone. It does not establish
  human movement recognition accuracy or physical-device video compatibility.


The final availability-copy update was deployed from `d9072d2` as
`20260913T081618Z-d9072d28cd4e`, with `/assets/index-D7o6fCFC.js`.
Its full build and desktop/mobile landing browser checks passed. Public health
matches this source, the new home copy is served, and Gallery remains enabled.

## Integ.Life login and 2 GB account storage

Deployed application source `335d9688a09e816ff4e29760cebf27588418b0d1` as
`20260913T090539Z-335d9688a09e` from clean, pushed `main`. Central Auth runs
`c280f9f49a75ece6b2de564c2a46039d7464f29b` on Pi with `dirty:false` and the
new `hopmodo` client; the preceding 14 client configurations were preserved.

- IAP disconnected while transferring the archive, before installation. The owned
  transfer was stopped. The existing Tailscale `integ-prod` SSH target was verified
  by hostname and the prior local health/release; the same 14 MB archive was copied
  there and its SHA-256 matched locally and remotely. The standard installer then
  validated Caddy, retained rollback files, and restarted only the arcade and its
  dedicated proxy. Public health reports the exact source above.
- Public `/api/auth/session` reports login enabled and `limitBytes: 2000000000`.
  Anonymous account listing and deletion return 401. `/api/config` reports sharing
  enabled. No central tokens or client credentials appear in these public responses.
- In the real browser, Hopmodo's login button navigated through the branded central
  Auth page and the existing Google sign-in flow, then returned to `/shared` as the
  actual Integ.Life account. Its initial storage display was 0 B of 2 GB used.
- A Dino Run keyboard round generated a six-second, camera-free synthetic MP4.
  The publication form identified the logged-in account, required explicit consent,
  displayed remaining quota, and contained no early-access code field.
- The resulting clip `365da628-d2d0-4f07-9b96-925324682916` contained **578,548 bytes**.
  Independent GCS reads confirmed that exact object size, synthetic provenance,
  seven-day expiry, and a bound owner identity without a legacy management-key hash.
  Public metadata did not expose the owner identity. Browser playback decoded
  1280×800 MP4 frames and advanced in time; a 100-byte request returned 206 with
  `Content-Range: bytes 0-99/578548`.
- Restarting the sole gateway process preserved the browser session, the publication
  in My shared clips, and the exact 578,548-byte quota meter value.
- Owner removal through My shared clips returned its meter to 0. Public metadata
  and media returned 404, and GCS reported the video object unavailable. The local
  video remained in My clips; that task-generated test copy was then removed.
  The temporary publication is intentionally unavailable. No camera or microphone
  was used and no private recording was uploaded.
- Automated account evidence: 65 repository tests, 12 backend tests, and three
  Chrome account-flow tests passed on the integrated code. Account tests include
  a second device, another account, exact/concurrent quota boundaries, cancellation,
  partial uploads and mobile layouts. Broader regression evidence and the two
  separately reproduced pre-existing recorder failures are in [AUTH.md](../../server/AUTH.md).

The application runtime owns `/var/lib/fitness-arcade`; release archives exclude
its sessions and quota ledger. Configuration backups are root-only:
`/etc/fitness-arcade.env.hopmodo-20260913T090425Z.bak` on GCP and
`/etc/integ-auth.env.hopmodo-20260913T085815Z.bak` on Pi. This release does not change
the standalone `/highlights` service or publish a GPT Sites build.
