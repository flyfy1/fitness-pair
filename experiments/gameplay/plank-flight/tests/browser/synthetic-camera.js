export async function syntheticCamera(page){
  await page.addInitScript(()=>{
    window.testHeadX=.35;window.testHeadY=.3;window.testMissing=false;window.testHeadMissing=false;window.testDelay=0;
    navigator.mediaDevices.getUserMedia=async()=>{
      const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');
      function draw(){
        const x=window.testHeadX*640,y=window.testHeadY*480;
        ctx.fillStyle='#52675f';ctx.fillRect(0,0,640,480);ctx.strokeStyle='#e8c8ac';ctx.lineWidth=24;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(x-60,y+90);ctx.lineTo(x+60,y+90);ctx.stroke();
        ctx.fillStyle='#f5d3b0';ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.fill();
      }draw();const stream=c.captureStream(30);window.testStream=stream;
      const timer=setInterval(()=>{if(stream.getTracks().every(t=>t.readyState==='ended'))clearInterval(timer);else draw();},33);return stream;
    };
    window.Worker=class{
      constructor(){window.testWorker=this;}
      postMessage(data){
        if(data.type==='init'){setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),0);return;}
        data.bitmap.close();const p=[];
        if(!window.testMissing){
          // Deliberately only one shoulder and a nose: no hips, wrists, knees or ankles.
          p[11]={x:window.testHeadX+.1,y:Math.min(.95,window.testHeadY+.18),visibility:.99};
          if(!window.testHeadMissing)p[0]={x:window.testHeadX,y:window.testHeadY,visibility:.99};
        }
        setTimeout(()=>{if(!this.terminated)this.onmessage?.({data:{type:'pose',landmarks:p,time:data.time}});},window.testDelay);
      }
      terminate(){this.terminated=true;}
    };
  });
}
