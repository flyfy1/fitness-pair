import {test,expect} from '@playwright/test';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${new URL('../../../experiments/gameplay/plank-flight/public/audio/three.wav',import.meta.url).pathname}`]}});

async function syntheticMicrophone(page, mode='normal'){
 await page.addInitScript(mode=>{
  if(window!==window.top)return;
  const NativeContext=window.AudioContext;
  window.AudioContext=class extends NativeContext{
   createBufferSource(){const source=super.createBufferSource(),connect=source.connect.bind(source);source.connect=target=>{const analyser=this.createAnalyser();connect(analyser);analyser.connect(target);window.voicePreviewAnalyser=analyser;return target;};return source;}
  };
  window.microphoneCalls=[];window.syntheticMicrophones=[];
  navigator.mediaDevices.getUserMedia=async constraints=>{
   window.microphoneCalls.push(constraints);
   if(mode==='denied')throw new DOMException('Denied','NotAllowedError');
   if(mode==='pending')await new Promise(resolve=>{window.allowSyntheticMicrophone=resolve;});
   const context=new AudioContext();await context.resume();
   const oscillator=context.createOscillator(),gain=context.createGain(),output=context.createMediaStreamDestination();
   oscillator.frequency.value=660;gain.gain.value=.18;oscillator.connect(gain).connect(output);oscillator.start();
   window.syntheticMicrophones.push({stream:output.stream,context});return output.stream;
  };
 },mode);
}
const energy=async locator=>locator.evaluate(async media=>{
 const context=new AudioContext();try{const buffer=await context.decodeAudioData(await(await fetch(media.src||media.href)).arrayBuffer());const data=buffer.getChannelData(0);let sum=0;for(const value of data)sum+=value*value;return Math.sqrt(sum/data.length);}catch{return 0;}finally{await context.close();}
});

test('conversation is a separate local track; selected export includes it and original does not',async({page})=>{
 await syntheticMicrophone(page);const uploads=[];page.on('request',r=>{if(r.method()==='PUT')uploads.push(r.url());});
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');
 await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 expect(await page.evaluate(()=>window.microphoneCalls.length)).toBe(0);
 await page.waitForTimeout(700);
 await game.getByRole('button',{name:'Record conversation',exact:true}).click();
 await expect(game.locator('.hopmodo-conversation')).toHaveAttribute('data-state','recording');
 await page.waitForTimeout(1100);
 await game.getByRole('button',{name:'Stop conversation recording'}).click();
 expect(await page.evaluate(()=>window.syntheticMicrophones[0].stream.getAudioTracks()[0].readyState)).toBe('ended');
 await page.waitForTimeout(500);
 await game.getByRole('button',{name:'Record conversation',exact:true}).click();
 await expect(page.locator('#record-status')).toContainText('Saved on this device',{timeout:18000});
 expect(await page.evaluate(()=>window.syntheticMicrophones.every(x=>x.stream.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
 await page.goto('/library');await page.reload();
 const card=page.locator('.clip-card').first(),video=card.locator('video');
 await expect(card.getByLabel('Include conversation in video')).not.toBeChecked();
 expect(await energy(video)).toBe(0);
 expect(await energy(card.locator('[data-conversation-download]'))).toBeGreaterThan(.01);
 await expect(card.getByLabel('Listen to recorded voice in replay')).toBeChecked();
 await video.evaluate(video=>video.play());
 await expect(card).toHaveAttribute('data-voice-playing','true');
 await expect.poll(()=>page.evaluate(()=>{const a=window.voicePreviewAnalyser;if(!a)return 0;const d=new Float32Array(a.fftSize);a.getFloatTimeDomainData(d);return Math.sqrt(d.reduce((sum,x)=>sum+x*x,0)/d.length);})).toBeGreaterThan(.01);
 await video.evaluate(video=>video.pause());
 await expect(card).toHaveAttribute('data-voice-playing','false');
 const originalURL=await video.getAttribute('src');
 await card.getByLabel('Include conversation in video').check();
 await expect(card.getByText('With conversation. Preview this version before sharing.')).toBeVisible({timeout:25000});
 expect(await energy(video)).toBeGreaterThan(.01);
 const leading=await video.evaluate(async video=>{const context=new AudioContext();try{const buffer=await context.decodeAudioData(await(await fetch(video.src)).arrayBuffer());const samples=buffer.getChannelData(0).subarray(0,Math.floor(buffer.sampleRate*.3));return Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);}finally{await context.close();}});
 expect(leading).toBeLessThan(.001); // Mic was enabled after the game started.
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});Object.defineProperty(navigator,'share',{value:async data=>{window.sharedConversationFile=data.files[0];},configurable:true});});
 await card.getByRole('button',{name:'Share with a friend'}).click();
 expect(await page.evaluate(()=>window.sharedConversationFile.name)).toContain('-with-conversation.mp4');
 await expect(card.locator('.clip-actions [download]')).toHaveAttribute('download',/with-conversation\.mp4$/);
 await card.getByLabel('Include conversation in video').uncheck();
 await expect(video).toHaveAttribute('src',originalURL);expect(await energy(video)).toBe(0);
 expect(uploads).toEqual([]);
 await page.reload();await expect(page.locator('.clip-card')).toHaveCount(2);
 await expect(page.getByLabel('Include conversation in video')).not.toBeChecked();
});

test('permission denial leaves gameplay usable and cancellation releases late microphone tracks',async({page})=>{
 await syntheticMicrophone(page,'pending');await page.goto('/play/plank-flight');const game=page.frameLocator('#game-frame');
 await game.getByRole('button',{name:'Record conversation',exact:true}).click();
 await expect(game.getByRole('button',{name:'Cancel microphone request'})).toBeVisible();
 await game.getByRole('button',{name:'Cancel microphone request'}).click();
 await page.evaluate(()=>window.allowSyntheticMicrophone());
 await expect.poll(()=>page.evaluate(()=>window.syntheticMicrophones.length)).toBe(1);
 expect(await page.evaluate(()=>window.syntheticMicrophones[0].stream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
 await game.getByRole('button',{name:'Try a demo'}).click();await expect(page.locator('#record-status')).toContainText('Recording');
});

test('denied microphone does not block a guest game',async({page})=>{
 await syntheticMicrophone(page,'denied');await page.goto('/play/plank-flight');const game=page.frameLocator('#game-frame');
 await game.getByRole('button',{name:'Record conversation',exact:true}).click();
 await expect(game.getByText('Microphone permission was denied. You can still play without conversation.')).toBeVisible();
 await game.getByRole('button',{name:'Try a demo'}).click();await expect(page.locator('#record-status')).toContainText('Recording');
});

// Exercise browser capture without replacing getUserMedia with a Web Audio stream.
test.describe('native microphone capture',()=>{

 test('microphone armed before play persists audible voice and uses a compact top-right icon',async({page})=>{
  await page.goto('/play/plank-flight');const game=page.frameLocator('#game-frame');
  const mic=game.getByRole('button',{name:'Record conversation',exact:true});
  await expect(mic).toBeVisible();expect(await mic.textContent()).toBe('');
  const box=await mic.boundingBox();expect(box.width).toBe(40);expect(box.y).toBe(12);expect(box.x+box.width).toBe(1428);
  await game.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
  await expect(mic).toBeVisible();
  await expect.poll(()=>mic.evaluate(el=>!document.fullscreenElement||document.fullscreenElement.contains(el))).toBe(true);
  await game.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
  await mic.click();await expect(game.locator('.hopmodo-conversation')).toHaveAttribute('data-state','ready');
  await game.getByRole('button',{name:'Try a demo',exact:true}).click();
  await expect(game.locator('.hopmodo-conversation')).toHaveAttribute('data-state','recording');
  await page.waitForTimeout(1000);await game.locator('#stop').click();
  await expect(page.locator('#record-status')).toContainText('Saved on this device',{timeout:18000});
  await expect(game.locator('.hopmodo-conversation')).toHaveAttribute('data-state','off');
  await page.goto('/library');await page.reload();
  const card=page.locator('.clip-card').first();expect(await energy(card.locator('[data-conversation-download]'))).toBeGreaterThan(.005);
 });
});
