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
  lifecycle rule deletes `gallery/` and `videos/` objects using each object’s
  `customTime` expiry. Permanent objects have no custom time; the app denies
  finite records immediately at expiry. Existing seven-day soft-delete retention
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


## Sharing expiry migration

`deploy.py` runs `retention-policy.mjs` before release installation and again after
installation to catch uploads completed by the previous gateway. It uses the
release machine's existing gcloud identity, without changing the VM's bucket role.
Run `node apps/arcade/deploy/gcp/retention-policy.mjs` for a read-only inventory.
`--apply --backup=<private-directory>` saves the prior lifecycle and planned
metadata changes with mode 0600, stamps existing finite objects at their original
publication expiry, and replaces only the recognized seven-day deletion rule.
Unknown overlapping deletion rules fail closed; unrelated rules are preserved.

The replacement rule is `Delete` with `daysSinceCustomTime: 0` for `gallery/` and
`videos/`. New finite uploads save bytes and custom time together. Objects with no
custom time are excluded, allowing permanent shares. Existing videos are not made
permanent or given a new expiry. Orphan objects preserve an existing custom time;
unstamped orphans use their creation time plus seven days. Generation and metadata
preconditions reject concurrent mutations. Rerun a failed migration after checking
the reported storage error; already applied metadata is safe to inventory again.

Cloud lifecycle changes may take up to 24 hours to propagate. Application expiry
checks remain immediate. Do not restore the old age-based rule after permanent
shares exist, and do not restore an account store that rejects `expiresAt: null`.
Use a compatible gateway or disable publication while recovering; preserve ledger
state. Bucket privacy, other object prefixes and soft-delete policy are unchanged.

References: [GCS lifecycle](https://docs.cloud.google.com/storage/docs/lifecycle),
[custom-time metadata](https://docs.cloud.google.com/storage/docs/metadata),
and [atomic data and metadata upload](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/insert).


The 200 MB upload path is bounded by the gateway, so rejections receive a useful
413 response and an audit event. Other routes retain the earlier 20 MiB proxy
bound, including the separate legacy studio. The gateway accepts one upload at a
time, allows five minutes to receive it and two minutes for the cloud write. Its
1 GiB service memory ceiling accommodates the bounded body and cloud-upload copy.
Local clips allow 200 MB per file and a 400 MB aggregate library, still retaining
at most the latest two clips. This does not increase either cloud quota.

## Private game statistics

Set `FITNESS_STATS_ADMIN_EMAILS=flyfy1@gmail.com` in `/etc/fitness-arcade.env`
for the administrator requested by the site owner. Comma-separated addresses are
matched only against the existing authenticated Integ.Life session. Missing
configuration grants nobody access. Restart the gateway after changing this value.
Open `/admin/games` and log in with an allowed account. The page supports a UTC
start-date range of up to 31 days, game/input filters, per-game unique players,
session counts, total active duration, and paginated session timestamps.

`POST /api/play-sessions` records every started round independently of video or
feedback, including direct `/games/` visits and the Orbit Pop concept. The shell
and standalone collector are mutually exclusive. Setup is excluded; active time
accrues only in the playing phase of a visible page. Snapshots are cumulative,
ordered and idempotent; they are sent on start, every 15 seconds, visibility
changes and completion/exit. A crashed/offline browser can lose its final
heartbeat interval; abandoned sessions display `interrupted`, with an unknown
end time, after 45 seconds. Client clocks and reported duration are untrusted
usage estimates, not billing or anti-cheat evidence. Replay/synthetic inputs can
be filtered separately from camera play.

Players are deduplicated by a hash of the account identity at round start, or a
hash of a random browser-local ID when anonymous. Clearing storage, multiple
anonymous browsers, or playing before and after login may count extra players.
No camera frames, landmarks, IP address, email, cookies or URLs are stored by
this collector. Records persist as private, atomically replaced mode-0600 files
under `FITNESS_STATE_DIR/play-sessions/YYYY-MM-DD/`, including across deployment
and rollback. Historical records are retained until an operator removes them;
the endpoint bounds each body to 2 KiB and new records to 10,000 per UTC day.
There is no historical backfill from page views or optional ratings. This API is
provided by the GCP gateway; the separate Sites Worker does not collect it.
