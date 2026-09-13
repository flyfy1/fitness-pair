// Generated moving imagery and landmark messages; no participant footage.
export async function movingCamera(page,{neverReady=false,controlled=false}={}){
 await page.addInitScript(({neverReady,controlled})=>{
  if(window===window.top)return;
  navigator.mediaDevices.getUserMedia=async options=>{
   if(options.audio!==false)throw new Error('Microphone must not be requested');
   if(controlled)await new Promise(resolve=>{window.allowCamera=resolve;});
   window.cameraRequests=(window.cameraRequests||0)+1;
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
   const ctx=canvas.getContext('2d'),stream=canvas.captureStream(24);window.testStream=stream;
   const begin=performance.now();
   const paint=()=>{
    ctx.fillStyle='#20b0cc';ctx.fillRect(0,0,640,480);
    ctx.fillStyle='#ff00ff';ctx.fillRect(70,150,20,20);
    ctx.fillStyle='#00ff00';ctx.fillRect(0,0,640,10);
    const x=240+90*Math.sin((performance.now()-begin)/550),y=100+25*Math.sin((performance.now()-begin)/350);
    ctx.fillStyle='#fa2030';ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.fill();
    ctx.fillRect(x-25,y+34,50,100);ctx.fillRect(x-60,y+45,120,20);
    ctx.fillRect(x-25,y+125,18,95);ctx.fillRect(x+7,y+125,18,95);
    ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText('SYNTHETIC MOVING PERSON · NO PARTICIPANT',15,455);
   };
   paint();const timer=setInterval(()=>{if(stream.getTracks().every(t=>t.readyState==='ended'))clearInterval(timer);else paint();},40);
   return stream;
  };
  window.Worker=class{
   constructor(){this.frame=0;window.testWorker=this;}
   postMessage(data){
    if(data.type==='init'){if(!neverReady){const ready=()=>this.onmessage({data:{type:'ready'}});if(controlled)window.readyModel=ready;else setTimeout(ready,0);};return;}
    data.bitmap.close();this.frame++;
    const playing=window.motionQuest?.getReplayState().phase==='playing';
    const playFrame=this.playFrame||0;if(playing)this.playFrame=playFrame+1;
    const down=controlled?!!window.testDown:playFrame>=5&&(playFrame-5)%24<12;
    const raiseHands=document.querySelector('.hands-start:not([hidden]) .hands-start-title')?.textContent.includes('Raise BOTH');
    const points=Array.from({length:33},()=>({x:.5,y:.3,visibility:1}));
    for(const ids of [[11,23,25,27],[12,24,26,28]]){
     points[ids[0]].y=down?.28:.2;points[ids[1]].y=down?.53:.45;
     points[ids[2]].y=.65;points[ids[2]].x=down?.68:.5;points[ids[3]].y=.9;
    }
    points[15].y=points[16].y=(window.testHandsUp??raiseHands)?.05:.3;
    setTimeout(()=>{if(!this.terminated)this.onmessage({data:{type:'pose',landmarks:window.testMissing?[]:points,time:data.time,inferenceMs:1}});},0);
   }
   terminate(){this.terminated=true;}
  };
 },{neverReady,controlled});
}
