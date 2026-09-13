export function drawPreview(canvas,id){
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 const circle=(x,y,r,color)=>{c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();};
 const round=(x,y,w,h,r,color)=>{c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();};
 if(id==='motion-quest'){
  c.fillStyle='#c5e8ce';c.fillRect(0,0,w,h);circle(385,170,105,'#eeffb2');
  for(let i=0;i<8;i++){let x=i*106-20,y=80+(i%3)*23;round(x,y,24,330,8,'#398b69');for(let k=0;k<3;k++){c.fillStyle=i%2?'#218160':'#56a276';c.beginPath();c.moveTo(x+12,y-40+k*54);c.lineTo(x-69,y+90+k*54);c.lineTo(x+93,y+90+k*54);c.fill();}}
  c.fillStyle='#1c614c';c.beginPath();c.ellipse(350,490,600,160,0,0,7);c.fill();
  round(460,232,115,125,28,'#e8c77e');circle(490,264,8,'#182346');circle(547,264,8,'#182346');round(499,291,34,10,5,'#a97847');
  c.save();c.translate(222,299);c.rotate(-.15);round(-28,-7,60,85,16,'#2347ee');circle(2,-38,35,'#ffe8bb');c.fillStyle='#2347ee';c.beginPath();c.moveTo(-39,-51);c.lineTo(2,-118);c.lineTo(43,-51);c.fill();round(-22,60,22,60,10,'#152c99');round(13,60,22,60,10,'#152c99');c.restore();
  for(let i=0;i<7;i++)circle(305+i*20,258-Math.sin(i/6*Math.PI)*52,6+i%3,'#eeff41');
 }else if(id==='dino-run'){
  c.fillStyle='#ffbd88';c.fillRect(0,0,w,h);circle(544,105,66,'#fff1be');
  c.fillStyle='#e39068';c.beginPath();c.moveTo(0,350);c.lineTo(170,210);c.lineTo(340,350);c.lineTo(470,245);c.lineTo(720,375);c.lineTo(720,480);c.lineTo(0,480);c.fill();
  c.fillStyle='#f7d6a1';c.fillRect(0,369,w,111);c.fillStyle='#bc8553';c.fillRect(0,369,w,5);
  c.save();c.translate(270,244);c.scale(10,10);c.fillStyle='#2347ee';c.beginPath();const pts=[[0,0],[4,0],[4,-6],[12,-6],[12,0],[7,0],[7,2],[11,2],[11,4],[5,4],[5,9],[2,9],[2,12],[0,12],[0,8],[-3,8],[-3,11],[-5,11],[-5,6],[-8,3],[-8,-1],[-6,2],[-2,2]];pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();c.fillStyle='white';c.fillRect(8,-5,1.5,1.5);c.restore();
  round(551,280,25,90,9,'#366c48');round(527,302,24,17,6,'#366c48');round(520,277,16,42,6,'#366c48');round(575,324,27,16,6,'#366c48');round(591,296,15,45,6,'#366c48');
  for(let i=0;i<17;i++){c.fillStyle='#d0a975';c.fillRect((i*149)%720,390+(i%4)*20,15,3);}
 }else{
  c.fillStyle='#dedaff';c.fillRect(0,0,w,h);c.strokeStyle='#a69fea';c.lineWidth=2;for(let i=0;i<3;i++){c.beginPath();c.ellipse(350,240,180+i*55,85+i*38,-.4,0,7);c.stroke();}circle(350,240,84,'#2347ee');circle(307,212,14,'white');circle(369,212,14,'white');c.strokeStyle='#eeff41';c.lineWidth=9;c.beginPath();c.arc(339,238,32,.2,2.8);c.stroke();circle(536,125,43,'#ff795e');circle(137,310,32,'#eeff41');circle(540,349,19,'#2347ee');
 }
}
export function setupPlayground(){
 const stage=document.querySelector('#playground'),canvas=document.querySelector('#hero-motion'),c=canvas.getContext('2d'),button=document.querySelector('#motion-toggle');
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');let paused=reduced.matches,visible=true,raf=0,particles=[],last=0,flight=null;
 function size(){const r=stage.getBoundingClientRect();canvas.width=r.width;canvas.height=r.height;}size();const resize=new ResizeObserver(size);resize.observe(stage);
 function updateButton(){button.textContent=paused?'Play motion':'Pause motion';button.setAttribute('aria-pressed',String(paused));}updateButton();
 function draw(t){raf=0;if(paused||!visible||document.hidden)return;const dt=Math.min((t-last)/16,2);last=t;c.clearRect(0,0,canvas.width,canvas.height);particles=particles.filter(p=>p.life>0);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=.1*dt;p.life-=dt;c.save();c.translate(p.x,p.y);c.rotate(p.life*.08);c.globalAlpha=Math.min(p.life/12,1);c.fillStyle=p.color;c.fillRect(-p.r/2,-p.r/2,p.r,p.r);c.restore();}
  if(flight){const u=Math.min(1,(t-flight)/1000),w=canvas.width,h=canvas.height,x=w*(.25+.48*u),y=h*(.7-1.5*u*(1-u)),r=Math.max(15,w*.018);c.fillStyle='#18234630';c.beginPath();c.ellipse(x,h*.76,r*1.5,r*.3,0,0,7);c.fill();const shade=c.createRadialGradient(x-r*.4,y-r*.4,0,x,y,r);shade.addColorStop(0,'#a2b5ff');shade.addColorStop(.45,'#4164ff');shade.addColorStop(1,'#153abf');c.fillStyle=shade;c.beginPath();c.arc(x,y,r,0,7);c.fill();if(u===1){flight=null;document.querySelector('#landing-status').textContent='Nice landing! Your turn in the arcade.';for(let i=0;i<24;i++)particles.push({x,y,vx:(Math.random()-.5)*9,vy:-Math.random()*5,life:30,r:5,color:['#2347ee','#ff795e','#eeff41'][i%3]});}}
  if(particles.length||flight)raf=requestAnimationFrame(draw);
 }
 function nudge(){if(paused){document.querySelector('#landing-status').textContent='Nice landing! Motion is paused. Your turn in the arcade.';return;}flight=performance.now();document.querySelector('#landing-status').textContent='Here comes a little jump…';if(!raf){last=performance.now();raf=requestAnimationFrame(draw);}}
 stage.addEventListener('pointermove',e=>{if(paused||e.pointerType==='touch')return;const r=stage.getBoundingClientRect();stage.style.setProperty('--px',`${(e.clientX-r.left-r.width/2)*.012}px`);stage.style.setProperty('--py',`${(e.clientY-r.top-r.height/2)*.012}px`);});
 stage.addEventListener('pointerleave',()=>{stage.style.setProperty('--px','0px');stage.style.setProperty('--py','0px');});
 document.querySelector('#poke').onclick=nudge;
 button.onclick=()=>{paused=!paused;updateButton();if(paused){cancelAnimationFrame(raf);raf=0;particles=[];flight=null;c.clearRect(0,0,canvas.width,canvas.height);stage.style.setProperty('--px','0px');stage.style.setProperty('--py','0px');}else nudge();};
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible){cancelAnimationFrame(raf);raf=0;particles=[];c.clearRect(0,0,canvas.width,canvas.height);}});observer.observe(stage);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;particles=[];}});
 reduced.addEventListener('change',()=>{paused=reduced.matches;updateButton();});
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);resize.disconnect();observer.disconnect();},{once:true});
}
export function startConcept(){let count=0;const target=document.querySelector('#pop-target'),score=document.querySelector('#pop-score'),status=document.querySelector('#pop-status');target.onclick=()=>{count++;score.textContent=count;if(count===10){target.hidden=true;status.textContent='Ten pops. A little burst of joy. This was a button-controlled concept.';return;}target.style.left=`${10+(count*31)%65}%`;target.style.top=`${5+(count*23)%65}%`;};document.querySelector('#pop-restart').onclick=()=>{count=0;score.textContent=0;target.hidden=false;target.style.left='45%';target.style.top='40%';status.textContent='Tap the star ten times. A future game could use reaching.';target.focus();};}
