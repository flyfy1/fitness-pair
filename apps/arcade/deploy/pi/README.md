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

The Pi launcher imports the existing GCP gateway and adapts its credential
provider and large-upload transport. This permits migrating a served release
without deploying newer game code.

The Free Cloudflare plan limits each request to 100 MB. The narrow browser
transport adapter splits gallery Blob uploads above 64 MB into 8 MB requests.
Pi holds one incomplete upload on private disk, bounds it at 200 MB and ten
minutes, and validates origin, consent and account/CSRF or device identity before
accepting bytes. It revalidates identity on each request, then sends the assembled
stream to the original gallery worker for ownership/quota/publication checks.
Cancellation, expiry, failure and restart remove incomplete data. No cloud object
or quota is reserved until finalization. Existing pages loaded before cutover
need a reload to upload files over Cloudflare's request limit.

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

For the initial move preserving the served game bundles and backend source:

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
   frontend asset hashes, gallery read/playback/ranges, synthetic upload/delete,
   OAuth callback and session continuity, and actual desktop/mobile browser flow.
6. Disable old GCE application units after acceptance. Retain original release,
   private migration backup and transitional forwarding for rollback/cached DNS.

Validate a synthetic upload larger than 100 MB through the public Tunnel before
declaring the 200 MB upload transport migrated.

## Rollback

Before Pi accepts writes, restore saved GCE proxy/DNS and start the original units.
After Pi accepts writes, stop/freeze Pi, snapshot and verify its **current** state,
reverse-copy both state trees to GCE and repair ownership before starting the old
application. Restore original proxy and DNS; validate the single writer and public
behavior. Never start GCE against its stale migration snapshot.
