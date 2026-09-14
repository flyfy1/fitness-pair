# Hopmodo arcade

Owns the landing page, game selection, local clip library, gallery UI and optional GCP gateway. Existing games and recognizers retain their ownership.

The production origin sends standard Google Analytics 4 page views to the
dedicated Hopmodo property. Analytics is disabled on localhost and other hosts.
Query strings are omitted, and individual `/clips/:id` URLs are grouped under one
report path. Camera frames, recordings and local clip data are never included.

Run `npm run build:arcade` at repository root, then `npm run preview:arcade` (port 5191). The build includes Motion Quest, Dino Run, Dino AR, Push-up Flight and Jump Game (guided camera Dino) under `/games/`. Each standalone game build remains available. All mounted games resolve tracking assets through the same-origin shared `/runtime/` directory. Root Sites deployment uses a Worker with static assets and optional GCP secrets.

Recording starts automatically when a game is running. Motion Quest starts after standing calibration reaches gameplay readiness, or immediately on entering its synthetic preview. Permission, model loading and initial calibration are excluded. A visible notice explains that the game, enabled camera and available game sound are recorded on this device; microphone audio is requested only after the player clicks Record conversation and is stored as a separate local track. Each finished round produces a replay without another recording choice. Explicit round identifiers distinguish immediate restarts; a previous replay can finish processing while the next round records. Backgrounding saves the current segment, and returning resumes automatic capture. The host composites the game's canvas and the camera preview already enabled in the game; it never requests an additional camera stream. Motion Quest retains the full charge, projectile, impact and victory animation before saving. Its camera stops at the final repetition; the recorder freezes the last camera frame while the game effects finish. Motion Quest AR combines mirrored camera and landmarks behind the transparent game layer; Dino uses a camera inset. Saved previews and gallery uploads contain the original game view without a promotional footer or invitation.

Recording keeps up to the latest 90 seconds at normal speed. New footage replaces the oldest footage while gameplay continues. Capture ends on completion, camera loss, exit, or backgrounding, with a 100 MiB memory safety limit and a 150 MiB local library limit. An encoder or memory-limit failure is reported without interrupting gameplay. New replays and short share copies save a small JPEG alongside the video. Rolling replays use the first retained frame, so overwritten footage cannot remain in the thumbnail. Local cards load video only when the player clicks Play replay. Clips without a thumbnail show a playback placeholder without decoding while browsing. Choose Generate thumbnail to prepare and save the first frame on this device; it can be cancelled and stops if the page is hidden. Gallery, shared-clip pages and My shared clips likewise load only a still image until Play replay. Publication also uploads the chosen video’s JPEG; retry publication if the video was saved but its thumbnail upload failed.

IndexedDB stores local video blobs; localStorage is unsuitable for video sizes. Only the two latest videos are retained, including in-memory fallbacks. Replay cards and newly generated share copies appear newest first immediately, and keep the same order when opening or reloading My clips. Older recordings that finish processing late keep their chronological position. Older clips are removed atomically on save and when opening an existing library. Download videos you want to keep. The byte safety limit may retain fewer than two very large clips. Page exit cannot guarantee asynchronous persistence; finish the round before closing the tab. Deleting a local clip does not revoke an already shared clip. The gallery gateway accepts clips up to 90 seconds / 200 MB. “Make short share copy” keeps up to the final 55 seconds of gameplay without promotional branding, re-encoding entirely on this device. Share copies count toward the two-video library limit. Preparation takes up to a minute, can be cancelled, and stops if the tab is hidden. Preview the new copy before explicitly publishing it; creating a copy never uploads it. Full replays can also be downloaded or passed to native file sharing.

Each replay keeps the orientation at the start of its round: portrait play records a portrait video with the game viewport ratio, and landscape play retains the landscape format. The encoder keeps one size for the whole round; rotating the device affects the next round. Speed conversion, share copies, conversation mixing and branded downloads retain the recorded dimensions. Portrait downloads use the existing portrait invitation layout.

