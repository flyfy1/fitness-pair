# Hopmodo arcade

Owns the landing page, game selection, local clip library, gallery UI and optional GCP gateway. Existing games and recognizers retain their ownership.

Run `npm run build:arcade` at repository root, then `npm run preview:arcade` (port 5191). The build includes the current Motion Quest and Dino Run under `/games/`, without editing their sources. Root Sites deployment uses a Worker with static assets and optional GCP secrets.

Choose “Record my game” to arm one recording; it starts once the game is running (or Motion Quest’s camera/preview is ready). The choice is not persisted or reused for later rounds. The host composites the game's canvas and, only while already enabled in the game, its camera preview. Motion Quest AR composites the mirrored camera, mirrored landmark canvas, and transparent game canvas in their display order; Dino uses a camera inset. It never requests an additional camera stream. Clips stop at 60 seconds or 20 MiB, completion, exit, or backgrounding. IndexedDB stores local video blobs; localStorage is unsuitable for video sizes. Storage failures keep a downloadable in-memory copy. Deleting a local clip does not revoke an already shared clip.

Recordings include a permanent Hopmodo mark, name, game score, and the canonical public website address in a footer strip. Round completion adds a brief end card, automatically saves the clip, and focuses the replay section.

“Share with a friend” passes the actual video File to the operating system share dialog, only from a player click and only when file sharing is supported. Otherwise, the player can download and attach it manually. “Copy game link” sends friends to the game, not to the private local clip. Cancelling sharing leaves the recording in place.

Cloud sharing is disabled until GCP configuration exists. The gallery shows an honest setup state, never fabricated players. See `server/README.md`. The separate teammate sharing experiment remains untouched.

## Add a game

Add a registry entry in `src/games.js`, add its static build to `scripts/build-arcade.mjs`, and implement an explicit adapter in `src/recording.js` if the game supports recording. No generic event bus or new recognition semantics are introduced.

## Evidence

Automated synthetic browser checks cover navigation, concept controls, keyboard game entry, recording consent and local clip persistence. Server tests cover disabled configuration, consent, authorization, size and format checks. These checks do not establish human movement accuracy, exercise benefits or enjoyment. GCP persistence needs live verification after the owner supplies a project, bucket and runtime identity.

## Identity

The public-facing platform is Hopmodo. Repository/package names, the Sites app title and URL, game names, and the existing IndexedDB database stay unchanged. `src/brand.js` holds the public brand and canonical URL; update it if the public address changes.

## Browser references

- [Web Share file support and click activation](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)
- [Canvas capture streams](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)
