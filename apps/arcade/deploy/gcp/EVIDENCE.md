# GCP arcade deployment evidence — 2026-09-13

- Public origin: `https://fitness.integ.life`.
- Deployed source: `7c52fe1acbcd2ad8005ab5688f402675c4c5b085`, from pushed `main`.
- Release: `20260913T075614Z-7c52fe1acbcd`.
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

Gallery publishing remains disabled on both deployments pending a usable GCP
runtime identity. The standalone sharing service continues using its existing VM
storage and uploader code. Separate origins have separate local clip libraries.
All verification used synthetic content; human recognition accuracy and real
iOS/WeChat playback remain outside this deployment evidence.