Round completion shows a visible preparation message, then automatically focuses and scrolls to that round’s replay when it is ready. Play replay starts the video; Back to game returns to the native restart controls and pauses playback. View replay reopens the current round without publishing it. The player reserves its recorded dimensions before the thumbnail loads, so automatic scrolling lands on the video. Starting another round cancels a pending reveal, so a late save cannot interrupt new gameplay. Recording failures explain why no video is available; storage failures still show the playable in-memory replay with a download warning. Saved videos retain their original speed and game audio. Both video and optional conversation use bounded rolling buffers; the saved conversation offset follows the retained video window. Download alone appends the existing three-second Hopmodo invitation to a temporary copy, without adding a footer to gameplay; it does not replace the unbranded preview or upload source and does not occupy a library slot. The fast path copies compressed gameplay and audio unchanged and encodes only the ending locally. It does not replay the full video. Devices or legacy formats without a compatible ending encoder use an explicitly labeled playback-length export, still without a gameplay footer. Existing previously branded recordings cannot have their baked-in branding removed.

“Share with a friend” passes the actual video File to the operating system share dialog, only from a player click and only when file sharing is supported. Otherwise, the player can download and attach it manually. “Copy game link” sends friends to the game, not to the private local clip. Cancelling sharing leaves the recording in place. Local clips also provide a complete Copy message caption to send with the video attachment; it includes the game invitation and does not claim to link to the local recording.

After uploading, and on each shared video page, Copy message includes the full viewer link, game invitation and expiry date when set. Private messages retain the access token and explain that anyone holding the link can watch; private pages have no public social-network shortcuts. Public videos offer LinkedIn, X (Twitter), and Facebook logo links that open another tab for user review while retaining the video page. X receives the complete message as prefilled text. Clicking LinkedIn or Facebook also copies the message before opening their link-sharing composer, with an explicit paste instruction and a manual-copy fallback when the clipboard is blocked. This clipboard fallback is not text prefill. Ordinary links also work in embedded browsers that do not display scripted popups. No social login, third-party SDK, automatic posting or visibility change is added. A selectable message remains available when clipboard access is blocked.

MP4 is preferred and confirmed from actual encoded bytes. Browsers without an available MP4 encoder save clearly labeled WebM files; files are never renamed to claim MP4. See [recording evidence and browser limits](RECORDING.md).

Cloud sharing on `fitness.integ.life` allows anonymous public uploads within one shared 10 GB (10,000,000,000 bytes) pool. Signed-in Integ.Life accounts each have 2 GB (2,000,000,000 bytes) for public and private videos. Private videos stay out of Gallery; the owner can share a link that friends can watch without logging in. Anyone holding that link can watch and copy it. When the anonymous pool is full, new uploads replace the oldest anonymous videos; anonymous shares otherwise expire after seven days. Account owners choose 1, 7, 30, or 90 days, or Never (the default). Permanent videos count toward the account quota until removed. Account uploads exceeding 2 GB are rejected with a suggestion to delete older shared videos. Anonymous removal requires the saved local clip on the publishing browser. `/shared` lists that account's publications across devices, shows usage, and lets the owner remove a clip and release its quota. Logging in from a local clip returns to that saved clip for review and explicit consent; it never publishes automatically. Local recordings remain device-local. GPT Sites remains separately configured with sharing disabled. See [account and quota details](server/AUTH.md). The separate teammate sharing experiment remains untouched.

## Add a game

The homepage lists only Motion Quest, Push-up Flight and Jump Game. Keep additional demos registered with `listed: false` until they are ready to appear in the arcade. This hides their homepage cards and links while preserving direct `/play/:id` access, mounted builds, recording and sharing.

Add one entry in `game-catalog.js` for the UI, build and publication allowlist, and select a presentation adapter. Prefer the native API described in [the shared gameplay host](src/gameplay/README.md); the recorder never needs a game-specific change. No generic event bus or new recognition semantics are introduced.

## Evidence

