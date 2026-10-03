// Versioned pose images stay in the common reusable artwork directory.
const files = {
  idle: 'mage-idle', charge: 'mage-charge', cast: 'mage-cast',
  stepA: 'guardian-step-a', stepB: 'guardian-step-b', hit: 'guardian-hit',
};
const urls = {
  idle: new URL('../../../assets/game-art/sprites/mage-idle-v1.webp', import.meta.url).href,
  charge: new URL('../../../assets/game-art/sprites/mage-charge-v1.webp', import.meta.url).href,
  cast: new URL('../../../assets/game-art/sprites/mage-cast-v1.webp', import.meta.url).href,
  stepA: new URL('../../../assets/game-art/sprites/guardian-step-a-v1.webp', import.meta.url).href,
  stepB: new URL('../../../assets/game-art/sprites/guardian-step-b-v1.webp', import.meta.url).href,
  hit: new URL('../../../assets/game-art/sprites/guardian-hit-v1.webp', import.meta.url).href,
};
const images = new Map();
export function drawCharacter(ctx, pose, x, ground, height) {
  if (typeof Image === 'undefined' || !files[pose]) return false;
  if (!images.has(pose)) { const image = new Image(); image.src = urls[pose]; images.set(pose, image); }
  const image = images.get(pose);
  if (!image.complete || !image.naturalWidth) return false;
  const width = height * image.naturalWidth / image.naturalHeight;
  ctx.drawImage(image, x - width / 2, ground - height, width, height);
  return true;
}
