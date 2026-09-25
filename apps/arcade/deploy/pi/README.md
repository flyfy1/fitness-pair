# Raspberry Pi deployment

Target: `songyy-pi` (ARM64/NVMe), reached through the existing `pi` SSH alias.
Public origin remains `https://fitness.integ.life`. Cloudflare Tunnel `integ-pi`
routes it to the dedicated Caddy origin at `http://127.0.0.1:18411`.
The shared Pi Caddy configuration and other products are not modified.

- `fitness-arcade.service`: Node gateway on loopback port 8411.
- `fitness-arcade-proxy.service`: Caddy on loopback/Tailscale port 18411.
- `fitness-sharing.service`: original `/highlights` and legacy clip routes, port 8410.
- Code: `/opt/fitness-arcade/releases/`, selected by `current`.
- Private account/session/quota/feedback state: `/var/lib/fitness-arcade`.
- Legacy clips: `/var/lib/fitness-sharing`; original code under `/opt/fitness-sharing`.
- Environment: root-only `/etc/fitness-arcade.env` and `/etc/fitness-sharing.env`.

## Storage identity

Media remains in the existing private GCS bucket. Pi has an independent
`fitness-arcade-pi` service account, limited to `roles/storage.objectUser` on
`project-e8ef2daf-0520-4018-b9f-fitness-sharing`. Its X.509 workload identity pool
requires `CN=fitness-arcade-pi` and URI SAN `spiffe://fitness.integ.life/pi`.
No GCP service-account key or user refresh token is copied to Pi.

`/etc/fitness-arcade/gcs-wif.json` references the local client certificate/key.
The CA key is root-only under `/etc/fitness-arcade/ca`; the gateway cannot read it.
`fitness-arcade-certificate.timer` checks daily and renews the 90-day client
certificate with fewer than 30 days left. The CA trust anchor expires in 2036;
rotate the cloud trust anchor before then. Credentials are acquired through
`google-auth[requests]==2.57.1` in `/opt/fitness-arcade/auth-venv`, using the
[official X.509 federation flow](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-x509-certificates).
The helper's short-lived token is consumed through a private child-process pipe,
cached in memory, and never logged or written to disk. The 30-second refresh
timeout, early renewal and concurrent refresh coalescing bound failures.

## Direct Google Cloud Storage upload

Target user: a player sharing an explicitly consented local video, up to 200 MB.
The job is to upload without sending video bytes through the Pi or Cloudflare's
100 MB request limit. The risky assumption is browser CORS and preservation of
private/permanent publication semantics. The bounded acceptance loop is:
request a scoped session, upload directly, verify and publish, play, then remove
one disposable synthetic test. Game changes and upload UI redesign are out of scope.

`POST /api/direct-uploads/:clipId` verifies origin, account/CSRF or anonymous
device identity, consent, metadata, advertised size and account quota. It creates
a GCS resumable upload to a random private `videos/.pending/` object. Only this
single-object session URL reaches the browser; server OAuth tokens, cookies and
CSRF credentials never go to Google from the browser. The returned upload URL
is a bearer capability and must never be logged, persisted or shared.

The browser sends the video directly to `storage.googleapis.com`, then calls
`POST /api/direct-uploads/:clipId/complete`. Pi reads object metadata and 12 bytes
for MP4/WebM signature checks. It pins the source generation and uses GCS rewrite
to create the final video inside the bucket. The original gallery worker retains
ownership, quota reservation, anonymous replacement and publication semantics.
Private videos remain private; permanent copies clear staging expiry metadata.
The server rechecks quota at publication, so another concurrent legacy upload
can require the user to free storage even after preparation succeeded.

There is at most one pending direct upload, capped at 200 MB and ten minutes.
The mode-0600 pending record survives restarts and contains no credentials.
Cancellation revokes the GCS session when available and deletes staged bytes.
Expired pending state is cleaned on the next direct request; staged objects have
custom-time expiry under the existing bucket lifecycle. A restart does not
persist the session URL, so an abandoned session can remain valid at Google for
up to its one-week maximum; its single temporary object is never published after
the application deadline and remains subject to lifecycle cleanup. Completion
retries recognize already published clips without duplicating quota or objects.

This replaces the temporary Pi chunk-assembly transport. The deployed game
bundles remain unchanged: the landing HTML adds a narrow upload adapter and the
Worker gets an internal prepared-object hook. `commit` in health identifies the
original application; `deploymentCommit` identifies these host/upload changes.
Existing open pages must reload to use direct uploads. Legacy small-body uploads
remain compatible with the original API.

## Install and update

Bootstrap once: isolated `fitness-arcade` and `fitness-sharing` system users,
root-owned Node 22 runtime at `/opt/fitness-arcade/node`, Python auth venv, workload
identity/certificate files, existing environment files and state. Keep secrets
off terminal output and transfer them only over SSH into mode-0600 files.

From clean pushed `main` after relevant tests:

```sh
node --test apps/arcade/deploy/pi/*.test.mjs apps/arcade/deploy/gcp/*.test.mjs apps/arcade/server/worker.test.js
python3 apps/arcade/deploy/pi/deploy.py
```

For the initial move preserving the served game bundles:

```sh
python3 apps/arcade/deploy/pi/deploy.py --from-gce
```

This adds the Pi adapter plus one script tag in the landing HTML and records both the original `commit` and
`deploymentCommit` in `/healthz`. It does not transfer private state or change DNS.
The installer validates Caddy before changes, snapshots stopped application state,
and restores the previous code/proxy on startup failure. A normal code rollback
never overwrites newer account data.

## Initial cutover and acceptance

1. Record source release and hashes. Stage code/identity on Pi, verify GCS read,
   create/read/delete a disposable synthetic object, and check private origin routes.
2. Save the current GCE proxy, units and DNS. Freeze both GCE application writers;
   archive complete state and env files privately; transfer over SSH and verify hashes.
3. Start Pi with final state. Route the old GCE HTTPS proxy over Tailscale to Pi so
   clients with cached DNS still reach the sole writer. Preserve its original config.
4. Add `fitness.integ.life` to `integ-pi` with `http://127.0.0.1:18411`, then change
   only that DNS record to the tunnel CNAME. Preserve every unrelated tunnel route.
5. Verify Cloudflare DNS and healthy Pi connector, public `X-Fitness-Origin`, exact
   frontend asset hashes, gallery read/playback/ranges, direct synthetic upload/delete,
   OAuth callback and session continuity, and actual desktop/mobile browser flow.
6. Disable old GCE application units after acceptance. Retain original release,
   private migration backup and transitional forwarding for rollback/cached DNS.

Validate a synthetic upload larger than 100 MB directly to GCS from the browser,
with only small preparation/completion requests reaching the public Tunnel.

## Rollback

Before Pi accepts writes, restore saved GCE proxy/DNS and start the original units.
After Pi accepts writes, stop/freeze Pi, snapshot and verify its **current** state,
reverse-copy both state trees to GCE and repair ownership before starting the old
application. Restore original proxy and DNS; validate the single writer and public
behavior. Never start GCE against its stale migration snapshot.
