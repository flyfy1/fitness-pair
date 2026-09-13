// One bundled voice source for countdowns and the default game cues.
const voices={
 'three.wav':new URL('../../experiments/gameplay/plank-flight/public/audio/three.wav',import.meta.url).href,
 'two.wav':new URL('../../experiments/gameplay/plank-flight/public/audio/two.wav',import.meta.url).href,
 'one.wav':new URL('../../experiments/gameplay/plank-flight/public/audio/one.wav',import.meta.url).href,
 'start.wav':new URL('../../experiments/gameplay/plank-flight/public/audio/start.wav',import.meta.url).href,
 'nice.wav':new URL('../../experiments/gameplay/plank-flight/public/audio/nice.wav',import.meta.url).href,
 'keep-going.wav':new URL('../../experiments/gameplay/plank-flight/public/audio/keep-going.wav',import.meta.url).href,
 'finish.wav':new URL('../../experiments/gameplay/plank-flight/public/audio/finish.wav',import.meta.url).href,
};
export const sharedVoiceURL=file=>voices[file]||null;
