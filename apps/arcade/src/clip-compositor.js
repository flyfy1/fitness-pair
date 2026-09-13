import {BRAND_NAME,SITE_HOST,SITE_URL,LOGO_URL} from './brand.js';
export const CLIP_WIDTH=1280,CLIP_HEIGHT=800,PLAY_HEIGHT=720;
export async function loadRecordingLogo(){
 const img=new Image();img.src=LOGO_URL;
 await img.decode();return img;
}
function coverVideo(c,video,x,y,w,h){
 const scale=Math.max(w/video.videoWidth,h/video.videoHeight);
 const sw=w/scale,sh=h/scale;
 c.save();c.translate(x+w,y);c.scale(-1,1);
 c.drawImage(video,(video.videoWidth-sw)/2,(video.videoHeight-sh)/2,sw,sh,0,0,w,h);c.restore();
}
export function drawClipFrame(c,{canvas,video,skeleton,isAR,includesCamera,title,score,logo}){
 c.fillStyle='#182346';c.fillRect(0,0,CLIP_WIDTH,CLIP_HEIGHT);
 const scale=Math.min(CLIP_WIDTH/canvas.width,PLAY_HEIGHT/canvas.height);
 const w=canvas.width*scale,h=canvas.height*scale,x=(CLIP_WIDTH-w)/2,y=(PLAY_HEIGHT-h)/2;
 if(isAR&&includesCamera&&video.readyState>=2)coverVideo(c,video,x,y,w,h);
 if(isAR&&skeleton?.width){c.save();c.translate(x+w,y);c.scale(-1,1);c.drawImage(skeleton,0,0,w,h);c.restore();}
 c.drawImage(canvas,x,y,w,h);
 if(!isAR&&includesCamera&&video.readyState>=2){
  c.fillStyle='#fff';c.fillRect(990,486,266,200);coverVideo(c,video,994,490,258,192);
 }
 drawWatermark(c,{title,score,includesCamera,logo});
}
function drawWatermark(c,{title,score,includesCamera,logo}){
 c.fillStyle='#eeff41';c.fillRect(0,PLAY_HEIGHT,CLIP_WIDTH,80);
 c.drawImage(logo,20,736,48,48);
 c.fillStyle='#2347ee';c.font='900 30px Arial';c.fillText(BRAND_NAME.toLowerCase(),78,766);
 c.fillStyle='#182346';c.font='bold 19px Arial';c.fillText(`${title} · ${score}`,255,752,550);
 c.font='16px Arial';c.fillText(includesCamera?'Player recording':'Synthetic gameplay preview',255,779);
 c.textAlign='right';c.font='bold 15px Arial';c.fillText('Play at',1254,749);
 c.font='16px Arial';c.fillText(SITE_HOST,1254,776,470);c.textAlign='left';
}
export function drawClipEnding(c,title,score,logo,includesCamera){
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
 c.font='18px Arial';c.fillText(includesCamera?'Player recording · round complete':'Synthetic gameplay preview · round complete',640,759,1136);
 c.restore();
}
