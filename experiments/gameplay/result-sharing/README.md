# Result Sharing experiment

## MVP card

- Target user: a Fitness Pair player who wants to share a finished game's highlight.
- Job: preview a short clip and give a friend a link that plays without signing in.
- Riskiest assumption: a short, readable result clip is worth sharing outside the game.
- P1 loop: choose an existing local clip (or generate a clearly synthetic demo), preview,
  explicitly consent to public sharing, upload, open the link on another device.
- Success proof: real browser upload, persisted playable media, public HTTPS playback,
  seek/range delivery, social metadata, and revocation. Synthetic proof is not a human trial.
- No-gos: automatic camera recording, private footage collection, accounts, leaderboards,
  multiplayer, AI highlight detection, health claims, or changes to other games.
- Appetite: one independently deployed exploration and one bounded review pass.
- Owned paths: `experiments/gameplay/result-sharing/` only.

## Baseline and hypothesis

The game hosts currently finish locally and provide no hosted result clip. This
experiment adds a separate preview/publish/view flow without changing recognition or
shared contracts. It accepts an existing recording, including camera footage only
when the uploader explicitly confirms permission from everyone shown. Nothing is
uploaded by choosing a file or generating a demo. Game integration and automatic
highlight selection remain later work; this is not an integrated recording feature.

## Run

Node.js 18+ and FFmpeg/ffprobe are required; there are no npm runtime dependencies.

```sh
cd experiments/gameplay/result-sharing
UPLOAD_CODE=choose-a-private-code PUBLIC_ORIGIN=http://127.0.0.1:8410 node server.mjs
# Open http://127.0.0.1:8410. Use the configured code to publish.
node --test server.test.mjs
```

The uploader code gates creation; viewers need no code. Keep the code out of shared
links and source control. It is entered per browser session and never placed in a URL.
The creation response contains a separate per-clip management token. Keep the local
management link: its fragment never reaches HTTP logs and is omitted from sharing.
Anyone holding that management token can remove that clip.

## Boundaries

- MP4 (H.264/AAC) or WebM (VP8/VP9/Opus/Vorbis), at most 20 MiB and 60 seconds.
- Files are streamed to disk, then format/codec/duration checked with bounded ffprobe.
  FFmpeg creates one poster; no cloud analysis, tracking, external scripts or fonts.
- Files are stored on the GCP VM, with 7-day expiry, a 500 MiB total media budget,
  one concurrent ingest, and 30 accepted ingest attempts per hour. No public listing.
- Titles and provenance are uploader supplied; recordings are labelled replay, demos
  synthetic. The server does not certify score or exercise performance.
- Clip links are unlisted, not private. Viewers can save copies; deletion/expiry
  cannot retract downloaded copies. Media and pages use `no-store` and `noindex`.
- Pending files and expired clips are cleaned at startup and hourly. Reads enforce
  expiry immediately. A crash before publication leaves no visible half-created clip.
- No durable backup is promised for these intentionally temporary clips.

## API

`POST /api/clips?title=...&source=replay|synthetic` with raw video body, video
Content-Type, `Authorization: Bearer <upload code>` and `X-Sharing-Consent: public-v1`.
Returns `{id, url, manageToken, expiresAt}`. `GET /api/clips/:id` returns public
metadata. `GET /s/:id` is the social/playing page; `/media/:id` supports byte ranges;
`/poster/:id` serves the preview image. `DELETE /api/clips/:id` accepts the returned
management token as Bearer auth. No pose landmarks, camera identifiers or completion
IDs are collected. Existing PoseFrame → ActionFrame → GameSnapshot remains unchanged.

## Deployment and evidence

See [deploy/README.md](deploy/README.md) and [EVIDENCE.md](EVIDENCE.md).
