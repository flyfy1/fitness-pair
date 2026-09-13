export async function syntheticCamera(page) {
  await page.addInitScript(() => {
    window.poseTest = { rise: 0, hand: 'down', missing: false, wristsMissing: false, delay: 0, crouch: false, noiseFrames: 0 };
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      const ctx = c.getContext('2d'); const stream = c.captureStream(30); window.testStream = stream;
      const timer = setInterval(() => {
        if (stream.getTracks().every(t => t.readyState === 'ended')) return clearInterval(timer);
        const g = ctx.createLinearGradient(0,0,640,480);g.addColorStop(0,'#597568');g.addColorStop(1,'#9cae94');ctx.fillStyle=g;ctx.fillRect(0,0,640,480);
        // Labeled synthetic torso silhouette for layout review, not a participant image.
        ctx.fillStyle='#d6d7be';ctx.beginPath();ctx.arc(320,82,30,0,Math.PI*2);ctx.fill();ctx.fillRect(270,125,100,120);
      }, 33);
      return stream;
    };
    window.Worker = class {
      constructor() { window.testWorker = this; }
      postMessage(data) {
        if (data.type === 'init') { setTimeout(() => this.onmessage?.({data:{type:'ready'}}),0);return; }
        data.bitmap.close(); const points=[]; const s=window.poseTest;
        if (!s.missing) {
          for (const [indices,x] of [[[11,23],.44],[[12,24],.56]]) indices.forEach((id,i)=>{points[id]={x,y:[.28,.52][i]-s.rise,visibility:.99};});
          if (s.crouch) {
            for (const i of [11,12]) { points[i].y += .19; points[i].x += .08; }
            for (const i of [23,24]) points[i].y += .10;
          }
          if (s.noiseFrames > 0) {
            const kind = s.noiseFrames-- % 3;
            if (kind === 0) points[23].visibility = .2;
            else if (kind === 1) points[11].y -= .16;
            else points.length = 0;
          }
          if (!s.wristsMissing) {
            points[15]={x:.43,y:(['up','both'].includes(s.hand)?.12:.59)-s.rise,visibility:.99};
            points[16]={x:.57,y:(['right','both'].includes(s.hand)?.12:.59)-s.rise,visibility:.99};
          }
        }
        setTimeout(()=>{if(!this.terminated)this.onmessage?.({data:{type:'pose',landmarks:points,time:data.time}});},s.delay);
      }
      terminate() { this.terminated=true; }
    };
  });
}
