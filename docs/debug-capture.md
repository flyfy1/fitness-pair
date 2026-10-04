# Short recognition debug capture

## MVP card

- Target user: a player blocked during camera setup or a game's movement controls.
- Job: reproduce a failure while keeping hands free, then provide a bounded video
  and named-joint/context timeline for diagnosis.
- Risk: the gameplay recorder starts only at `playing`, so failed calibration or
  start gestures currently have no video or aligned tracking to upload.
- P1 loop: open the common Debug panel → optionally enable speech and private
  upload for this page → say “debug please” or press Record 5-second debug →
  visible five-second capture → save locally → optional private server upload →
  review/download the video and diagnostic JSON, with a report reference.
- Representative input: a camera session stuck at an upper-body start, a paused
  round, and a synthetic preview. Unsupported speech has a manual fallback.
- Useful output: a playable short clip with original named joints, confidence,
  timestamps, session/source, recognition/start context and recorded phases.
- Proof: synthetic capture during setup, all nine game routes, local reload,
  opt-in speech dispatch/duplicate/denial/cleanup, no-default-upload, upload failure
  retaining downloads, private server persistence/limits and served release.
- No-gos: a second camera/model, microphone audio in the debug clip, public gallery
  publication, unprompted recording, automatic threshold changes, new dependencies,
  or private participant data in Git.
- Appetite: one shared debug capture and review flow; reuse existing recorder,
  tracking contract, presentation adapters and private debug endpoints.

## Consent and destination

A manual capture explicitly records the next five seconds. Speech is disabled
until the player enables it in the Debug panel, and automatically stops on exit,
page reload or hiding the page. The browser's speech provider may process the
spoken command; the app does not record command audio. English and Chinese
commands are accepted. Recognition language defaults to the selected UI, with
an explicit English/Chinese voice-language choice before enabling the microphone.
This does not change the game's UI language.

The service's `start` event is not treated as proof of microphone input. Only
`audiostart` or a recognition result turns the indicator green. Startup without
audio times out after eight seconds; speech without returned text times out after
six seconds. Provider/permission failures turn voice off and show the error code,
including after closing the panel. They do not continuously retry a broken
provider. A compact status with a manual recording button remains in the game.
Recognized interim/final words are shown only in page memory, never logged,
saved or uploaded. Only a final, explicit command in a returned alternative can
trigger capture; interim or negated/non-command text does not record.

The in-app browser initialization trial on 2026-10-04 reached the old Listening
state and then a generic paused/error state without recording video. It did not
prove recognition of a human command. Browser speech availability is a separate
boundary from the shared video recorder; a failed browser speech service requires
manual capture or trying a supported Chrome/Edge installation.

Each capture stays in a separate local IndexedDB store, retaining the latest
three captures within a 25 MiB budget, without evicting ordinary game replays.
Downloads remain available if local storage fails. Enabling private upload is a
separate, visible choice for this page: subsequent button or spoken triggers send
that short video and its diagnostic JSON to this origin's private debug endpoints.
The public production origin is `fitness.integ.life`; localhost uses the current
local gateway and falls back to local downloads if it has no debug endpoint.
A private report is not a gallery post. Upload failure preserves the local copy.

## Validation and reproduction

The synthetic browser suite covers capture on all nine games, frame/recognition
alignment, decodable videos, local reload, speech dispatch and lifecycle cleanup,
private opt-in and failed-upload retry. Speech dispatch uses a mock recognizer;
real spoken-command availability and human movement recognition require a player
trial. Unit and gateway tests cover command matching, private persistence,
retention, malformed payloads and bounded pending-video reservations.

Run the default browser suite with `npx playwright test -c
apps/arcade/playwright.config.js apps/arcade/tests/debug-report.spec.js`.
To explicitly create one private synthetic report on a live gateway, run
`DEBUG_LIVE_UPLOAD=1 ARCADE_BASE_URL=https://fitness.integ.life npx playwright test
-c apps/arcade/playwright.config.js apps/arcade/tests/debug-report.spec.js
--grep 'opt-in live gateway' --output=.local/results/debug-live`.
The test saves the report reference, video hash, sample counts and a screenshot
under that ignored local directory. Verify those against private server files;
the public API intentionally has no report-read endpoint.