Automated synthetic browser checks cover navigation, concept controls, keyboard game entry, automatic recording, round completion, repeat rounds and local clip persistence. Server tests cover disabled configuration, consent, authorization, size and format checks. These checks do not establish human movement accuracy, exercise benefits or enjoyment. Live GCP synthetic upload, stored-object readback, anonymous playback/range requests and owner deletion passed on 2026-09-13. See [deployment evidence](deploy/gcp/EVIDENCE.md).

## Identity

The public-facing platform is Hopmodo. Repository/package names, the Sites app title and URL, game names, and the existing IndexedDB database stay unchanged. `src/brand.js` holds the public brand and canonical URL; update it if the public address changes.

## Browser references

## Landing palette refinement

The home route uses `src/landing.css`, scoped under `.landing-page`: warm ivory,
charcoal, cobalt actions, and restrained yellow accents. The illustration remains
interactive inside a contained frame. Shared and in-game styles are unchanged.
Validation on 2026-09-13: production build and eight focused browser checks passed
(landing navigation, mobile/reduced motion, keyboard Dino entry, game cards and
shared assets, and loader states at 320/390/768/1440px). Desktop and mobile visuals
were reviewed; direct Motion Quest entry retained its native interface and had
no landing-page class. These checks cover presentation, not human recognition.

- [Web Share file support and click activation](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)
- [Canvas capture streams](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)


## Latest game mounts

Dino AR and Push-up Flight retain their camera and keyboard/pointer preview modes. Jump Game uses its guided standing/range/countdown flow. Their cards label experimental controls. All five game adapters use existing read-only game state to detect start, round identity, and completion. Dino AR's already-projected skeleton is not mirrored twice. Jump Game composites its smaller game canvas into the full camera viewport using DOM rectangles. Push-up Flight preserves its crash sequence using a frozen camera frame when the game has already stopped its camera. No recognition contract changes were needed.

All five playable `/play/` routes share `src/game-shell.js` and `src/game-shell.css`. The native game fills the browser viewport from entry, with its own stage, status and controls. The game title or home mark returns to the arcade; replay tools sit directly below the game and receive focus automatically after the current round finishes saving. Landing navigation, duplicate game introductions and fixed-height cards are excluded from this layout. Standalone `/games/` routes and the labeled Orbit Pop concept retain their own pages. Motion Quest remains the primary recording reference.

Layout checks cover all five games at 1440×1000, 390×844 and 320×740, including
viewport sizing, reachable start controls, pointer/keyboard return navigation,
recording notices and replay placement. Synthetic browser flows also cover game
entry and local replays for every game, plus the separate concept preview. These
checks establish presentation and software behavior, not human movement accuracy.

## Movement control preparation

The homepage automatically preloads the shared tracking files while visitors
browse, without camera access or recording. Its compact download readout shows
measured bytes and percentage once the selected files' total is known. Cancel,
retry, slow-connection and storage-unavailable states leave the arcade usable.
Saved files are reused by all five mounted games and subsequent visits when the
browser retains them. Camera and game starts still require the player's action.
See [cache design and limits](../../packages/pose-mediapipe/README.md).

The hero places preparation in a white, ink-outlined panel below the primary
arcade action. Ink text and progress fill contrast with the yellow artwork;
cancel/retry remains a secondary text control with a 44px touch target. Status
announcements include the explanation and recovery text. Unknown totals remain
indeterminate with a stage/byte label, and retry clears stale measurements.
The loader adds no animation, including under reduced motion.

Loader UI verification (2026-09-13): production build passed. Four synthetic
worker-message browser checks cover loading, unknown total, cancel/retry, error,
and ready (saved/unsaved) at 320, 390, 768 and 1440px with reduced motion. Screenshots
were visually reviewed for loading, ready and error layouts; primary arcade
navigation remains usable. Four existing real-worker checks passed for device
cache reuse across games/visits, storage denial, slow cancellation/retry, and
simultaneous preloads. Text contrast is 15.35:1 (ink/white), action contrast 6.55:1
(cobalt/white), and progress fill/track contrast 12.18:1. Impeccable's mechanical
scan reported only the existing Arial font choices, retained from the approved
identity. These checks establish UI and download behavior, not human recognition
accuracy. Run the focused checks after building:

