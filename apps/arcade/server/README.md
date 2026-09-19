# Optional GCP sharing gateway

The Worker serves the gallery API and private-bucket media in two independent deployments. The GCP VM can use its keyless identity adapter; GPT Sites retains its separate configuration. The private bucket is `project-e8ef2daf-0520-4018-b9f-fitness-sharing`. Bucket configuration alone does not enable sharing. See the [GCP identity setup](../deploy/gcp/README.md#keyless-gallery-configuration).

## Runtime configuration

Set through Sites runtime environment management, never in Git or browser code:

- `GCP_BUCKET`: a dedicated private bucket.
- `GCP_SERVICE_ACCOUNT_JSON`: secret JSON with a narrowly scoped service account's email and PKCS8 private key. Prefer a future federated identity when available; this portable implementation uses the official signed JWT OAuth flow.
- On GCP, anonymous public uploads share a 10 GB pool. Each Integ.Life account owns its public/private publications and receives 2 GB of storage. See [account protocol, quota, and recovery](AUTH.md).

The GCP Node adapter uses `GCP_IMPERSONATE_SERVICE_ACCOUNT` instead of a JSON key.
It injects an internal `GCP_ACCESS_TOKEN_PROVIDER` function; this is server code,
not a browser setting or a Sites environment variable. The VM obtains short-lived
credentials for the dedicated storage account, scoped to Cloud Storage access.

Grant the service account object create/get/list/delete permissions only on this bucket. Keep uniform bucket-level access and public-access prevention enabled. Configure the custom-time lifecycle rule using the [retention migration](../deploy/gcp/README.md#sharing-expiry-migration) before enabling sharing; the app denies expired records immediately, while lifecycle cleanup removes stored bytes. Supply the chosen project/bucket through normal configuration, not pasted private keys in chat.

## Flow

1. Gameplay automatically creates an unbranded local replay of up to the latest 90 seconds in IndexedDB. Recordings stay at normal speed. This upload endpoint accepts up to 90 seconds / 200 MB.
2. For an oversized replay, the player first makes a local share copy of up to 55 seconds of final gameplay. The original remains local. The player previews the chosen copy and explicitly consents to upload with the displayed visibility. Anonymous uploads are public and last seven days; logged-in users may choose Private and an expiry of 1, 7, 30, or 90 days, or Never.
3. Worker verifies account authorization, Origin/CSRF, consent, metadata, bounded body and MP4/WebM magic bytes; reserves account bytes before uploading. Anonymous uploads stage private bytes first, remove the oldest anonymous publications if needed to fit the 10 GB pool, then reserve and publish. Finite expiry metadata and object bytes are uploaded atomically. New metadata binds the central account rather than a device management key.
4. Gallery lists public records only. `/clips/:id` reads public records, or private records with an owner session or a separate random sharing token. `/api/media/:id` streams private GCP bytes through the site and forwards byte ranges. No bucket key or public bucket URL reaches the browser.
5. Deletion removes the publication record first; downloads no longer resolve. Local deletion and public revocation are independent.

The earlier access-code release was verified on GCP; account rollout evidence is tracked separately in [deployment evidence](../deploy/gcp/EVIDENCE.md). Moderation is not implemented. Header checks do not establish video codec safety or actual duration: duration is client-declared. Storage lifecycle uses each object’s custom expiry time; elapsed-time cleanup has not been observed in this release check. The existing Node/FFmpeg sharing experiment contains deeper media validation and remains unchanged.

The site hosts clip links but cannot prevent viewers from saving videos or recording their screen. An iframe does not provide copy protection. Sites access controls still determine who can open shared pages; a private deployment is not a public growth loop.

## Game stop feedback

Every hosted playable game receives one shared **Stop game** control. After an
active round is stopped, the player can send a thumbs-up or thumbs-down rating.
`POST /api/feedback` stores one private JSON record per event under
`/var/lib/fitness-arcade/feedback/events/`. The browser supplies the game ID,
play-page path, elapsed session time, stop time, stopped/completed reason, input
provenance and final score.
The gateway adds its receipt time plus bounded User-Agent, Origin, Referer path
and `Sec-Fetch-Site` headers. For a valid Integ.Life product session it also adds
the hashed account ID and display email.

The endpoint accepts only same-origin JSON for a registered playable game. It
does not store Cookie, Authorization, CSRF tokens, IP addresses, camera frames,
landmarks or recordings. Event files are mode `0600` inside the service's private
state directory and survive release rollbacks. This first slice has no public or
browser-readable reporting endpoint; operators can aggregate the private event
files on the VM without exposing account and request metadata.

## Private recognition debug reports

During a game, the shared shell keeps the latest 90 seconds of UUID-linked named
body-joint data on the device with the local replay. A player may open **Debug
report**, or explicitly enable the browser speech service and say
**“我要上传 debug”**, to review a private diagnostic upload. Nothing is uploaded
until the player confirms. Gameplay video is a separate checkbox and defaults off.

`POST /api/debug-reports` accepts at most 16 MiB of bounded JSON tracking and
session context. `PUT /api/debug-reports/:id/video` requires the distinct
`debug-video-v1` consent header and accepts MP4/WebM up to 105 MiB. The GCP gateway
stores mode-`0600` records under `$FITNESS_STATE_DIR/debug-reports/events/` and
optional video under `$FITNESS_STATE_DIR/debug-reports/videos/`; neither is a
gallery publication. Both expire after 30 days; the gateway prunes them on startup,
hourly and before accepting another report. Requests are same-origin, UUID-bound and idempotent. Browser
speech recognition is opt-in because the browser's speech service may process
command audio; Hopmodo does not store that command audio.

## Sources

- [GCP object upload API](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/insert)
- [GCP object download API](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/get)
- [Service-account JWT OAuth flow](https://developers.google.com/identity/protocols/oauth2/service-account)

## Clip thumbnails

`/api/posters/:id` serves a JPEG from `videos/:id.jpg` only while the original
publication is visible. Authenticated owners can PUT a JPEG of up to 256 KiB
with the existing CSRF and gallery-consent headers. Conditional creation makes
retries idempotent. Deletion removes the publication, video, and thumbnail;
expired or removed videos cannot expose their thumbnails. The original publication expiry also applies to these derived images; permanent videos and their posters have no custom deletion time. Account quota continues to
measure uploaded video bytes; bounded thumbnails are derived presentation data.

Gallery and account cards do not fetch video bytes just to obtain a preview.
Thumbnails do not change the original video, publication expiry, ownership or quota.
