import {DinoAudio} from '../../camera-start/src/audio.js';

/** Reuse the shared soundtrack/voice engine without loading Flight-only packs. */
export class DuelAudio extends DinoAudio {
  load(id, file) {
    if (/^(three|two|one|start|nice|keep-going|finish|zh:(nice|keep-going|finish))$/.test(id)) return super.load(id, file);
    return Promise.resolve();
  }
  dispose() { this.releaseLanguage(); super.dispose(); }
}
