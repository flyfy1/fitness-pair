// Shared artwork for Arcade cards and standalone introductions. Vite bundles
// these local URLs so a game preview does not depend on the production website.
export const gameCovers = {
 'motion-quest': {src:new URL('./assets/covers/motion-quest-v1.jpg',import.meta.url).href,alt:'A forest mage casts a blue spell toward a mossy guardian.'},
 'plank-flight': {src:new URL('./assets/covers/plank-flight-v1.jpg',import.meta.url).href,alt:'A tiny helicopter flies through rounded gates above a calm landscape.'},
 'jump-game': {src:new URL('./assets/covers/jump-game-v1.jpg',import.meta.url).href,alt:'A green dinosaur jumps over a cactus on a sunny desert path.'},
 'ar-breakout': {src:new URL('./assets/covers/ar-breakout-v1.jpg',import.meta.url).href,alt:'A paddle bounces a ball toward rows of colorful bricks.'},
 'ar-invaders': {src:new URL('./assets/covers/ar-invaders-v1.jpg',import.meta.url).href,alt:'A blue spacecraft fires toward a formation of pixel aliens.'},
 'ar-stack': {src:new URL('./assets/covers/ar-stack-v1.jpg',import.meta.url).href,alt:'A colorful tower awaits its next carefully aligned slab.'},
 'ar-knife': {src:new URL('./assets/covers/ar-knife-v1.jpg',import.meta.url).href,alt:'A toy throwing knife approaches a clear gap on a wooden target.'},
 'ar-bubble': {src:new URL('./assets/covers/ar-bubble-v1.jpg',import.meta.url).href,alt:'A launcher aims a mint bubble toward matching colorful bubbles.'},
 'ar-fruit': {src:new URL('./assets/covers/ar-fruit-v1.jpg',import.meta.url).href,alt:'An orange drops onto matching fruit in a rounded puzzle container.'},
 'orbit-pop': {src:new URL('./assets/covers/orbit-pop-v1.jpg',import.meta.url).href,alt:'A coral target sphere is surrounded by smaller colorful orbiting targets.'},
};
