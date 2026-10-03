const blend=(hex,target,amount)=>'#'+hex.slice(1).match(/../g).map(part=>Math.round(parseInt(part,16)*(1-amount)+target*amount).toString(16).padStart(2,'0')).join('');

/** A matte material for an existing path; this never changes its geometry. */
export function clayPaint(ctx,x,y,width,height,color){
 const gradient=ctx.createLinearGradient(x,y,x+width*.35,y+height);
 gradient.addColorStop(0,blend(color,255,.35));gradient.addColorStop(.4,color);gradient.addColorStop(1,blend(color,0,.2));return gradient;
}

export function clayRect(ctx,x,y,width,height,color,radius=4){
 ctx.save();ctx.shadowColor='#173c3645';ctx.shadowBlur=9;ctx.shadowOffsetY=5;
 ctx.fillStyle=clayPaint(ctx,x,y,width,height,color);ctx.beginPath();ctx.roundRect(x,y,width,height,Math.min(radius,width/2,height/2));ctx.fill();
 ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 ctx.save();ctx.clip();
 ctx.strokeStyle=blend(color,255,.58);ctx.lineWidth=Math.max(2,Math.min(4,height*.14));ctx.beginPath();ctx.moveTo(x+radius,y+2);ctx.lineTo(x+width-radius,y+2);ctx.stroke();
 ctx.strokeStyle=blend(color,0,.26);ctx.lineWidth=Math.max(2,Math.min(5,height*.2));ctx.beginPath();ctx.moveTo(x+radius,y+height-2);ctx.lineTo(x+width-radius,y+height-2);ctx.stroke();ctx.restore();
 ctx.strokeStyle='#fff8e94a';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,width,height,Math.min(radius,width/2,height/2));ctx.stroke();ctx.restore();
}

export function clayBall(ctx,x,y,radius,color){
 ctx.save();ctx.shadowColor='#173c3640';ctx.shadowBlur=5;ctx.shadowOffsetY=3;
 const gradient=ctx.createRadialGradient(x-radius*.35,y-radius*.4,radius*.08,x,y,radius);
 gradient.addColorStop(0,blend(color,255,.56));gradient.addColorStop(.32,blend(color,255,.12));gradient.addColorStop(.72,color);gradient.addColorStop(1,blend(color,0,.33));
 ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.restore();
}

const boards=new Map();
/** Static miniature scenery is cached; moving objects keep their native bounds. */
export function clayBoard(ctx,width,height,theme='garden'){
 const key=`${width}:${height}:${theme}`;
 if(!boards.has(key)){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const c=canvas.getContext('2d'),space=theme==='invaders',forest=theme==='knife';
  const wash=c.createLinearGradient(0,0,width,height);wash.addColorStop(0,space?'#b9d3ed':'#d7eee3');wash.addColorStop(1,space?'#71899f':'#9bb99b');
  c.fillStyle=wash;c.beginPath();c.roundRect(0,0,width,height,24);c.fill();
  // A ceramic rim, recessed play surface and soft contact shadows.
  clayRect(c,6,33,width-12,height-41,'#f1dfbd',25);
  const well=c.createLinearGradient(0,38,0,height);well.addColorStop(0,space?'#243f61':forest?'#aec69a':'#92bfa9');well.addColorStop(1,space?'#52647e':forest?'#d4d9ad':'#c2d9b3');
  c.fillStyle=well;c.beginPath();c.roundRect(14,41,width-28,height-59,18);c.fill();
  c.strokeStyle='#314d3b35';c.lineWidth=3;c.stroke();
  c.fillStyle='#fff8e955';c.beginPath();c.ellipse(width*.5,height*.9,width*.39,height*.07,0,0,Math.PI*2);c.fill();
  if(space){
   for(let i=0;i<34;i++){c.fillStyle=i%3?'#fff8e999':'#f0c978';c.beginPath();c.arc(20+(i*97)%(width-40),48+(i*53)%(height-90),i%3?1:2,0,Math.PI*2);c.fill();}
   clayBall(c,width*.84,height*.79,22,'#c5c3d3');
  }else{
   for(const [x,s] of [[22,1],[width-22,-1]]){
    clayRect(c,x-3,height-65,6,35,'#ac8b5c',3);
    for(const [dx,dy,r] of [[0,0,18],[s*11,-14,15],[-s*7,-22,12]])clayBall(c,x+dx,height-68+dy,r,forest?'#83a368':'#77a894');
    clayBall(c,x+s*17,height-27,10,'#b5b7a1');
   }
  }
  // Deterministic, subtle clay grain; never changes physics or input coordinates.
  c.fillStyle='#fff8e91a';for(let i=0;i<900;i++)c.fillRect((i*137.3)%width,(i*67.7)%height,.8,.8);
  boards.set(key,canvas);if(boards.size>12)boards.delete(boards.keys().next().value);
 }
 ctx.drawImage(boards.get(key),0,0,width,height);
}