```sh
ARCADE_PORT=5297 npx playwright test --config apps/arcade/playwright.config.js apps/arcade/tests/tracking-loader-ui.spec.js apps/arcade/tests/tracking-preload.spec.js
```


## Play from a shared clip

Visitors can watch public clips and play without logging in. Gallery cards and
clip pages link directly to the recorded game's `/play/:id` route with its name.
The clip page puts this action above the video. Camera permissions and setup
remain in the game's own start flow. Uploading requires explicit visibility consent; anonymous uploads are public, and
accounts may select Private. Returning from login never automatically uploads.


## Optional conversation track

The game HUD offers Record conversation / Stop conversation recording. The
microphone defaults off, requires a player click, and records only during the
round. It stops on completion, failure, backgrounding or exit; late permission
results are released after cancellation. Turning it off mid-round keeps silence
in the independent track and preserves timing when it is enabled again.

IndexedDB stores `conversation: {blob, offsetSeconds}` beside the original video.
Game audio stays in the original video. The library's 150 MiB budget counts both
blobs; conversation capture has a 10 MiB safety cap. The track can be downloaded
separately. Include conversation in video locally encodes a separate replay at
playback speed, preserving the original. It is cancellable and stops when hidden.
The selected version drives preview, download, native file sharing, short copies
and Gallery publication. Switching off restores the original video immediately.
Generated versions also appear in My clips after reload. Microphone permission
is not upload consent; publication still requires explicit confirmation of visibility and permission from everyone shown.

## Illustrated game instructions

Every listed game card uses its game preview or bold poster art to invite play.
Clicking its art, title or Play now opens a matching instruction dialog before navigation.
The guide covers the goal, camera setup, three specific control steps, pause and
finish behavior, and a labeled movement sequence. Let’s play enters the existing
AR game without changing its controls or recording lifecycle. Direct `/play/`
links remain available for shared game links and returning players.

Skip tutorial enters the game and remembers that choice in localStorage for that
game on that browser. Later card clicks go straight to the skipped game while
other games continue to show their own guides. Storage denial keeps guides visible.

The dialog does not open a camera or mount a game. Escape, its close button, and
the backdrop dismiss it and restore focus/scrolling. Long guides scroll inside
the dialog, while the heading and entry button remain available. Mobile guides
stack the person diagrams with readable captions instead of shrinking the text.
Instructions and diagrams live in `src/game-guides.js` and `src/movement-art.js`.

Social sharing verification (2026-09-14): 84 unit checks and the complete build passed.
Four focused browser checks cover public platform navigation, full private link
copy/native sharing, blocked clipboard selection at 320px, and immediate sharing
after a consented upload. Uploads, clipboard, native sharing and platform responses
use synthetic fixtures; no social post or participant video was sent. Real platform
login/composer behavior and device share-sheet recipients still need manual checks.

Prefill references: [X Post button](https://help.x.com/en/using-x/add-x-share-button), [LinkedIn Share Plugin](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/plugins/share-plugin), and [LinkedIn authenticated publishing](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin). A live browser check on 2026-09-14 found the legacy LinkedIn `feed/?shareActive&mini=true&text=...` route redirected to the feed without opening or prefilling a composer. No undocumented LinkedIn prefill parameter is used. Facebook's documentation endpoint could not be retrieved during this check; no Facebook body-prefill claim is made.

Prefill follow-up verification (2026-09-14): 84 unit checks, the complete build,
and five focused browser checks passed. A real X composer displayed the full
synthetic message through the intent link; nothing was posted. Clicking the
Facebook logo in the local browser copied the message before navigation. LinkedIn
and Facebook use explicit copy/paste guidance; only X is claimed as body prefill.

## Languages

The menu, illustrated guides, hosted games and replay/share controls support
English and Simplified Chinese. First visits follow the browser language; an
explicit selector choice takes precedence and persists on this origin. The game
control panel shares the same choice without restarting a round.
See [translation workflow and evidence](../../docs/multilingual.md).
