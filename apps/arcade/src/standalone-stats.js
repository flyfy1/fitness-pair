import {games} from './games.js';
import {mountPlayStats} from './gameplay/play-stats.js';
if(window===window.top){
 const id=location.pathname.split('/')[2],game=games.find(g=>g.id===id||g.aliases?.includes(id));
 if(game){
  // Reuse the presentation adapter without creating another frame or camera owner.
  const host={contentWindow:window,contentDocument:document,addEventListener:(...args)=>window.addEventListener(...args),removeEventListener:(...args)=>window.removeEventListener(...args)};
  const runtime=game.createAdapter(host);mountPlayStats(game,runtime);
  const note=document.createElement('p');note.textContent='Anonymous play counts and active time are sent to this site. Camera images stay on your device.';note.className='play-statistics-note';document.body.append(note);
 }
}
