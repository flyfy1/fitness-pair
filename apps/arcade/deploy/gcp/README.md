# Independent GCP deployment

The complete Hopmodo landing page and all five mounted games are deployed to
`https://fitness.integ.life` on the existing `integ-prod` VM, project
`project-e8ef2daf-0520-4018-b9f`, zone `asia-southeast1-b`.
The GPT Sites deployment and `.openai/hosting.json` are not modified or published
by this workflow. Default builds retain the GPT Sites address. GCP builds set
`VITE_SITE_URL=https://fitness.integ.life` for video branding and game share links.

## Deploy

From clean, pushed `main`, after relevant tests and browser checks:

```sh
node --test apps/arcade/deploy/gcp/gateway.test.mjs apps/arcade/server/worker.test.js
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
The optional UUID-based Gallery API uses the same Worker semantics as GPT Sites.
It remains disabled until a usable GCP identity and upload code are configured.
The VM has no attached service account and organization policy currently prohibits
service-account key creation. This deployment does not change IAM or weaken that
policy. `/api/config` accurately reports `sharingEnabled: false`.

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
