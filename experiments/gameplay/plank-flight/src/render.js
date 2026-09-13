import {t} from './i18n.js';
import { gateOpening } from './difficulty.js';
import { FRAME_FRESH_MS } from './tracking-gate.js';
import { projectHead, helicopterScale } from './projection.js';
const links = [['Shoulder','Elbow'],['Elbow','Wrist'],['Shoulder','Hip'],['Hip','Knee'],['Knee','Ankle']];
export function render(ctx, state, { width: w, height: h, pose, pilot, time, mode }) {
  ctx.clearRect(0, 0, w, h);
  const wash = ctx.createLinearGradient(0, 0, 0, h); wash.addColorStop(0, '#092c3e70'); wash.addColorStop(.55, '#092c3e08'); wash.addColorStop(1, '#092c3eaa');
  ctx.fillStyle = wash; ctx.fillRect(0, 0, w, h);
  if (pose && mode === 'camera' && time - pose.tMs < FRAME_FRESH_MS) {
    const scale = Math.max(w / pose.image.width, h / pose.image.height);
    const point = p => { const projected=projectHead({...p,image:pose.image},w,h);return [projected.x*w,projected.y*h]; };
    ctx.strokeStyle = '#bdf4cbbb'; ctx.fillStyle = '#e8ffed'; ctx.lineWidth = 3;
    for (const side of ['left','right']) for (const [a,b] of links) {
      const p=pose.joints[side+a],q=pose.joints[side+b];
      if (!p || !q || p.confidence < .6 || q.confidence < .6) continue;
      ctx.beginPath();ctx.moveTo(...point(p));ctx.lineTo(...point(q));ctx.stroke();
      ctx.beginPath();ctx.arc(...point(p),3,0,Math.PI*2);ctx.fill();
    }
    if (pose.head) { const [x,y]=point(pose.head);ctx.strokeStyle='#fff3ac';ctx.setLineDash([5,5]);ctx.beginPath();ctx.arc(x,y,pose.head.sizePx*scale/2,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]); }
  }
  for (const o of state.obstacles) {
    const gap=gateOpening(o,state.difficulty,{width:w,height:h});
    const x=o.x*w, gapTop=gap.top*h, gapBottom=gap.bottom*h;
    ctx.fillStyle='#d8f4da40';ctx.strokeStyle='#d7ffe3';ctx.lineWidth=2;
    for (const [y,height] of [[0,gapTop],[gapBottom,h-gapBottom]]) {
      ctx.fillRect(x-17,y,34,height);ctx.strokeRect(x-17,y,34,height);
    }
    ctx.fillStyle='#e4ffea';ctx.font='12px system-ui';ctx.fillText(t('FLY THROUGH'),x-48,gapTop+22);
  }
  const x=state.x*w,y=Math.min(state.y,1.12)*h;
  const size=helicopterScale(w);
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  if (state.status==='crashing') ctx.rotate(Math.min(state.crashSeconds*1.4,1.5));
  // Anchor the cockpit center exactly on the projected head position.
  ctx.translate(-15,1);
  ctx.shadowColor='#071f3355';ctx.shadowBlur=20;
  ctx.fillStyle='#f6c77b';ctx.beginPath();ctx.ellipse(0,0,49,29,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(-38,-9);ctx.lineTo(-92,-23);ctx.lineTo(-89,1);ctx.lineTo(-38,11);ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle='#253f47';ctx.lineWidth=5;
  ctx.beginPath();ctx.moveTo(-15,27);ctx.lineTo(-21,40);ctx.moveTo(22,25);ctx.lineTo(28,40);ctx.moveTo(-37,40);ctx.lineTo(44,40);ctx.stroke();
  ctx.beginPath();ctx.moveTo(-3,-28);ctx.lineTo(-3,-43);ctx.stroke();
  const rotor=state.status==='finished'?45:55+Math.sin(time*.06)*15;
  ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-3-rotor,-43);ctx.lineTo(-3+rotor,-43);ctx.stroke();
  ctx.save();ctx.beginPath();ctx.arc(15,-1,23,0,Math.PI*2);ctx.clip();
  ctx.fillStyle='#476c76';ctx.fillRect(-8,-24,46,46);
  if (pilot) ctx.drawImage(pilot,-8,-24,46,46);
  else {ctx.fillStyle='#d7ede1';ctx.beginPath();ctx.arc(15,-5,10,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(15,20,18,14,0,0,Math.PI*2);ctx.fill();}
  ctx.restore();ctx.strokeStyle='#fff5d8';ctx.lineWidth=3;ctx.beginPath();ctx.arc(15,-1,23,0,Math.PI*2);ctx.stroke();
  if(state.status==='crashing') {ctx.fillStyle='#f8e8c5aa';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(-65-i*18,Math.sin(i+time/300)*10,5+i*2,0,Math.PI*2);ctx.fill();}}
  ctx.restore();
  if(state.status==='crashing') {ctx.fillStyle=`rgba(255,232,198,${Math.min(.15,state.crashSeconds*.1)})`;ctx.fillRect(0,0,w,h);}
}
