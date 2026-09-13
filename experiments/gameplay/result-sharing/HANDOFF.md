# Sharing server handoff — 2026-09-13

Development and validation were stopped at the user's request for teammate handoff.
All source lives in this directory; no game host or shared contract was modified.

## What works

- Standalone local preview → explicit public-sharing consent → upload → unlisted
  playable share page with poster/social metadata, copy/native sharing and expiry.
- Uploader access code, per-clip removal key, bounded media validation and storage.
- A synthetic canvas animation can be generated without camera/microphone access.
- GCP deployment is live at https://fitness.integ.life. Deployed application code is
  `7588a1b`; later handoff-only commits do not change the running release.
- Five integration test groups pass. See [EVIDENCE.md](EVIDENCE.md) for precise scope
  and unfinished browser checks. Do not present this as game-end recording integration.

## Continue locally

```sh
cd experiments/gameplay/result-sharing
UPLOAD_CODE=local-browser-test-code PUBLIC_ORIGIN=http://127.0.0.1:8410 node server.mjs
node --test server.test.mjs
```

Requires Node 18+ and FFmpeg/ffprobe. No npm dependencies or frontend build are needed.
The agent's local preview process was stopped; the deployed GCP services remain running.

## Server access and data

See [deployment instructions](deploy/README.md). The VM is `integ-prod`, project
`project-e8ef2daf-0520-4018-b9f`, zone `asia-southeast1-b`. SSH uses the existing
Google Cloud identity and IAP. Runtime data lives under `/var/lib/fitness-sharing`;
configuration is `/etc/fitness-sharing.env`. Do not publish that file or its code.

The owner's private uploader code is stored locally at:
`/Users/songyy/Documents/fitness-pair-sharing/experiments/gameplay/result-sharing/.local/upload-code.txt`.
It is ignored and is intentionally absent from Git. Share access privately with the
teammate if needed, or retrieve the existing environment through authorized SSH.
A fresh deployment checkout must preserve the existing remote code, as the deploy
script does; its newly generated local file is not necessarily the server's code.

## First next step

After local DNS cache expiry, open the live site and confirm one full browser loop:
load/enter the private upload code, create a synthetic clip, preview, consent, publish,
open the public link, play/seek, copy the public link without a management key, and
remove a disposable clip using its private management link. Check a real narrow
viewport and an intended mobile/social browser. File selection and viewport automation
were limited by the testing tools; they are not evidence of a product failure.

Automatic recording, game-result overlays, selected high moments, direct game-host
integration and real participant trials remain future work. Obtain explicit consent
before collecting or sharing any participant footage. Do not re-enable the shared
legacy Caddy or any migrated services on GCP.
