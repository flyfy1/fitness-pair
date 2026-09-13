# Integ.Life accounts and shared storage

## MVP card

- Target user: a player who wants to publish and later manage a game clip.
- Job: use an existing Integ.Life account, publish a local replay, and manage it from another device.
- Riskiest assumption: central login, durable ownership, and storage accounting remain consistent across redirects, retries, and restarts.
- P1 loop: local clip → Integ.Life login → explicit publication → My shared clips → public playback → owner removal.
- Success proof: protocol and quota tests; a browser login/publication/removal round trip; independent account isolation; actual production storage readback.
- No-gos: private recording in tests, browser-held central tokens, cross-domain cookies, account merging by email, or anonymous upload fallback.
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
The existing 60-second / 20 MiB per-clip limits and seven-day expiry remain.
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
