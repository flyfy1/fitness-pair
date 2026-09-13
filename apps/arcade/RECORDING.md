# Recording and export evidence

## Format policy

Automatic capture tries H.264 MP4 (explicit profile, compatibility alias, then
container default) before VP8/VP9 WebM. A synchronous constructor/start failure
tries the next candidate. An asynchronous encoder failure reports an unavailable
replay; it cannot reconstruct frames already lost by the browser.

The actual recorder/chunk MIME and container signature must agree before saving.
MP4 downloads contain `ftyp`; WebM downloads contain the EBML signature and retain
`.webm`. Cards show the format, with a clear WebM fallback notice. Capability
checks are per device, not inferred from browser names or MP4 playback support.

## Browser codec audit — 2026-09-13

Synthetic animated canvas, 1280 × 800, 24 fps, requested 2.2 Mbps, no camera or audio.
Each available format was actually encoded and decoded, not just feature-detected.

| Browser | Evidence | MP4 | WebM |
| --- | --- | --- | --- |
| Chrome 152.0.7977.83, macOS | Local real browser | H.264, matching bytes, 1280 × 800 decode | VP8 and VP9 decode |
| Brave 150.0.7871.128, macOS | Local real browser | H.264, matching bytes, 1280 × 800 decode | VP8 and VP9 decode |
| Safari | Vendor documentation only | H.264 MP4 supported | Added in Safari 18.4 |
| Firefox | Vendor issue tracker only; not installed | MP4 recording issue remains open | Runtime WebM fallback retained |
| Edge, mobile devices | Not locally tested | Must pass device feature detection | Must pass device feature detection |

Chrome and Brave changed an `avc1.424028` request to `avc1.420020` in the actual
output. Requested codec strings are therefore not proof of the emitted profile.
A standalone codec check is not a human movement trial or proof of every browser's
game/camera compatibility.

Native MP4 works on the tested target desktops. No FFmpeg dependency or remote
conversion is justified for these browsers. A browser without an MP4 encoder
saves a clearly labeled WebM; universal MP4 export is not claimed.

## Sources

