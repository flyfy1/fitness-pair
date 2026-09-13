# GCP deployment

Explicit user destination: `https://fitness.integ.life` on the existing GCP server.
This exploration does not use Sites hosting or the Raspberry Pi.

- Project: `project-e8ef2daf-0520-4018-b9f`
- VM: `integ-prod`, zone `asia-southeast1-b`, external IP `35.198.216.126`
- DNS: new DNS-only A record `fitness.integ.life` → `35.198.216.126`.
- Ingress: dedicated `fitness-sharing-proxy.service`, Caddy automatic public TLS,
  ports 80/443 → `fitness-sharing.service` on `127.0.0.1:8410`.
- Code: `/opt/fitness-sharing/releases/<timestamp>-<commit>` with `current` symlink.
- Data: `/var/lib/fitness-sharing`, owned by isolated `fitness-sharing` system user.
- Secret: `/etc/fitness-sharing.env`, root-readable, never in Git or shared URLs.
- Runtime: existing Debian Node 18 plus Debian FFmpeg/ffprobe. No npm install/build.

The Mac checkout is development only; no existing `.agent-machine.env` was present.
The prior shared `caddy.service` was inactive/disabled on 2026-09-13; its stale
site fragments must not be re-enabled. This service has independent config, TLS
storage, systemd units and rollback files. Existing GCP firewall tags already
permit 80/443; no firewall/IAM changes are needed.

Run unit/integration checks and browser proof before deployment:

```sh
node --test experiments/gameplay/result-sharing/server.test.mjs
python3 experiments/gameplay/result-sharing/deploy/deploy.py
```

The deploy requires a clean committed worktree, copies only this experiment, validates
Caddy before replacing live configuration, and creates a consistent stopped-service
data backup before upgrades. It preserves the uploader code across updates. The
first deployment generates a local mode-0600 `.local/upload-code.txt`; retain that
file privately. Do not use a fresh checkout's new local code for an already deployed
service; retrieve the existing code through authorized SSH instead.

After deployment verify DNS, a valid HTTPS certificate, `/healthz` release identity,
a public synthetic upload from the browser, playback after reload, a byte-range seek,
poster/social metadata, deletion of a disposable test clip, and systemd ownership.
Readiness alone is not acceptance. Do not record private participants for deployment QA.

## Rollback / retirement

On upgrade failure the installer restores previous code/config and restarts only
these two units. Saved state lives under `/opt/fitness-sharing/rollback/<release>`.
For a manual code rollback, stop `fitness-sharing.service`, repoint `current` to the
saved `previous-release`, restore the saved env/units/Caddy config, daemon-reload,
and start both units. This version makes no data schema migrations; retain the current
media on normal rollback. A saved `data.tar` is a recovery snapshot, not a reason to
overwrite newer clips. First-deploy failure stops the two new units and preserves
artifacts for diagnosis. To retire, disable only `fitness-sharing.service` and
`fitness-sharing-proxy.service`, then separately remove this exact DNS record with
authorization; do not touch shared or Pi services.

## Limits

Single VM and single ingestion process; seven-day temporary media, no durable backup
promise. Browser-ready files only, no adaptive streaming or transcoding. WebM is
remuxed (codec copy) to finalize duration and seeking. Social metadata is server-rendered;
individual social apps decide whether to display the poster or embed video. Current
browser proof does not establish WeChat/iOS compatibility or willingness to share.
