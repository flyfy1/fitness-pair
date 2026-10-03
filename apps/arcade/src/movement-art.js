import {poseArtwork} from '../../../packages/gameplay/pose-art.js';
import {gameCovers} from '../../../packages/gameplay/game-covers.js';
// The illustrations are deliberately posed, static and explicitly labeled.
const arrow=(x,y,dx,dy)=>`<path d="M${x} ${y}l${dx} ${dy}m${dx?-Math.sign(dx)*10:-7} ${dy?-Math.sign(dy)*10:-7}l${dx?Math.sign(dx)*10:7} ${dy?Math.sign(dy)*10:7}l${dx?-Math.sign(dx)*10:7} ${dy?-Math.sign(dy)*10:7}" fill="none" stroke="#d97959" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
const games={paddle:'ar-breakout',stack:'ar-stack',knife:'ar-knife',bubble:'ar-bubble',fruit:'ar-fruit',dino:'jump-game',flight:'plank-flight',target:'orbit-pop'};
function picture(type){
 if(games[type])return `<image href="${gameCovers[games[type]].src}" x="10" y="15" width="200" height="180" preserveAspectRatio="xMidYMid slice"/>`;
 if(type==='pushup'||type==='head')return `<image href="${poseArtwork.pushup}" x="15" y="32" width="185" height="148" preserveAspectRatio="xMidYMid meet"/>${arrow(194,161,0,-66)}`;
 const pose=poseArtwork[type]||poseArtwork.stand;
 const hand=type==='raise'?'<circle cx="75" cy="37" r="12" fill="#f1d7ab"/><text x="75" y="41" text-anchor="middle" font-size="12" font-weight="800" fill="#203d39">L</text>':type==='aim'?'<circle cx="179" cy="92" r="12" fill="#f1d7ab"/><text x="179" y="96" text-anchor="middle" font-size="12" font-weight="800" fill="#203d39">R</text>':'';
 const direction=type==='sway-left'?arrow(52,58,-30,0):type==='sway-right'?arrow(168,58,30,0):type==='sway'?arrow(52,58,-30,0)+arrow(168,58,30,0):type==='raise'?arrow(40,110,0,-55):type==='lower'?arrow(40,55,0,55):type==='jump'||type==='stand-up'?arrow(185,158,0,-67):type==='squat'?arrow(190,65,0,70):type==='aim'?arrow(165,123,30,0):'';
 return `<image href="${pose}" x="38" y="18" width="144" height="178" preserveAspectRatio="xMidYMid meet"/>${hand}${direction}`;
}
export function movementArt(guide,compact=false){
 const tiles=compact?guide.tiles.slice(0,2):guide.tiles;
 return `<div class="movement-art${compact?' movement-art--card':''}">${tiles.map(([type,label],i)=>`<figure><svg viewBox="0 0 220 210" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg" style="border-radius:20px;overflow:hidden"><rect width="220" height="210" rx="20" fill="${i%2?'#e7efe0':'#fff5e3'}"/>${picture(type)}</svg><figcaption><span>${i+1}</span> ${label}</figcaption></figure>`).join('')}</div>`;
}
