import {execFileSync} from 'node:child_process';
import {mkdir,cp,rm,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=(args)=>execFileSync(process.execPath,args,{cwd:root,stdio:'inherit'});
await rm(new URL('../dist/',import.meta.url),{recursive:true,force:true});
run(['node_modules/vite/bin/vite.js','build','apps/arcade','--outDir','../../dist/client','--emptyOutDir']);
for(const name of ['motion-quest','dino-run']){
  // Preserve each game's standalone build/preview workflow as well as its arcade mount.
  execFileSync('npm',['run','build','--workspace',name==='motion-quest'?'@fitness-pair/motion-quest':name],{cwd:root,stdio:'inherit'});
  run(['node_modules/vite/bin/vite.js','build',`apps/${name}`,'--base',`/games/${name}/`,'--outDir',`../../dist/client/games/${name}`,'--emptyOutDir']);
}
await mkdir(new URL('../dist/server/',import.meta.url),{recursive:true});
await mkdir(new URL('../dist/.openai/',import.meta.url),{recursive:true});
await cp(new URL('../apps/arcade/server/worker.js',import.meta.url),new URL('../dist/server/index.js',import.meta.url));
await cp(new URL('../.openai/hosting.json',import.meta.url),new URL('../dist/.openai/hosting.json',import.meta.url));
await writeFile(new URL('../dist/server/package.json',import.meta.url),'{"type":"module"}\n');
console.log('Arcade, two games, and GCP gateway built.');
