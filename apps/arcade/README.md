# Hopmodo arcade

Owns the landing page, game selection, local clip library, gallery UI and optional GCP gateway. Existing games and recognizers retain their ownership.

Run `npm run build:arcade` at repository root, then `npm run preview:arcade` (port 5191). The build includes Motion Quest, Dino Run, Dino AR, Push-up Flight and Ready to Move (guided camera Dino) under `/games/`. Each standalone game build remains available. All mounted games resolve tracking assets through the same-origin shared `/runtime/` directory. Root Sites deployment uses a Worker with static assets and optional GCP secrets.

Recording starts automatically when a game is running. Motion Quest starts after standing calibration reaches gameplay readiness, or immediately on entering its synthetic preview. Permission, model loading and initial calibration are excluded. A visible notice explains that the game, enabled camera and available game sound are recorded on this device; microphone audio is never requested. Each finished round produces a replay without another recording choice. Explicit round identifiers distinguish immediate restarts; an earlier end card finishes independently while the next round records. Backgrounding saves the current segment, and returning resumes automatic capture. The host composites the game's canvas and the camera preview already enabled in the game; it never requests an additional camera stream. Motion Quest retains the full charge, projectile, impact and victory animation before its branded ending. Its camera stops at the final repetition; the recorder freezes the last camera frame while the game effects finish. Motion Quest AR combines mirrored camera and landmarks behind the transparent game layer; Dino uses a camera inset. Finished clips include a three-second Hopmodo invitation with the platform description and full website address.

The old 60-second recording cutoff is removed. Recording runs until completion, camera loss, exit, or backgrounding, with a 100 MiB file safety limit and a 150 MiB local library limit. Reaching the file limit saves the portion captured so far and reports that limit. IndexedDB stores local video blobs; localStorage is unsuitable for video sizes. Storage failures retain every downloadable in-memory copy on the play page until explicitly deleted or the page is closed. Page exit cannot guarantee asynchronous persistence; finish the round before closing the tab. Deleting a local clip does not revoke an already shared clip. The gallery gateway accepts clips up to 60 seconds / 20 MiB. “Make short share copy” keeps up to the final 55 seconds of gameplay and appends a three-second invitation, re-encoding entirely on this device. The full replay remains saved. Preparation takes up to a minute, can be cancelled, and stops if the tab is hidden. Preview the new copy before explicitly publishing it; creating a copy never uploads it. Full replays can also be downloaded or passed to native file sharing.

Recordings include a permanent Hopmodo mark, name, game score, and the canonical public website address in a footer strip. Round completion adds a brief end card, automatically saves the clip, and focuses the replay section.

“Share with a friend” passes the actual video File to the operating system share dialog, only from a player click and only when file sharing is supported. Otherwise, the player can download and attach it manually. “Copy game link” sends friends to the game, not to the private local clip. Cancelling sharing leaves the recording in place.

MP4 is preferred and confirmed from actual encoded bytes. Browsers without an available MP4 encoder save clearly labeled WebM files; files are never renamed to claim MP4. See [recording evidence and browser limits](RECORDING.md).

Cloud sharing is enabled on `fitness.integ.life` using the VM identity and the existing private upload code. GPT Sites remains separately configured with sharing disabled. The bucket setting alone does not enable uploads. The gallery shows an honest setup state, never fabricated players. See `server/README.md`. The separate teammate sharing experiment remains untouched.

## Add a game

Add a registry entry in `src/games.js`, add its static build to `scripts/build-arcade.mjs`, and implement an explicit adapter in `src/recording.js` if the game supports recording. No generic event bus or new recognition semantics are introduced.

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

Dino AR and Push-up Flight retain their camera and keyboard/pointer preview modes. Ready to Move uses its guided standing/range/countdown flow. Their cards label experimental controls. All five game adapters use existing read-only game state to detect start, round identity, and completion. Dino AR's already-projected skeleton is not mirrored twice. Ready to Move composites its smaller game canvas into the full camera viewport using DOM rectangles. Push-up Flight preserves its crash sequence using a frozen camera frame when the game has already stopped its camera. No recognition contract changes were needed.

Motion Quest is the primary recording reference. Its `/play/motion-quest` route presents the unchanged native game interface in a full-window iframe, without landing-page navigation or a fixed-height arcade card around it. Replay tools follow the game and receive focus at completion. The native MQ home mark returns to the arcade. Full-window desktop/mobile layout and the complete synthetic five-repetition replay flow are tested.

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
