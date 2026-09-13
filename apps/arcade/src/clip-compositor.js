import {BRAND_NAME,SITE_HOST,SITE_URL,LOGO_URL} from './brand.js';
export const CLIP_WIDTH=1280,CLIP_HEIGHT=800,PLAY_HEIGHT=720;
// Keep encoder dimensions even and lock orientation for the lifetime of a clip.
export function recordingSize({width,height}={}){
 if(Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>width)
  return {width:Math.max(2,Math.round(CLIP_WIDTH*width/height/2)*2),height:CLIP_WIDTH};
 return {width:CLIP_WIDTH,height:CLIP_HEIGHT};
}
const footerHeight=c=>c.canvas.height>c.canvas.width?160:80;
export async function loadRecordingLogo(){
 const img=new Image();img.src=LOGO_URL;
 await img.decode();return img;
}
function coverVideo(c,video,x,y,w,h){
 const vw=video.videoWidth||video.width,vh=video.videoHeight||video.height;
 const scale=Math.max(w/vw,h/vh);
 const sw=w/scale,sh=h/scale;
 c.save();c.translate(x+w,y);c.scale(-1,1);
 c.drawImage(video,(vw-sw)/2,(vh-sh)/2,sw,sh,0,0,w,h);c.restore();
}
export function drawClipFrame(c,{canvas,video,skeleton,skeletonMirrored=false,isAR,layout,includesCamera,title,score,logo,hud,branded=true}){
 const {width,height}=c.canvas;
 c.fillStyle='#182346';c.fillRect(0,0,width,height);
 const sourceWidth=layout?.width||canvas.width,sourceHeight=layout?.height||canvas.height;
 const playHeight=height-(branded?footerHeight(c):0);
 const scale=Math.min(width/sourceWidth,playHeight/sourceHeight);
 const w=sourceWidth*scale,h=sourceHeight*scale,x=(width-w)/2,y=(playHeight-h)/2;
 const videoReady=video&&(video.readyState>=2||video instanceof HTMLCanvasElement&&video.width>0);
 if(isAR&&includesCamera&&videoReady)coverVideo(c,video,x,y,w,h);
 if(isAR&&skeleton?.width){
  c.save();
  if(skeletonMirrored)c.drawImage(skeleton,x,y,w,h);
  else{c.translate(x+w,y);c.scale(-1,1);c.drawImage(skeleton,0,0,w,h);}
  c.restore();
 }
 if(layout)c.drawImage(canvas,x+layout.x*scale,y+layout.y*scale,layout.canvasWidth*scale,layout.canvasHeight*scale);
 else c.drawImage(canvas,x,y,w,h);
 if(!isAR&&includesCamera&&videoReady){
  const insetWidth=Math.min(258,width*.32),insetHeight=insetWidth*192/258;
  const insetX=width-insetWidth-28,insetY=height>width?playHeight-insetHeight-38:490;
  c.fillStyle='#fff';c.fillRect(insetX-4,insetY-4,insetWidth+8,insetHeight+8);coverVideo(c,video,insetX,insetY,insetWidth,insetHeight);
 }
 if(hud)drawGameHUD(c,hud,x,y,w,h);
 if(branded)drawWatermark(c,{title,score,includesCamera,logo});
}
// These values come from Motion Quest's live DOM; the native game UI is unchanged.
function drawGameHUD(c,hud,x,y,w,h){
 c.save();c.fillStyle='#182346e8';c.fillRect(x+12,y+12,w-24,58);
 c.fillStyle='#fff';c.font='bold 20px Arial';c.textAlign='left';c.fillText(`Forest guardian · ${hud.health||'100 / 100'}`,x+26,y+48,w-52);
 c.fillStyle='#182346e8';c.fillRect(x+12,y+h-82,w-24,70);
 c.fillStyle='#fff';c.font='bold 22px Arial';c.fillText(hud.cue||'Move to play',x+26,y+h-51,w-52);
 c.font='16px Arial';c.fillText(`Charge ${hud.charge||'0%'} · Active time ${hud.elapsed||'00:00'}`,x+26,y+h-27,w-52);c.restore();
}
export function drawWatermark(c,{title,score,includesCamera,logo}){
 if(c.canvas.height>c.canvas.width){
  const width=c.canvas.width,top=c.canvas.height-footerHeight(c),padding=20;
  c.save();c.fillStyle='#eeff41';c.fillRect(0,top,width,footerHeight(c));
  c.drawImage(logo,padding,top+16,42,42);c.fillStyle='#2347ee';c.font='900 28px Arial';c.textAlign='left';
  c.fillText(BRAND_NAME.toLowerCase(),padding+54,top+47,width-padding*2-54);
  c.fillStyle='#182346';c.font='bold 21px Arial';c.fillText(`${title} · ${score}`,padding,top+88,width-padding*2);
  c.font='18px Arial';c.fillText(`Play at ${SITE_HOST}`,padding,top+130,width-padding*2);c.restore();return;
 }
 c.fillStyle='#eeff41';c.fillRect(0,PLAY_HEIGHT,CLIP_WIDTH,80);
 c.drawImage(logo,20,736,48,48);
 c.fillStyle='#2347ee';c.font='900 30px Arial';c.fillText(BRAND_NAME.toLowerCase(),78,766);
 c.fillStyle='#182346';c.font='bold 19px Arial';c.fillText(`${title} · ${score}`,255,752,550);
 c.font='16px Arial';c.fillText(includesCamera?'Player recording':'Synthetic gameplay preview',255,779);
 c.textAlign='right';c.font='bold 15px Arial';c.fillText('Play at',1254,749);
 c.font='16px Arial';c.fillText(SITE_HOST,1254,776,470);c.textAlign='left';
}
export function drawClipEnding(c,title,score,logo,includesCamera,reason='Round complete'){
 if(c.canvas.height>c.canvas.width){
  const {width,height}=c.canvas,padding=32,contentWidth=width-padding*2;
  c.save();c.setTransform(1,0,0,1,0,0);c.textBaseline='alphabetic';c.textAlign='center';
  c.fillStyle='#eeff41';c.fillRect(0,0,width,height);c.drawImage(logo,width/2-44,height*.14,88,88);
  c.fillStyle='#2347ee';c.font='900 48px Arial';c.fillText(BRAND_NAME.toLowerCase(),width/2,height*.28,contentWidth);
  c.font='900 64px Arial';
  for(const [i,line] of ['GAMES THAT','GET YOU','MOVING.'].entries())c.fillText(line,width/2,height*.40+i*78,contentWidth);
  c.fillStyle='#182346';c.font='25px Arial';c.fillText('Movement games',width/2,height*.62,contentWidth);c.fillText('for kids and adults',width/2,height*.65,contentWidth);
  c.fillStyle='#2347ee';c.beginPath();c.roundRect(padding,height*.70,contentWidth,130,20);c.fill();
  c.fillStyle='#fff';c.font='bold 21px Arial';c.fillText('Play your next game at',width/2,height*.70+43,contentWidth-24);
  c.font='bold 23px Arial';c.fillText(SITE_URL,width/2,height*.70+88,contentWidth-24);
  c.fillStyle='#182346';c.font='bold 24px Arial';c.fillText(title,width/2,height*.88,contentWidth);
  c.font='20px Arial';c.fillText(score,width/2,height*.92,contentWidth);c.restore();return;
 }
 c.save();c.setTransform(1,0,0,1,0,0);c.textBaseline='alphabetic';
 c.fillStyle='#eeff41';c.fillRect(0,0,CLIP_WIDTH,CLIP_HEIGHT);
 c.fillStyle='#2347ee';c.font='900 48px Arial';c.textAlign='left';
 const name=BRAND_NAME.toLowerCase(),brandX=(CLIP_WIDTH-88-c.measureText(name).width)/2;
 c.drawImage(logo,brandX,48,72,72);c.fillText(name,brandX+88,100);
 c.textAlign='center';c.font='900 88px Arial';c.fillText('GAMES THAT GET',640,267,1136);
 c.font='900 106px Arial';c.fillText('YOU MOVING.',640,378,1136);
 c.fillStyle='#182346';c.font='30px Arial';c.fillText('Movement games for kids and adults',640,449,1136);
 c.fillStyle='#2347ee';c.beginPath();c.roundRect(72,506,1136,144,24);c.fill();
 c.fillStyle='#fff';c.font='bold 24px Arial';c.fillText('Play your next game at',640,553);
 c.font='bold 30px Arial';c.fillText(SITE_URL,640,605,1064);
 c.fillStyle='#182346';c.font='bold 26px Arial';c.fillText(`${title} · ${score}`,640,721,1136);
 c.font='18px Arial';c.fillText(`${includesCamera?'Player recording':'Synthetic gameplay preview'} · ${reason.toLowerCase()}`,640,759,1136);
 c.restore();
}

// Add branding only to an explicitly requested download, keeping all source pixels.
export function drawDownloadFrame(c,video,clip,logo){
 const {width,height}=c.canvas,playHeight=height-footerHeight(c);
 c.fillStyle='#182346';c.fillRect(0,0,width,height);
 const scale=Math.min(width/video.videoWidth,playHeight/video.videoHeight);
 const w=video.videoWidth*scale,h=video.videoHeight*scale;
 c.drawImage(video,(width-w)/2,(playHeight-h)/2,w,h);
 drawWatermark(c,{title:clip.gameTitle||clip.title,score:clip.finalScore||'Replay',includesCamera:clip.includesCamera,logo});
}
