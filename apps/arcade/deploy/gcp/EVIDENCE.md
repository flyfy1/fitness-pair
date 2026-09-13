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
`/assets/index-BuqiS9ra.css`, unchanged from before the GCP deployment. GCP serves
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
