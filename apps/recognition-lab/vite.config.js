import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
let revision = 'unknown';
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); try { execFileSync('git', ['diff', '--quiet', 'HEAD'], { stdio: 'ignore' }); } catch { revision += '-dirty'; } } catch { /* Source archives may not contain Git metadata. */ }
export default defineConfig({ define: { __LAB_REVISION__: JSON.stringify(revision) } });
