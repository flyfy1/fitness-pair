const blend=(hex,target,amount)=>'#'+hex.slice(1).match(/../g).map(part=>Math.round(parseInt(part,16)*(1-amount)+target*amount).toString(16).padStart(2,'0')).join('');

/** A matte material for an existing path; this never changes its geometry. */
export function clayPaint(ctx,x,y,width,height,color){
 const gradient=ctx.createLinearGradient(x,y,x+width*.35,y+height);
 gradient.addColorStop(0,blend(color,255,.35));gradient.addColorStop(.4,color);gradient.addColorStop(1,blend(color,0,.2));return gradient;
}

export function clayRect(ctx,x,y,width,height,color,radius=4){
 ctx.save();ctx.shadowColor='#173c3633';ctx.shadowBlur=5;ctx.shadowOffsetY=3;
 ctx.fillStyle=clayPaint(ctx,x,y,width,height,color);ctx.beginPath();ctx.roundRect(x,y,width,height,Math.min(radius,width/2,height/2));ctx.fill();
 ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.strokeStyle='#fff8e95c';ctx.lineWidth=1;ctx.stroke();ctx.restore();
}

export function clayBall(ctx,x,y,radius,color){
 ctx.save();ctx.shadowColor='#173c3640';ctx.shadowBlur=5;ctx.shadowOffsetY=3;
 const gradient=ctx.createRadialGradient(x-radius*.35,y-radius*.4,radius*.08,x,y,radius);
 gradient.addColorStop(0,blend(color,255,.5));gradient.addColorStop(.45,color);gradient.addColorStop(1,blend(color,0,.22));
 ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.restore();
}
