# Pi migration and direct GCS uploads — 2026-09-25

## Production topology

`https://fitness.integ.life` → Cloudflare proxied CNAME → `integ-pi`
(`097a02d0-0a50-4629-bf6c-e01cbe9f2b4a`) → `songyy-pi`,
`http://127.0.0.1:18411` → dedicated Caddy → arcade gateway 8411 / legacy studio 8410.
The Cloudflare dashboard confirmed a healthy Linux ARM64 Pi connector and the
fitness published route. Both 1.1.1.1 and 8.8.8.8 resolve the proxied entry.
An HTTPS request forced through the observed Cloudflare address returned
`server: cloudflare`, `X-Fitness-Origin: songyy-pi` and the expected release.
After the local DNS cache expired, ordinary HTTPS requests and a fresh browser
tab loaded successfully with all three GCE project services stopped and disabled:
`fitness-arcade`, `fitness-sharing`, and `fitness-sharing-proxy`. The transitional
GCE-to-Pi forwarding configuration is retained on disk but is no longer running.

- Deployed release: `20260925T154236Z-pi-4a611ab3077b`.
- Original served application: `b0711d02c3b6e41bebfc4c25563f0e60ac2ea52d`.
- Pi/upload adapter: `4a611ab3077b0edcbc8e69d7030f98d1c04539ce`.
- The old game bundles were copied, not rebuilt from newer main. Of 199 original
  client files, only landing `index.html` gained the upload script; the other 198
  matched SHA256. `pi-upload-transport.js` is the one added production client file.
  The backend Worker gained only the internal verified-object publication hook.
- Pi uses its NVMe root disk, an isolated root-owned Node 22.23.2 runtime and a
  pinned `google-auth[requests]` 2.57.1 environment.
- The GCS bucket remains private with public-access prevention. The independent
  `fitness-arcade-pi` identity has object-user access only on the existing Fitness
  sharing bucket, through CN/SAN-constrained X.509 federation. The certificate
  renewal timer is enabled and its check completed successfully.

## State consistency and rollback boundary

Stopped both old GCE writers, archived the complete arcade state, legacy state
and their environment files, and transferred the private archive over SSH.
The archive SHA256 matched on both hosts:
`8d25c422c1b2ff01a86329e860102a4199e98ae50fccbd714648881a284614ec`.
All three source state files matched individually before Pi writers started.
The previously established real browser login survived the cutover.

Backups are root-only under `/var/backups/fitness-pair/migration-20260925/`
on both hosts. GCE retains the original proxy configuration and service units;
its releases, environments and old state have not been deleted. Pi is the sole
writer. Reverse migration must transfer **current Pi state**, not restore the
older snapshot after new sessions or uploads have been accepted.

## Automated and live verification

- 95 repository tests, 34 backend/identity/direct-upload tests and complete arcade
  build passed. Direct-upload tests include restart continuity without credential
  persistence, account/CSRF and device isolation, consent, quotas, size mismatch,
  generation-bound rewrite, permanent/finite expiry, cancellation and retry.
- Real GCS preflight verified delegated read/create/readback/delete, CORS for the
  existing origin, and a permanent rewrite with no inherited temporary expiry.
- Actual browser tests each uploaded a **200,000,000-byte synthetic MP4**:
  one anonymous public finite clip and one signed-in private permanent clip.
  Observed browser requests were preparation POST with zero video-body bytes,
  **PUT storage.googleapis.com with 200,000,000 bytes**, and completion POST with
  zero video-body bytes. Both returned successful publication, exact reported
  size, a 12-byte tail range (206), advancing browser playback, and deletion (200).
- The private test used the real session established before migration. It kept
  permanent expiry (`expiresAt: null`), exercising session continuity and CSRF.
- Both synthetic videos were removed; GCS `videos/.pending/` had zero objects and
  no pending direct-upload record remained. The temporary QA page was removed.
- Gateway peak memory during these live tests was 67,678,208 bytes (about 64.5 MiB),
  consistent with the video body bypassing Pi. This is one observed run, not a
  load/capacity benchmark.
- Public health/config/gallery, original `/highlights`, shared tracking model
  asset and Motion Quest's browser entry loaded correctly. Existing on-device
  replays remained present. No camera or microphone was enabled and no existing
  user replay was overwritten to run a new recording test.

These are deployment and synthetic media checks, not human recognition,
exercise-quality or health evidence. GCS lifecycle cleanup is configured but its
asynchronous time-based deletion was not observed; explicit test cleanup was.
Browser acceptance used the desktop in-app browser; a physical mobile device was
not tested during this migration.
See the direct-upload guide for abandoned-session and rollback behavior.
