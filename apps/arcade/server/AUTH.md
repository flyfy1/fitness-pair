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
`https://fitness.integ.life/api/auth/callback`; the interface locale follows the selected `en` or `zh-CN` language.

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
The existing 90-second / 20 MiB per-clip limits and seven-day expiry remain.
Quota measures actual uploaded body bytes, never a client-declared size.
Deleting or expiring clips frees logical quota. Cloud Storage soft-delete retention
and lifecycle timing can retain billable bytes after logical removal.

An atomic, fsynced ledger in `/var/lib/fitness-arcade/accounts/` reserves bytes and
the globally unique clip ID before cloud writes. A process-local queue serializes
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
public and private videos. An upload is rejected if its actual bytes would cross
the applicable limit; deleting older videos releases space. Expiry still applies
at seven days, and quotas describe active logical storage rather than GCS billing.

The same atomic ledger accepts `ownerId: null` for anonymous reservations. Before
anonymous usage is reported or a new upload is admitted, the gateway imports
active ownerless Gallery records, across all storage listing pages. Initialization
fails closed on an incomplete inventory. Partial uploads retain reservations.
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


Browser evidence for this slice: six Chrome tests use a real local gateway,
durable quota files, mock identity/storage, and browser-encoded synthetic WebM.
They cover anonymous upload/playback/device removal, both full-quota notices,
private upload/owner listing/copied-link playback/revocation, missing-token denial,
interrupted anonymous cleanup, and 320/390px layout. These are local integration
checks; they do not establish a deployed release or participant recording evidence.

Rollback boundary: after private publications exist, never restore a gateway that
predates visibility checks: it would expose private records through the Gallery.
Older account stores also cannot read anonymous reservations. Preserve the current
ledger and use a compatible release or disable the Gallery API while recovering.
Do not reset the ledger or restore stale account state to make old code start.
