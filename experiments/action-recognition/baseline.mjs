import { pathToFileURL } from 'node:url';
import { SquatRecognizer } from '@fitness-pair/action-squat';
import { squatSession } from '../../contracts/fixtures/squat-session.js';

export function baselineActions() {
  const frames = squatSession();
  const recognizer = new SquatRecognizer(); recognizer.reset(frames[0]);
  return frames.map(frame => recognizer.update(frame)).filter(Boolean);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify({ evidence: 'synthetic', note: 'No camera or model; artificial named-joint sequence.',
    completions: baselineActions().filter(frame => frame.completion) }, null, 2));
}