- [Chromium MP4 MediaRecorder feature](https://chromestatus.com/feature/5163469011943424)
- [WebKit MediaRecorder formats](https://webkit.org/blog/11353/mediarecorder-api/)
- [WebKit Safari 18.4 media changes](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
- [Mozilla MP4 recording issue](https://bugzilla.mozilla.org/show_bug.cgi?id=1631143)
- [MediaRecorder capability checks can still fail for lack of resources](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)
- [Actual recorder MIME](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/mimeType)

## Camera composition checkpoint

Motion Quest recording waits for the recognizer’s first calibrated `ready`
phase and decoded live camera frames. A synchronous presentation lifecycle event
starts recording before the first squat; permission, model loading and standing
calibration are excluded. It does not record a canvas-only fallback while
camera initialization is pending. Preview and camera rounds retain separate IDs
and source labels. Camera disappearance or an eight-second frame stall ends a
partial camera replay labeled “Camera interrupted”; it cannot silently continue
as synthetic gameplay. A successful round still saves after the game stops its
owned camera and model worker.

The exported image combines the centered, mirrored camera crop, skeleton layer,
guardian/magic canvas, live health/action/charge/time HUD, score, logo and website.
HUD values are read from the game; no game rules or native page styles are changed.

The moving-camera browser fixture generates a labeled animated person silhouette,
uses the real camera-start path with a mocked pose worker and the real squat
recognizer, and completes five repetitions. Decoded MP4 frames at multiple times
check movement, camera pixels, guardian, HUD and branding. This is synthetic
software evidence, not real participant footage or recognition accuracy evidence.
The separate first-load model timeout is owned by the game-loading task.

## Full replays and website share copies

Local capture retains the full round up to the 100 MiB safety limit. Website
publication remains an access-code-gated pilot with a 60-second / 20-MiB cap.
“Make short share copy” re-encodes up to the final 55 seconds of gameplay and adds
an independent three-second branded ending at 1.8 Mbps. Two seconds of headroom
accommodate recorder timing; actual produced size and elapsed capture duration
are checked before the copy can be offered for publication. Existing end cards
are excluded when known. The original and its ID are retained; the copy gets a
new local ID and its own management key only upon publication.

This native browser conversion is justified by the full-round/gateway mismatch.
It needs no app dependency, worker service or video upload. A supported MP4
encoder produces MP4; otherwise the same explicit WebM fallback applies. Copying
a video does not fix an unavailable MP4 encoder. Preparation takes playback time
(up to about a minute), can be cancelled, stops on page exit/backgrounding, and
has bounded read, playback-stall and total-operation timeouts. Capture tracks,
timers and object URLs are released on success and failure.

The new preview is focused after generation. It remains local until a separate
publication form is submitted with the upload code and explicit consent. Native
file sharing sends the file to the operating system only on a player click.
Website publication retains the management key locally before uploading, then
returns `/clips/:id`; the site streams private media with byte-range support.

### Validation

- 57 unit/contract tests, including gateway/local size-duration boundary agreement.
- Six gateway tests, including mocked GCP storage, authorization, retries, ranges
  and revocation. These use test-generated credentials and no real GCP service.
- Synthetic browser tests cover local generation, preview, cancellation,
  background cleanup, explicit publication and returned-byte playback through a
  simulated website API. The recording tests cover all five game adapters.
- A real 70-second synthetic MP4 source produced a decoded MP4 share copy between
  56 and 60 seconds, below 20 MiB, with the branded ending; the original survived
  reload. This was a real browser encode/decode test, not a mocked recorder.

The optional long-media check uses `HOPMODO_LONG_CLIP=/absolute/path/to/synthetic.mp4`
with `npx playwright test -c apps/arcade/playwright.config.js share-copy.spec.js`.
It is skipped when the fixture is absent. To reproduce without participant data,
run `recording-camera.spec.js`, use its `decoded-camera-0.png` output as a looped
FFmpeg input (`-loop 1 -i <synthetic-png> -t 70 -r 12 -c:v libx264 -pix_fmt yuv420p
-movflags +faststart <ignored-output.mp4>`), and pass that file. FFmpeg is used
only to generate this optional test fixture; it is not a product dependency or
part of the shipping conversion path.

### Live GCP status

The bucket name is configured, but no usable private key/runtime credential was
supplied. The supplied setup ZIP contained no usable credential. No credential
stores or organization policy were changed. Live upload, actual GCP playback,
object lifecycle and revocation remain unverified. Passing mocks and browser
codec checks do not establish a working live cloud share link.

## Gameplay boundaries and game sound

Motion Quest exposes `setup`, `playing`, `ending`, `complete` and `idle` presentation
phases with its round ID. The recorder uses these explicit signals rather than
button visibility or score text. Missing tracking after gameplay begins stays in
the same recording without scoring. Cancellation ends a partial clip; new rounds
receive new recordings. At the fifth repetition camera and worker stop immediately,
but the last camera frame remains behind the live game canvas for the complete
1.8-second spell, impact and victory sequence. Only then does the three-second
Hopmodo ending begin.

The recorder clones the synthesized game audio track, never a microphone track.
The clone is muted during the branded ending so an immediate new round cannot
leak sound into the previous replay. Stopping recording releases only its owned
tracks. Audio streams request H.264/AAC MP4 before VP8/VP9/Opus WebM; silent
streams retain their previous format candidates. Short share copies route the
original video’s decoded game sound through a local Web Audio destination.
Cancellation, backgrounding, exit and completion close that destination/context
and retain the original. Upload still requires the separate explicit share gate.

### Synthetic boundary/audio verification — 2026-09-13

`recording-boundaries.spec.js` uses a moving generated camera canvas, controlled
mock Worker landmarks, and the actual squat recognizer. It asserts zero recorder
starts through permission, model initialization and standing calibration; initial
ready has zero charge. Missing tracking after start does not score or start a new
clip. Five real recognizer completion events produce exactly one replay.

Decoded MP4 frames contain the first charge, final projectile (160 ms after the
completion event), impact (720 ms), victory fade (1400 ms), and branded ending.
The camera track and Worker are already stopped for all three final-effect
samples. Pixel checks distinguish the bright spell and intentionally translucent
victory text from the generated camera background. Visual inspection confirms
these effects, the native game aspect, mirrored crop, HUD and permanent footer.

Decoding the exported audio finds nonzero charge, release, impact and victory
samples. Actual full-replay and short-copy files were independently probed as
1280 × 800 H.264 video plus AAC audio. The short copy also passes decoded audio
energy checks, and its completion leaves the original game sound track live.
No participant data or microphone is used, and no video upload occurs. These are
software/codec checks, not evidence of human movement-recognition accuracy.

The forced WebM fallback was independently probed as 1280 × 800 VP8 video with
Opus audio. The browser test verifies its EBML signature, `.webm` download and
playback. Silent legacy clips keep working without an added audio track.
