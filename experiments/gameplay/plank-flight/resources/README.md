# Encouragement resource pack

## Delivery boundary

Player: a solo Push-up Flight player. Job: hear occasional varied encouragement
without repetitive commentary. Risk: extra audio becomes intrusive or misses the
recorder. Loop: resolve paired English/Chinese voice resources + six shared original musical
stingers → complete a random group of gates → play one local voice/music pair →
retain it in replay. Proof: decoded resource audio, deterministic cadence tests,
real browser playback and recording. No runtime API, microphone input, task system
or new dependency. Human enjoyment remains a playtesting question.

`encouragement.json` is the reviewed script and voice direction for 12 milestone
lines and six endings. Six styles pair built-in voices with distinct intonation
and an original short musical motif. The user-facing game discloses AI voices.

Generate with `scripts/generate-encouragement.py --generate` from this experiment.
Set `OPENAI_API_KEY` in the process environment, or pass `--env-file` to a local
ignored dotenv file containing it, or `--keychain-service` and optionally
`--keychain-account`. Never put the key in a command argument or tracked file.
The default command only lists the work; generation is explicit, resumable and
writes a hash/provenance receipt. It does not run as part of an ordinary build.

`--music-only` regenerates the six original music resources without an API key.

The script calls OpenAI's speech endpoint with a pinned GPT TTS model, input text,
a built-in voice and delivery instructions. FFmpeg normalizes speech levels;
Python synthesizes the six original stingers. Committed MP3/WAV resources live
under `public/audio/encouragement/`. Gameplay serves these files locally.
No model is asked to imitate a real person or assess exercise performance.

Reference: [OpenAI text-to-speech guide](https://developers.openai.com/api/docs/guides/text-to-speech).

## Resource and playback behavior

The 18 English encouragement clips and 22 Chinese clips were generated with the
pinned GPT model in the catalog. Four existing English countdown/start WAVs are
retained. There are 22 paired speech IDs and six shared music resources (50 files).
The manifest records request hashes, output hashes, model/voice, generation time
and duration. Six original musical stingers pair with the six speech styles.
Speech is normalized to -18 LUFS with a -2 dB true-peak target.

A random threshold of 2–5 completed gates starts the next milestone window.
At least 12 seconds of flight separates encouragement; if the cooldown is still
active, it waits for a later completed gate. Duplicate frame updates cannot
trigger a reward. Muting skips due encouragement without queuing it for unmute.
Milestone voices shuffle through 12 entries before reuse; six endings have their
own shuffle bag, retained across retries in the same page. Recording retains the
selected ending speech before the branded replay ending.

Use `--env-name` when an existing secret uses a different environment variable
name. Only the named variable is read; the secret is never written to a resource.

## Language variants

Stable clip IDs represent meaning and reward timing. Each `variants.en` / `variants.zh`
entry provides the matching text and audio path; styles and musical motifs are shared.
`voiceResource(id, language)` resolves text and audio together, with an English fallback
for unsupported languages. A translated variant never silently speaks an English line.
The `cues` group covers three, two, one and start; `clips` covers encouragement/endings.

Generate or resume one language at a time:

```sh
python3 scripts/generate-encouragement.py --generate --language en
python3 scripts/generate-encouragement.py --generate --language zh
```

Use the credential options above as needed. Matching request/output hashes reuse
existing files without a speech request. Generated receipts use `language/id` keys;
legacy English cue files set `generate: false`. Chinese countdown silence is trimmed
to fit one-second steps. Existing English files keep their original URLs.

`ui.zh.json` pairs the game's English source copy with Chinese. The language selector
updates native Flight UI, canvas labels and audio without restarting gameplay or
recording. It starts in English, then remembers only the user’s explicit language choice.
Only the selected speech language is loaded, alongside shared music and legacy effects.
Switching stops an active old-language voice and cancels its pending playback.
The arcade recorder/library and other games retain their current UI language; their
future integrations can reuse `packages/gameplay/locale.js` and this resource format.
