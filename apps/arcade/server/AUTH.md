# Integ.Life accounts and shared storage

## MVP card

- Target user: a player who wants to share a game clip, with or without an account.
- Job: upload a local replay publicly as a guest, or use an Integ.Life account for public/private sharing and management across devices.
- Riskiest assumption: central login, durable ownership, and storage accounting remain consistent across redirects, retries, and restarts.
- P1 loop: preview local clip → choose anonymous Public or account Public/Private → consent and upload → share playback link → remove video and release quota.
- Success proof: protocol and quota tests; a browser login/publication/removal round trip; independent account isolation; actual production storage readback.
- No-gos: private recording in tests, browser-held central tokens, cross-domain cookies, account merging by email, or silent anonymous fallback after a login expires.
- Appetite: one account and sharing slice. Editing videos, moderation, billing, and broader social features are deferred.

## Protocol and identity

Hopmodo is a confidential Integ.Life client. `/api/auth/start` uses Authorization
Code with S256 PKCE, a random state, and a ten-minute HttpOnly transaction cookie.
The corresponding verifier and return path stay in a bounded server transaction
map. Restarting during login requires starting again. Only local, allowlisted
return paths are accepted. The callback is exactly
`https://fitness.integ.life/api/auth/callback`; the interface locale is `en`.

The backend exchanges the code and reads `/userinfo` from the configured issuer.
A hash of `(issuer, sub)` is the internal owner identity; email is display-only.
The central access token never enters browser storage or a redirect URL. The
product issues a seven-day opaque, HttpOnly, Secure, SameSite=Lax, host-only
session. Logout revokes this product session without logging out other products.
Cookie-authenticated writes require both the exact Origin and a session-bound
CSRF token. The gateway preserves multiple Set-Cookie headers on Node 18+.

