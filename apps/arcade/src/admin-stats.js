import {loginURL} from './account.js';
export async function renderGameStats(container){
 container.innerHTML=`<h1>Game statistics</h1><p>Players are deduplicated by account when logged in, otherwise by browser. Clearing browser storage or changing devices may count another player. Times and date filters use UTC. Active time excludes setup, pauses and hidden tabs. Interrupted sessions show the last received time; their end time is unknown.</p><form id="stats-filters"><label>From <input name="from" type="date" required></label><label>To <input name="to" type="date" required></label><label>Game <select name="game"><option value="">All games</option></select></label><label>Input <select name="source"><option value="">All inputs</option><option value="camera">Camera</option><option value="synthetic">Keyboard / demo</option><option value="replay">Replay</option><option value="unknown">Unknown</option></select></label><button>Refresh</button></form><p role="status"></p><div id="stats-summary" class="stats-table"></div><h2>Play sessions</h2><div id="stats-sessions" class="stats-table"></div><button id="stats-next" hidden>Next page</button>`;
 const {gameCatalog}=await import('../game-catalog.js');
 const form=container.querySelector('form'),status=container.querySelector('[role=status]'),next=container.querySelector('#stats-next');
 const day=value=>new Date(value).toISOString().slice(0,10);form.elements.from.value=day(Date.now()-6*86400000);form.elements.to.value=day(Date.now());
 for(const game of gameCatalog){const option=document.createElement('option');option.value=game.id;option.textContent=game.title;form.elements.game.append(option);}
 function table(target,headings,rows){target.replaceChildren();const table=document.createElement('table');const header=table.createTHead().insertRow();for(const text of headings){const th=document.createElement('th');th.scope='col';th.textContent=text;header.append(th);}const body=table.createTBody();for(const row of rows){const tr=body.insertRow();for(const value of row)tr.insertCell().textContent=String(value);}target.append(table);}
 const duration=ms=>(ms/1000).toFixed(1)+' s',time=value=>value==null?'—':new Date(value).toISOString().replace('T',' ').replace('.000Z',' UTC');
 let nextOffset=null;
 async function load(offset=0){status.textContent='Loading statistics…';next.disabled=true;
  const params=new URLSearchParams(new FormData(form));params.set('offset',offset);
  try{const response=await fetch('/api/admin/game-stats?'+params,{credentials:'same-origin'});const data=await response.json();
   if(response.status===401){status.replaceChildren();const link=document.createElement('a');link.href=loginURL('/admin/games');link.textContent='Log in to view game statistics';status.append(link);return;}
   if(!response.ok)throw Error(data.error||'Statistics unavailable.');
   table(container.querySelector('#stats-summary'),['Game','Players','Sessions','Active time'],data.summary.map(r=>[r.title,r.players,r.sessions,duration(r.activeMs)]));
   table(container.querySelector('#stats-sessions'),['Game','Player','Identity','Input','Started (UTC)','Ended (UTC)','Last update (UTC)','Active time','Status'],data.sessions.map(r=>[gameCatalog.find(g=>g.id===r.gameId)?.title||r.gameId,r.playerId.slice(0,12),r.identity,r.inputSource,time(r.startedAt),time(r.endedAt),time(r.updatedAt),duration(r.activeMs),r.status]));
   status.textContent=`${data.total} sessions. Showing ${data.total?offset+1:0}–${offset+data.sessions.length}.`;nextOffset=data.nextOffset;next.hidden=nextOffset===null;
  }catch(error){status.textContent=error.message;}finally{next.disabled=false;}
 }
 form.onsubmit=e=>{e.preventDefault();void load();};next.onclick=()=>void load(nextOffset);await load();
}
