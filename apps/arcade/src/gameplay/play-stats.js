// Playback facts only: no camera, movement samples, account details or URLs.
export function createPlayTracker({gameId, playerId, send, now=Date.now, clock=()=>performance.now(), uuid=()=>crypto.randomUUID()}) {
 let current=null, round=null, phase=null, visible=true, tick=clock(), activeMs=0;
 const finished=new Set();
 function account(){const time=clock();if(current&&phase==='playing'&&visible)activeMs+=Math.max(0,Math.min(time-tick,2000));tick=time;}
 function flush(endReason=null){if(!current)return;account();send({...current,sequence:++current.sequence,activeMs:Math.round(activeMs),updatedAt:now(),endReason});}
 function finish(reason){if(!current)return;flush(reason);finished.add(round);current=null;phase=null;activeMs=0;}
 return {
  observe(frame,isVisible=true){
   account();visible=isVisible;
   if(current&&(!frame||frame.round!==round||['idle','setup'].includes(frame.phase)))finish(frame?.round!==round?'restarted':'stopped');
   if(frame?.phase==='playing'&&!current&&!finished.has(frame.round)){
    round=frame.round;activeMs=0;current={version:1,id:uuid(),gameId,playerId,startedAt:now(),inputSource:frame.source?.kind||'unknown',sequence:0};phase='playing';flush();
   }
   phase=frame?.phase||null;
   if(current&&phase==='complete')finish('completed');
  },
  visibility(value){account();visible=value;flush();},
  flush,
  finish,
 };
}

let fallbackPlayer;
export function mountPlayStats(game,runtime,{doc=document,win=window}={}) {
 let playerId;try{playerId=win.localStorage.getItem('hopmodo.player');if(!/^[0-9a-f-]{36}$/.test(playerId||'')){playerId=crypto.randomUUID();win.localStorage.setItem('hopmodo.player',playerId);}}catch{playerId=fallbackPlayer??=crypto.randomUUID();}
 const pending=new Map();let sending=false,disposed=false;
 async function drain(){
  if(sending)return;sending=true;
  try{for(const [id,body] of pending){
   const response=await fetch('/api/play-sessions',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true,signal:AbortSignal.timeout(8000)});
   if(!response.ok)break;if(pending.get(id)===body)pending.delete(id);
  }}catch{/* Retry cumulative snapshots on the next heartbeat. */}finally{sending=false;}
 }
 const tracker=createPlayTracker({gameId:game.id,playerId,send(body){pending.set(body.id,body);if(pending.size>20)pending.delete(pending.keys().next().value);void drain();}});
 const observe=()=>tracker.observe(runtime.readFrame(),!doc.hidden);
 const change=()=>{tracker.visibility(!doc.hidden);observe();};
 const unsubscribe=runtime.subscribe(observe),poll=setInterval(observe,250),heartbeat=setInterval(()=>{tracker.flush();void drain();},15000);
 doc.addEventListener('visibilitychange',change);observe();
 function dispose(reason='left'){
  if(disposed)return;disposed=true;tracker.finish(reason);clearInterval(poll);clearInterval(heartbeat);unsubscribe();doc.removeEventListener('visibilitychange',change);win.removeEventListener('pagehide',leave);
  // Cumulative sequence numbers make overlapping keepalive deliveries idempotent.
  for(const body of pending.values())navigator.sendBeacon?.('/api/play-sessions',new Blob([JSON.stringify(body)],{type:'application/json'}));
 }
 function leave(){dispose('left');}win.addEventListener('pagehide',leave);
 return {dispose};
}
