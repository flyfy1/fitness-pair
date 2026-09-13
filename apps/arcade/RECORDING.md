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

Motion Quest recording waits for a ready live camera track and decoded camera
frames after model readiness. It does not record a canvas-only fallback while
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
