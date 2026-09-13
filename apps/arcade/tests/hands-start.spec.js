import {test,expect} from '@playwright/test';
async function camera(page){await page.addInitScript(()=>{
 window.startPose={hands:'down',rise:0,missing:false};
 navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const x=c.getContext('2d');x.fillStyle='#567468';x.fillRect(0,0,640,480);window.startStream=c.captureStream(30);const timer=setInterval(()=>{if(window.startStream.getTracks().every(t=>t.readyState==='ended'))clearInterval(timer);else{x.fillStyle='#567468';x.fillRect(0,0,640,480);}},30);return window.startStream;};
 window.Worker=class{constructor(){window.startWorker=this;}postMessage(m){if(m.type==='init'){setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),0);return;}m.bitmap.close();const a=window.startPose,p=Array.from({length:33},()=>({x:.5,y:.2-a.rise,visibility:1}));
 for(const [side,ids] of [[-1,[11,13,15,23,25,27]],[1,[12,14,16,24,26,28]]]){
  const x=.5+side*.065;for(const [i,y] of [[0,.28],[1,.42],[2,.64],[3,.52],[4,.72],[5,.91]])p[ids[i]]={x:x+(i===1||i===2?side*.055:0),y:y-a.rise,visibility:1};
  if(a.hands==='both'||a.hands==='left'&&side===-1)p[ids[2]].y=.08-a.rise;
 }p[0]={x:.5,y:.18-a.rise,visibility:1};p[7]={x:.47,y:.19-a.rise,visibility:1};p[8]={x:.53,y:.19-a.rise,visibility:1};
 setTimeout(()=>{if(!this.terminated)this.onmessage?.({data:{type:'pose',landmarks:a.missing?[]:p,time:m.time,inferenceMs:1}});},0);
 }terminate(){this.terminated=true;}};
});}
const games=[...['breakout','invaders','stack','knife','bubble','fruit'].map(id=>({id:'ar-'+id,start:'#start',stop:'#stop'})),{id:'motion-quest',start:'#start',stop:'#stop'},{id:'camera-start',start:'#primary',stop:'#stop'},{id:'plank-flight',start:'#start',stop:'#stop'},{id:'dino-run',start:'#start',stop:'#stop-camera'},{id:'dino-ar',start:'#primary',stop:'#stop'}];
for(const config of games)test(`${config.id}: camera play waits for both hands and release`,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await camera(page);await page.goto('/play/'+config.id);const game=page.frameLocator('#game-frame');
 const pose=value=>game.locator('body').evaluate((_,value)=>Object.assign(window.startPose,value),value);
 if(config.id==='ar-invaders')await game.locator('#tutorial-skip').click();
 if(config.id==='dino-ar'){await game.locator('#control-mode').selectOption('camera');}
 await game.locator(config.start).click();expect(errors).toEqual([]);
 if(config.id==='dino-run'){await page.waitForTimeout(2800);await pose({rise:.1});await page.waitForTimeout(600);await pose({rise:0});}
 await expect(game.locator('.hands-start')).toBeVisible({timeout:12000});await page.waitForTimeout(3500);await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
 await pose({hands:'left'});await page.waitForTimeout(1150);await expect(game.locator('.hands-start-title')).toContainText('Raise BOTH');
 await pose({hands:'both'});await expect(game.locator('.hands-start-title')).toContainText('lower both');await page.waitForTimeout(600);await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
 await page.screenshot({path:info.outputPath('hands-recognized.png')});await pose({hands:'down'});await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording',{timeout:12000});expect(errors).toEqual([]);
 await game.getByRole('link',{name:'Back to the Hopmodo arcade'}).click();await expect(page).toHaveURL('/#arcade');
});
