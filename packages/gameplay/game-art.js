// Local cover-matched sprites. Lazy browser loading keeps pure game tests DOM-free.
export const playArtwork={
 dino:new URL('../../assets/game-art/sprites/dino-v1.webp',import.meta.url).href,
 guardian:new URL('../../assets/game-art/sprites/guardian-v1.webp',import.meta.url).href,
 mage:new URL('../../assets/game-art/sprites/mage-v1.webp',import.meta.url).href,
 helicopter:new URL('../../assets/game-art/sprites/helicopter-v1.webp',import.meta.url).href,
};
const images=new Map();
export function drawGameArt(ctx,name,x,y,width,height){
 if(typeof Image==='undefined')return false;
 if(!images.has(name)){const image=new Image();image.src=playArtwork[name];images.set(name,image);}
 const image=images.get(name);
 if(!image.complete||!image.naturalWidth)return false;
 ctx.drawImage(image,x,y,width,height);return true;
}
