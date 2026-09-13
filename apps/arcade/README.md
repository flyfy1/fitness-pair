# Fitness Pair arcade

Owns the landing page, game selection, local clip library, gallery UI and optional GCP gateway. Existing games and recognizers retain their ownership.

Run `npm run build:arcade` at repository root, then `npm run preview:arcade` (port 5191). The build includes the current Motion Quest and Dino Run under `/games/`, without editing their sources. Root Sites deployment uses a Worker with static assets and optional GCP secrets.

Recording requires a separate player click. The host composites the game's canvas and, only while already enabled in the game, its camera preview. It never requests an additional camera stream. Clips stop at 60 seconds or 20 MiB, completion, exit, or backgrounding. IndexedDB stores local video blobs; localStorage is unsuitable for video sizes. Storage failures keep a downloadable in-memory copy. Deleting a local clip does not revoke an already shared clip.

Cloud sharing is disabled until GCP configuration exists. The gallery shows an honest setup state, never fabricated players. See `server/README.md`. The separate teammate sharing experiment remains untouched.

## Add a game

Add a registry entry in `src/games.js`, add its static build to `scripts/build-arcade.mjs`, and implement an explicit adapter in `src/recording.js` if the game supports recording. No generic event bus or new recognition semantics are introduced.

## Evidence

Automated synthetic browser checks cover navigation, concept controls, keyboard game entry, recording consent and local clip persistence. Server tests cover disabled configuration, consent, authorization, size and format checks. These checks do not establish human movement accuracy, exercise benefits or enjoyment. GCP persistence needs live verification after the owner supplies a project, bucket and runtime identity.
