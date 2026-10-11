import {duelSlugs} from './duel-rules.js';
import {mountSolo} from './main.js';
import {mountDuel} from './duel.js';
const params = new URLSearchParams(location.search);
const slug = params.get('game') || ({'ar-breakout':'breakout','ar-stack':'stack','ar-knife':'knife'}[location.pathname.split('/')[2]]);
// Publish the presentation synchronously before iframe load binds its recorder.
if (params.get('mode') === 'duel' && duelSlugs.includes(slug)) mountDuel();
else mountSolo();
