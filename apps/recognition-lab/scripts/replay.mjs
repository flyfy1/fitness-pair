import { readFile, stat } from 'node:fs/promises';
import { MAX_BYTES, replaySession } from '../src/session.js';
try {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: npm run replay --workspace recognition-lab -- data/case.json');
  if ((await stat(path)).size > MAX_BYTES) throw new Error('Recording exceeds 32 MiB');
  const { report } = replaySession(JSON.parse(await readFile(path, 'utf8')));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
} catch (error) { console.error(error.message); process.exitCode = 2; }
