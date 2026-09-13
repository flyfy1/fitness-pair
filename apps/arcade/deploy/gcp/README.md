# Independent GCP deployment

The complete Hopmodo landing page and all five mounted games are deployed to
`https://fitness.integ.life` on the existing `integ-prod` VM, project
`project-e8ef2daf-0520-4018-b9f`, zone `asia-southeast1-b`.
The GPT Sites deployment and `.openai/hosting.json` are not modified or published
by this workflow. Default builds retain the GPT Sites address. GCP builds set
`VITE_SITE_URL=https://fitness.integ.life` for video branding and game share links.
See [deployment evidence](EVIDENCE.md) for the verified release and limitations.

## Deploy

From clean, pushed `main`, after relevant tests and browser checks:

```sh
node --test apps/arcade/deploy/gcp/*.test.mjs apps/arcade/server/worker.test.js
python3 apps/arcade/deploy/gcp/deploy.py
```

The Mac builds the full static arcade with Node 22.12+; the VM uses its existing
Node 18+ for the small API adapter. No runtime dependencies or service-account keys
are installed. Versioned releases live under `/opt/fitness-arcade/releases/`;
`current` selects the release, and `/healthz` reports its exact source commit.
The new `fitness-arcade.service` listens only on `127.0.0.1:8411` as its own system
user. The existing dedicated `fitness-sharing-proxy.service` serves static files
and terminates HTTPS. The old shared `caddy.service` remains untouched.

## Existing clips and gallery state

The standalone upload studio remains at `/highlights`. Existing `/s/:id`,
`/media/:id`, `/poster/:id`, POST uploads, and 32-character clip management IDs
continue to use `fitness-sharing.service` on port 8410 and its original data and
uploader code. This deployment never changes `/var/lib/fitness-sharing` or its
runtime configuration. Never run the old experiment installer after this deployment:
it installs the old root-only proxy configuration. Use this deploy entry point.

Local automatic recordings, the clip library, downloads, and file sharing work
independently on each origin; IndexedDB clips do not migrate between the two sites.
The UUID-based Gallery API uses the same Worker semantics as GPT Sites. On GCP,
`/etc/fitness-arcade.env` configures the private bucket, dedicated storage identity
and Integ.Life client credentials. Systemd reads this root-only file; it is never in an archive or Git.
The existing VM identity obtains a short-lived token for the storage account using
IAM Credentials. No private keys are created and the organization key-creation
restriction remains enforced. A complete `serviceAccounts` field inspection found
the attached identity; an earlier nested CLI projection incorrectly appeared empty.

## Keyless gallery configuration

- VM identity: `snake-arena-runtime@project-e8ef2daf-0520-4018-b9f.iam.gserviceaccount.com`.
- Storage identity: `fitness-sharing-storage@project-e8ef2daf-0520-4018-b9f.iam.gserviceaccount.com`.
- Bucket: `project-e8ef2daf-0520-4018-b9f-fitness-sharing`.
- IAM Credentials API must be enabled. Grant `roles/iam.serviceAccountTokenCreator`
  to the VM identity **on the storage service account only**, never project-wide.
  That storage identity has `roles/storage.objectUser` on this bucket only.
- The VM identity is shared by workloads on this VM; this delegation follows that
  existing host trust boundary. It does not grant project or bucket administration.
- Keep uniform bucket-level access and public-access prevention enabled. The
  lifecycle rule deletes `gallery/` and `videos/` objects after seven days; the app
  denies expired records immediately. Existing seven-day soft-delete retention
  can retain deleted bytes beyond their availability through the app.
- Set `GCP_BUCKET`, `GCP_IMPERSONATE_SERVICE_ACCOUNT`, `INTEG_AUTH_ISSUER`,
  `INTEG_AUTH_CLIENT_ID=hopmodo`, and its independent `INTEG_AUTH_CLIENT_SECRET`
  in `/etc/fitness-arcade.env` (mode 0600). Register the exact callback
  `https://fitness.integ.life/api/auth/callback` on central Auth before restarting.
  The service owns `/var/lib/fitness-arcade` for sessions and the atomic quota ledger.
  The installer backs up this directory with the sole writer stopped; normal
  release rollback preserves current account state. Never reset the ledger or
  restore an older ledger without reconciling GCS publications. See [account recovery](../../server/AUTH.md).
- Check `/api/config`, then verify a synthetic upload through the browser, GCS
  readback, public playback and owner deletion. Configuration alone is not proof.

`identity.mjs` caches tokens only in process memory, coalesces concurrent refreshes,
and renews them a minute before expiration. Metadata and IAM calls have bounded
timeouts; failures return a generic 503 without including credential responses.
GPT Sites keeps its separate runtime configuration and is not enabled by these
VM-only settings. To disable GCP publication, remove the gallery environment
settings and restart the arcade service; existing local recordings are unaffected.

## Verification and rollback

Check the public homepage, desktop/mobile game navigation, same-origin tracking
assets, a synthetic Motion Quest round and persisted local replay. Verify an
existing public clip still plays and supports ranges. Verify the GPT Sites URL
still serves its unchanged build. Synthetic checks do not establish human
recognition accuracy or iOS/WeChat compatibility.

Before replacing ingress, the installer validates Caddy and saves its prior
configuration and the prior arcade release/unit under
`/opt/fitness-arcade/rollback/<release>`. Startup failures restore them automatically.
For a manual rollback, restore that Caddyfile, restore the prior `current` target
and unit if present, then restart only `fitness-arcade.service` and
`fitness-sharing-proxy.service`. If there was no prior arcade release, stop/disable
`fitness-arcade.service` and restore the prior proxy configuration. Legacy clip
data is never restored or overwritten as part of an arcade rollback.

## Backfill existing gallery thumbnails

After deploying poster support, run `backfill-thumbnails.mjs` in the installed
release under the arcade service identity and its existing environment file.
The default is a dry run; `--apply` creates only missing JPEG objects with a GCS
generation precondition, verifies byte-for-byte public readback, and reports counts.
FFmpeg runs on the VM with local-file input only, a 20-second deadline, and a
temporary private directory below `FITNESS_STATE_DIR/.local` that is removed after
each clip. Original videos, publication records and account state are not rewritten.
Do not print the environment file or token responses. Browser-local clips are
separate: use Generate thumbnail in My clips on the device that owns them.
