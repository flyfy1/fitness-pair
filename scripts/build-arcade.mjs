import {playableGames} from '../apps/arcade/game-catalog.js';
import {execFileSync} from 'node:child_process';
import {mkdir,cp,rm,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=(args)=>execFileSync(process.execPath,args,{cwd:root,stdio:'inherit'});
await rm(new URL('../dist/',import.meta.url),{recursive:true,force:true});
run(['node_modules/vite/bin/vite.js','build','apps/arcade','--outDir','../../dist/client','--emptyOutDir']);
const hosts=playableGames.map(game=>[game.id,game.directory]);
for(const [name,directory] of hosts){
  execFileSync('npm',['run','build'],{cwd:new URL(`../${directory}/`,import.meta.url),stdio:'inherit'});
  run(['node_modules/vite/bin/vite.js','build',directory,'--base',`/games/${name}/`,'--outDir',`${root}dist/client/games/${name}`,'--emptyOutDir']);
  // One shared copy keeps identical model/runtime bundles out of the deployment archive.
  if(name==='motion-quest')await cp(new URL(`../dist/client/games/${name}/runtime/`,import.meta.url),new URL('../dist/client/runtime/',import.meta.url),{recursive:true});
  await rm(new URL(`../dist/client/games/${name}/runtime/`,import.meta.url),{recursive:true,force:true});
}
// Keep previously shared standalone game URLs working with canonical assets.
for(const game of playableGames)for(const alias of game.aliases??[]){
  const target=new URL(`../dist/client/games/${alias}/`,import.meta.url);
  await mkdir(target,{recursive:true});
  await cp(new URL(`../dist/client/games/${game.id}/index.html`,import.meta.url),new URL('index.html',target));
}
await mkdir(new URL('../dist/server/',import.meta.url),{recursive:true});
await mkdir(new URL('../dist/.openai/',import.meta.url),{recursive:true});
await cp(new URL('../apps/arcade/game-catalog.js',import.meta.url),new URL('../dist/game-catalog.js',import.meta.url));
await cp(new URL('../apps/arcade/server/worker.js',import.meta.url),new URL('../dist/server/index.js',import.meta.url));
await cp(new URL('../.openai/hosting.json',import.meta.url),new URL('../dist/.openai/hosting.json',import.meta.url));
await writeFile(new URL('../dist/server/package.json',import.meta.url),'{"type":"module"}\n');
console.log(`Arcade, ${hosts.length} games, shared tracking assets, and GCP gateway built.`);
