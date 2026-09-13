# Encouragement resource pack

## Delivery boundary

Player: a solo Push-up Flight player. Job: hear occasional varied encouragement
without repetitive commentary. Risk: extra audio becomes intrusive or misses the
recorder. Loop: generate 18 short GPT voice resources + six original musical
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

## Current delivery status

Six original musical stingers have been generated and validated for unique hashes,
non-silent samples and bounded levels. The 18 speech scripts and GPT generation
requests are prepared, but no GPT speech resources have been generated yet:
this checkout has no configured OpenAI API credential. The live game has not
switched to this pack. Activation follows successful generation, audio review,
and browser recording verification; no deployment occurs from this preparation.