/** Open scenery stays at the edges so the live camera remains visible. */
export function clayLandscape(ctx,width,height,ground,theme='desert',distance=0){
 ctx.save();
 const desert=theme==='desert',color=desert?'#e8bd8d':'#9bbb9c';
 const haze=ctx.createLinearGradient(0,ground-height*.18,0,height);haze.addColorStop(0,desert?'#f5d7ad00':'#cfdfc500');haze.addColorStop(.45,desert?'#f5d7adbb':'#cfdfc5bb');haze.addColorStop(1,color);
 ctx.fillStyle=haze;ctx.fillRect(0,ground-height*.18,width,height-ground+height*.18);
 for(let i=0;i<7;i++){
  const x=((i*width/5-distance*.1)%(width+120)+width+120)%(width+120)-60;
  const y=ground-10+(i%3)*5,r=17+(i%3)*9;
  clayBall(ctx,x,y,r,desert?'#d99b76':'#78a388');
 }
 ctx.fillStyle=clayPaint(ctx,0,ground,width,height-ground,desert?'#e9c499':'#b3c796');ctx.fillRect(0,ground,width,height-ground);
 if(theme==='forest')for(const x of [width*.04,width*.96]){
  clayRect(ctx,x-5,ground-75,10,75,'#a5865f',5);
  for(const [dx,dy,r] of [[-12,0,24],[12,-13,28],[0,-35,22]])clayBall(ctx,x+dx,ground-72+dy,r,'#81a481');
 }
 ctx.strokeStyle=desert?'#fff0d2':'#edf3d7';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,ground);ctx.lineTo(width,ground);ctx.stroke();
 for(let i=0;i<40;i++){
  const x=((i*97.3-distance*.25)%width+width)%width,y=ground+12+(i*43.7)%Math.max(1,height-ground-12);
  ctx.fillStyle=i%3? '#fff8e943':'#9b774a33';ctx.beginPath();ctx.ellipse(x,y,3+i%3,1.3,0,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}

export function clayShip(ctx,x,y,width,height){
 ctx.save();ctx.translate(x,y);ctx.scale(width/40,height/20);
 ctx.shadowColor='#173c3655';ctx.shadowBlur=8;ctx.shadowOffsetY=4;
 ctx.fillStyle=clayPaint(ctx,0,0,40,20,'#548fbd');ctx.beginPath();ctx.moveTo(20,0);ctx.bezierCurveTo(24,0,27,8,28,10);ctx.lineTo(39,16);ctx.quadraticCurveTo(42,20,35,20);ctx.lineTo(5,20);ctx.quadraticCurveTo(-2,20,1,16);ctx.lineTo(12,10);ctx.bezierCurveTo(13,8,16,0,20,0);ctx.fill();
 ctx.shadowBlur=0;clayBall(ctx,20,9,5,'#c5e6dc');clayRect(ctx,5,16,7,3,'#e88e72',1);clayRect(ctx,28,16,7,3,'#e88e72',1);ctx.restore();
}

/** Camera-free play uses a rendered backdrop, also included in local replays. */
export function clayBackdrop(ctx,width,height,theme='sky'){
 ctx.save();
 const forest=theme==='forest',wash=ctx.createLinearGradient(0,0,0,height);
 wash.addColorStop(0,forest?'#d9e5c9':'#b8dbdf');wash.addColorStop(1,forest?'#a9c3a2':'#91bcb7');ctx.fillStyle=wash;ctx.fillRect(0,0,width,height);
 clayBall(ctx,width*.82,height*.22,Math.min(width,height)*.07,'#f4ddb0');
 for(const [x,y,s] of [[width*.13,height*.30,1],[width*.87,height*.43,.8]]){
  ctx.save();ctx.translate(x,y);ctx.scale(s, s*.62);
  for(const [dx,dy,r] of [[-28,2,24],[0,-12,32],[30,6,23]])clayBall(ctx,dx,dy,r,'#fff5e5');ctx.restore();
 }
 const ground=height*(forest?.70:.94);
 for(let i=0;i<5;i++){
  ctx.fillStyle=clayPaint(ctx,i*width*.3,ground-height*.17,width*.45,height*.2,forest?'#a5ba8f':'#9dbbad');
  ctx.beginPath();ctx.ellipse(i*width*.3,ground+14,width*.24,height*(.08+(i%2)*.025),0,Math.PI,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}