See the central `integ-auth/README.md` contract and
[OAuth security best practices](https://www.rfc-editor.org/rfc/rfc9700.html).

## Ownership and quota

Each account has **2 GB = 2,000,000,000 bytes** of active published-video storage.
The existing 90-second / 200 MB per-clip limits remain. Account owners choose
1, 7, 30, or 90 days, or Never (the new interface default). `expiresAt: null` means
permanent and counts toward quota until removed. Existing shares retain their original expiry.
Quota measures actual uploaded body bytes, never a client-declared size.
Deleting or expiring clips frees logical quota. Cloud Storage soft-delete retention
and lifecycle timing can retain billable bytes after logical removal.

An atomic, fsynced ledger in `/var/lib/fitness-arcade/accounts/` reserves bytes and
the globally unique clip ID before account cloud writes. Anonymous staging is described below. A process-local queue serializes
reservations for all accounts, so overlapping requests cannot exceed quota or
claim the same ID. **Exactly one gateway process may write this directory.**
The systemd service is the sole production writer. Sessions are separate files
under `sessions/`; no credentials or ledger files belong in Git or release archives.
Missing/corrupt/unwritable state must be investigated; never delete or reset a ledger
to recover an upload. Back up this directory with the GCS publication records.

The private GCS publication record carries `ownerId` and actual byte size. Public
responses omit owner IDs, account email, session secrets, and legacy key hashes.
Account-owned clips require the same central account for deletion on any device.
An old device management key cannot override new account ownership. Legacy clips
without an owner retain their existing management-key deletion behavior and are
not silently assigned to whichever account logs in on that device.

`GET /api/account/clips` returns only the current user's ledger entries and quota.
A partial/ambiguous upload keeps its reservation and appears as unavailable so
its owner can remove it. Removal revokes the publication first, deletes the bytes,
then releases quota. A failed media deletion keeps its reservation for a retry.
An idempotent retry of a completed upload never reserves additional storage.
The local IndexedDB library remains device-local; logging in does not upload it.

## Runtime configuration

Set root-only `/etc/fitness-arcade.env` values:

- `INTEG_AUTH_ISSUER=https://auth.integ.life`
- `INTEG_AUTH_CLIENT_ID=hopmodo`
- `INTEG_AUTH_CLIENT_SECRET`: independently generated secret registered at central Auth.
- The existing `GCP_BUCKET` and `GCP_IMPERSONATE_SERVICE_ACCOUNT`.

The service unit sets `FITNESS_STATE_DIR=/var/lib/fitness-arcade` and creates its
private persistent directory. No shared upload code authorizes new uploads.
The separate legacy `/highlights` studio and GPT Sites runtime are unchanged.

## Backend checkpoint evidence

Automated tests cover PKCE/state/expiry/cancellation, safe return paths, token
containment, session restart/logout, CSRF, account isolation, idempotent publication,
actual byte accounting, exact 2 GB boundary, concurrent reservations, ID ownership,
deletion and expiry. This is synthetic/mock evidence, not production login proof.

## Browser checkpoint evidence

Three real Chrome browser tests use the production gateway and file-backed store,
a mock central identity service, and mock cloud storage. They generate an actual
synthetic WebM without camera/microphone access and verify login return to the
saved clip, consent, publication byte count, public playback, account isolation,
same-account management from a second browser, revocation, local copy retention,
quota UI/API enforcement, partial-upload cleanup, logout and 320/390px layout.
Run `npx playwright test -c apps/arcade/playwright.accounts.config.js` after building.

The broader arcade/game-shell/gallery suite passed 23 of 25 tests. Two existing
recording checks also fail on the unmodified checkout at `59ae493`: the Motion Quest
0.5-second decoded-frame check sees the ending instead of the footer logo, and the
forced WebM completion fixture does not save within its timeout. The account
change does not modify recording composition or lifecycle, and these failures are
not represented as passing tests or as human recording evidence.


## Anonymous uploads and private links

Anonymous players explicitly publish public videos against one global **10 GB =
10,000,000,000 bytes** pool. Signed-in players use their own 2 GB quota for both
public and private videos. Account uploads exceeding 2 GB are rejected with a
suggestion to remove older shares. Anonymous videos always expire after seven days.
If an anonymous upload would exceed 10 GB, the oldest active anonymous videos
are removed until it fits. Account videos are never eviction candidates. Quotas
describe active logical storage rather than GCS billing.

The same atomic ledger accepts `ownerId: null` for anonymous reservations. Before
anonymous usage is reported or a new upload is admitted, the gateway imports
active ownerless Gallery records, across all storage listing pages. Initialization
fails closed on an incomplete inventory. One upload lock covers staging, eviction,
reservation and publication. New anonymous bytes and their expiry are stored before
older publications are revoked. Failed staging preserves the old clips. Eviction
revokes each marker before deleting its media/poster, then releases its reservation;
failed deletions retain that reservation for retry. Partial eviction can revoke an
old link even if publication later fails. Unpublished staging is removed on failure
and still has its seven-day storage expiry if cleanup fails. Partial publications
retain reservations. This is not a multi-object cloud transaction.
Anonymous device management keys are saved locally before upload; only their hashes
are stored server-side. They authorize thumbnail uploads, idempotent retries and
removal, including cleanup after a partial upload. They do not assign ownership to
a later login. A signed-in attempt with an expired CSRF token returns 401 instead
of silently becoming a public anonymous upload.

`visibility` defaults to `public` for compatibility. Anonymous private uploads are
rejected. Private uploads require a distinct `private-v1` consent header, so older public-only
gateways reject them during a version mismatch. They receive a separate random 256-bit share token and never
appear in the public Gallery. Their metadata, video (including HEAD and Range),
and poster require either the owner session or the complete `?share=...` link.
The owner list returns that link for sharing across devices. Anyone who receives
or is forwarded that link can watch without an account. Only the owner may delete;
deleting or expiry revokes playback. Per-recipient invitations and changing an
existing publication's visibility are outside this slice.

Synthetic server checks: `node --test apps/arcade/deploy/gcp/*.test.mjs
apps/arcade/server/*.test.js` covers exact pool boundaries, concurrency, restart,
legacy inventory, failed writes/deletion retries, account isolation, private media
and poster access, link forwarding, and owner revocation.


Browser evidence for this slice: eight Chrome tests use a real local gateway,
durable quota files, mock identity/storage, and browser-encoded synthetic WebM.
They cover anonymous upload/playback/device removal, account quota blocking and anonymous full-pool replacement,
private upload/owner listing/copied-link playback/revocation, missing-token denial,
interrupted anonymous cleanup, permanent and thirty-day choices, consent reset,
oversize preflight reporting, and 320/390px layout. These are local integration
checks; they do not establish a deployed release or participant recording evidence.

Rollback boundary: after private publications exist, never restore a gateway that
predates visibility checks: it would expose private records through the Gallery.
Older account stores also cannot read anonymous reservations. Preserve the current
ledger and use a compatible release or disable the Gallery API while recovering.
Do not reset the ledger or restore stale account state to make old code start.


## Expiry protocol and storage

`retention` accepts `1`, `7`, `30`, `90`, or `never`; omission keeps seven days for
older clients. Anonymous values other than `7` are rejected server-side. The
interface enables account choices only when `/api/config` advertises
`retentionOptions`; `anonymous.replacement: "oldest"` enables full-pool uploads.
Changing a selection clears consent. Login returns to the saved local clip's
sharing form and requires explicit consent again; it never starts an upload.

Finite videos, publication records and posters set GCS `customTime` to `expiresAt`.
New objects save this metadata atomically with their bytes. Permanent objects omit
it. The dedicated lifecycle rule uses `daysSinceCustomTime: 0`; the application
still denies access immediately at the exact expiry. Cleanup is asynchronous.
See [migration and rollback](../deploy/gcp/README.md#sharing-expiry-migration).

After permanent records exist, do not roll back to code that rejects null expiry,
or restore an age-based seven-day bucket rule: that would remove permanent videos.
Keep the compatible ledger and storage policy when rolling back UI changes.


## Per-video size limit and rejection records

The upload cap is **200 MB = 200,000,000 bytes**, inclusive, for both anonymous and
account videos. The 90-second limit remains. The interface reports oversize attempts
before sending video bytes, and the API independently checks declared length and
actual streamed bytes. A larger body returns 413 with the 200 MB limit and advice
to make a smaller copy. No quota is reserved and no cloud video is written.

The gateway writes a structured `video_upload_rejected` event to its systemd journal:
timestamp, reason, observed/reported bytes, limit bytes and source (`server-header`,
`server-body`, or `client-reported`). Client checks use a bounded, same-origin
`POST /api/upload-rejections`; account sessions also require CSRF. Client-reported
sizes are telemetry, not verified uploads. Video contents, titles, account email,
management keys and private sharing tokens are not logged. Telemetry failure never
permits an oversized upload. Inspect with `journalctl -u fitness-arcade.service`
and filter for `video_upload_rejected`.
