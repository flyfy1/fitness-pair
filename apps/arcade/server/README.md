# Optional GCP sharing gateway

The Worker serves the gallery API and private-bucket media in two independent deployments. The GCP VM can use its keyless identity adapter; GPT Sites retains its separate configuration. The private bucket is `project-e8ef2daf-0520-4018-b9f-fitness-sharing`. Bucket configuration alone does not enable sharing. See the [GCP identity setup](../deploy/gcp/README.md#keyless-gallery-configuration).

## Runtime configuration

Set through Sites runtime environment management, never in Git or browser code:

- `GCP_BUCKET`: a dedicated private bucket.
- `GCP_SERVICE_ACCOUNT_JSON`: secret JSON with a narrowly scoped service account's email and PKCS8 private key. Prefer a future federated identity when available; this portable implementation uses the official signed JWT OAuth flow.
- On GCP, Integ.Life login replaces the early-access upload code. Each central account owns its publications and receives 2 GB of storage. See [account protocol, quota, and recovery](AUTH.md).

The GCP Node adapter uses `GCP_IMPERSONATE_SERVICE_ACCOUNT` instead of a JSON key.
It injects an internal `GCP_ACCESS_TOKEN_PROVIDER` function; this is server code,
not a browser setting or a Sites environment variable. The VM obtains short-lived
credentials for the dedicated storage account, scoped to Cloud Storage access.

Grant the service account object create/get/list/delete permissions only on this bucket. Keep uniform bucket-level access and public-access prevention enabled. Configure a 7-day bucket lifecycle deletion rule before enabling sharing; the app denies expired records immediately, while lifecycle cleanup removes stored bytes. Supply the chosen project/bucket through normal configuration, not pasted private keys in chat.

## Flow

1. Gameplay automatically creates a branded local replay in IndexedDB. Local recordings are bounded at 100 MiB; this pilot upload endpoint currently accepts up to 60 seconds / 20 MiB.
2. For an oversized replay, the player first makes a local share copy of up to 55 seconds of final gameplay plus a three-second invitation. The original remains local. The player logs in with Integ.Life, previews the chosen copy and explicitly consents to gallery publication.
3. Worker verifies account authorization, Origin/CSRF, consent, metadata, bounded body and MP4/WebM magic bytes; reserves actual bytes against the account quota; then uploads private bytes and a publication record. New metadata binds the central account rather than a device management key.
4. Gallery and `/clips/:id` read publication records. `/api/media/:id` streams private GCP bytes through the site and forwards byte ranges. No bucket key or public bucket URL reaches the browser.
5. Deletion removes the publication record first; downloads no longer resolve. Local deletion and public revocation are independent.

The earlier access-code release was verified on GCP; account rollout evidence is tracked separately in [deployment evidence](../deploy/gcp/EVIDENCE.md). Moderation is not implemented. Header checks do not establish video codec safety or actual duration: duration is client-declared. The seven-day lifecycle rule is configured; elapsed-time cleanup has not been observed in this release check. The existing Node/FFmpeg sharing experiment contains deeper media validation and remains unchanged.

The site hosts clip links but cannot prevent viewers from saving videos or recording their screen. An iframe does not provide copy protection. Sites access controls still determine who can open shared pages; a private deployment is not a public growth loop.

## Sources

- [GCP object upload API](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/insert)
- [GCP object download API](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/get)
- [Service-account JWT OAuth flow](https://developers.google.com/identity/protocols/oauth2/service-account)
