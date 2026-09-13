export async function camera(page){await page.addInitScript(()=>{
 window.startPose={hands:'down',rise:0,missing:false};
 navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const x=c.getContext('2d');x.fillStyle='#567468';x.fillRect(0,0,640,480);window.startStream=c.captureStream(30);const timer=setInterval(()=>{if(window.startStream.getTracks().every(t=>t.readyState==='ended'))clearInterval(timer);else{x.fillStyle='#567468';x.fillRect(0,0,640,480);}},30);return window.startStream;};
 window.Worker=class{constructor(){window.startWorker=this;}postMessage(m){if(m.type==='init'){setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),0);return;}m.bitmap.close();const a=window.startPose,p=Array.from({length:33},()=>({x:.5,y:.2-a.rise,visibility:1}));
 for(const [side,ids] of [[-1,[11,13,15,23,25,27]],[1,[12,14,16,24,26,28]]]){
  const x=.5+side*.065;for(const [i,y] of [[0,.28],[1,.42],[2,.64],[3,.52],[4,.72],[5,.91]])p[ids[i]]={x:x+(i===1||i===2?side*.055:0),y:y-a.rise,visibility:1};
  if(a.squat){p[ids[0]].y=.38;p[ids[3]].y=.64;p[ids[4]].x=x+.14;}
  if(a.hands==='both'||a.hands==='left'&&side===-1)p[ids[2]].y=.08-a.rise;
  if(a.hideHands)p[ids[2]].visibility=0;
 }p[0]={x:.5,y:.18-a.rise,visibility:1};p[7]={x:.47,y:.19-a.rise,visibility:1};p[8]={x:.53,y:.19-a.rise,visibility:1};
 if(a.hideRightShoulder)p[12].visibility=0;
 setTimeout(()=>{if(!this.terminated)this.onmessage?.({data:{type:'pose',landmarks:a.missing?[]:p,time:m.time,inferenceMs:1}});},0);
 }terminate(){this.terminated=true;}};
});}
