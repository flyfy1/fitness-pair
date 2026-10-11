import '../../../packages/gameplay/page-language.js';
import './style.css';
import '../../../packages/gameplay/play-style.css';
import './duel.css';
import {mountGameEntry} from '../../../packages/gameplay/entry-view.js';
import {PoseCamera} from '@fitness-pair/pose-mediapipe/camera';
import {BodyGestures} from '../../../packages/gameplay/body-gestures.js';
import {HandsStartGate} from '../../../packages/gameplay/hands-start.js';
import {BodyArcadeRecognizer} from '../../../experiments/action-recognition/body-arcade/index.js';
import {DuelAudio} from './duel-audio.js';
import {drawBody} from '../../camera-start/src/body-overlay.js';
import {setupFullscreen} from '../../../packages/gameplay/fullscreen.js';
import {arGames} from './catalog.js';
import {modules} from './modules.ts';
import {createBodyInput} from './input.js';
import {DUEL_DURATION_MS, validAction, duelScore, duelResult, seededRandom} from './duel-rules.js';

export function mountDuel() {
const $ = id => document.getElementById(id);
const slug = new URLSearchParams(location.search).get('game');
const config = arGames.find(game => slug ? game.slug === slug : location.pathname.split('/').includes(game.id));
document.documentElement.classList.add('clay-play'); $('arena').classList.add('duel-stage');
document.title = `${config.title} · Two players`;
$('game-title').textContent = `${config.title} · Duel`;
$('category').textContent = 'TWO PLAYERS · ONE CAMERA';
$('instruction').textContent = 'Play side by side';
$('detail').textContent = `60 seconds. Highest score wins. ${config.action}`;
$('setup-copy').textContent = 'Choose the left or right side of the mirrored camera. Stay on your side with both shoulders and hands visible. Each player brings their hands together for one second, then lowers them.';
$('control-help').textContent = `${config.action} Stay on your chosen side. Either player can hold both hands up to pause. Both players must be visible with hands lowered before resuming. Losing one board lets the other player continue.`;
$('control-help').nextElementSibling.textContent = 'Lower your left hand between actions. Hold both hands up for one second to pause. Lower both players’ hands and press Resume to continue.';
$('tracking').textContent = 'Left player · camera off'; $('movement').textContent = 'Right player · camera off'; $('hand').hidden = true;
$('score').previousElementSibling.textContent = 'TIME'; $('score').textContent = '60s';
const rightHost = document.createElement('div'); rightHost.id = 'source-game-right'; rightHost.inert = true; rightHost.setAttribute('aria-hidden','true'); $('arena').append(rightHost);
const listeners = new Set(), audio = new DuelAudio();
let phase = 'idle', session = null, round = crypto.randomUUID(), countdownAt = null, countdownId = 0;
let elapsed = 0, previousTime = null, disposed = false, raf = 0;
const storage = {get: (_key, fallback) => fallback, set() {}, remove() {}};
const sound = {play(name) {audio.effect(name === 'fail' ? 'crash' : name === 'success' ? 'clear' : 'jump');}, stop() {}, setMuted(value) {audio.setMuted(value);}, get muted() {return audio.muted;}};
const players = [0,1].map((lane) => {
  const game = modules[config.slug].mount(lane ? rightHost : $('source-game'), {storage, sound, random: seededRandom(1), reportScore() {}, reportComplete() {}, isReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches});
  game.pause();
  return {label: lane ? 'Right' : 'Left', game, canvas: (lane ? rightHost : $('source-game')).querySelector('canvas'),
    recognizer: new BodyArcadeRecognizer(config), gestures: new BodyGestures({oneHandSide:'left',handsTogether:true}), gate: new HandsStartGate({gesture:'hands-together'}),
    action: null, pose: null, hands: null, feed: null, finished: false, overlay: document.createElement('canvas')};
});
const scores = () => players.map(player => duelScore(config.slug, player.game.getState()));
const fresh = player => player.pose && performance.now() - player.pose.tMs < 250 && validAction(player.action);
const bothReady = () => players.every(player => fresh(player) && player.hands?.neutral);
function setPhase(next) {
  phase = next; previousTime = null; $('arena').dataset.phase = next;
  $('panel').hidden = ['playing','paused'].includes(next);
  $('setup-copy').hidden = next === 'complete';
  $('pause').disabled = !['playing','paused'].includes(next);
  $('pause').textContent = next === 'paused' ? 'Resume' : 'Pause';
  $('recalibrate').disabled = !camera.running || next === 'complete';
  $('finish').hidden = !['playing','paused'].includes(next);
  listeners.forEach(callback => callback());
}
function pause(reason = 'Paused. Lower both players’ hands, then resume.') {
  if (phase !== 'playing') return;
  players.forEach(player => {player.game.pause(); player.recognizer.release();});
  audio.stop(); setPhase('paused'); $('cue').textContent = reason;
}
function resume() {
  if (phase !== 'paused') return;
  if (!bothReady()) { $('cue').textContent = 'Both players: return to your sides and lower both hands before resuming.'; return; }
  players.forEach(player => {player.recognizer.release(); if (!player.finished) player.game.resume();});
  setPhase('playing');
}
function finish() {
  if (!['playing','paused'].includes(phase)) return;
  players.forEach(player => player.game.pause());
  const result = scores(); setPhase('complete'); camera.stop('complete'); audio.stop();
  $('instruction').textContent = duelResult(result);
  $('detail').textContent = `Left ${result[0]} · Right ${result[1]} · ${Math.round(elapsed / 1000)} seconds played`;
  $('start').textContent = 'Play again'; $('start').hidden = false; $('stop').hidden = true;
}
const camera = new PoseCamera({video:$('camera'), players:2, inferenceTimeoutMs:3000,
  onStatus(status) {
    if (status.state === 'requesting') {
      session = status; round = status.sessionId; elapsed = 0; countdownAt = null; countdownId++;
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      players.forEach((player, lane) => {
        const identity = status.players[lane]; player.recognizer.reset(identity); player.gestures.reset(identity); player.gate.reset(identity);
        player.feed = createBodyInput(identity, player.game); player.pose = player.action = player.hands = null; player.finished = false;
        // Both boards start from the same random sequence on every attempt.
        player.game.destroy();
        const host = lane ? rightHost : $('source-game');
        player.game = modules[config.slug].mount(host, {storage,sound,random:seededRandom(seed),reportScore() {},reportComplete() {},isReducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});
        player.game.pause(); player.canvas = host.querySelector('canvas'); player.feed = createBodyInput(identity, player.game);
      });
      setPhase('setup'); $('start').hidden = true; $('stop').hidden = false; $('camera-error').hidden = true;
      $('instruction').textContent = 'Allow your camera'; $('detail').textContent = 'One camera tracks both players locally.';
    } else if (status.state === 'loading') { $('instruction').textContent = 'Preparing movement tracking'; }
    else if (status.state === 'ready') { $('instruction').textContent = 'Choose your sides'; $('detail').textContent = 'Sit or stand still with hands lowered to calibrate both players.'; }
  },
  onPlayers(frames) {
    if (disposed || ['idle','complete'].includes(phase) || frames.some(frame => performance.now() - frame.tMs >= 250)) return;
    players.forEach((player, lane) => {
      if (phase !== 'playing') player.recognizer.release();
      player.pose = frames[lane]; player.action = player.recognizer.update(frames[lane]);
      player.gestures.handsTogether = !player.gate.open; player.hands = player.gestures.update(frames[lane]);
      if (phase === 'setup') player.gate.update(frames[lane], validAction(player.action), performance.now(), player.hands);
    });
    if (phase === 'setup') {
      const ready = bothReady() && players.every(player => player.gate.open);
      if (!ready) { countdownAt = null; audio.stop(); }
      else {
        if (countdownAt === null) {countdownAt = frames[0].tMs; countdownId++;}
        const left = 3000 - frames[0].tMs + countdownAt;
        $('instruction').textContent = `Starting in ${Math.max(1, Math.ceil(left / 1000))}`;
        $('detail').textContent = 'Both players: keep your hands lowered.';
        if (left <= 0) { players.forEach(player => {player.recognizer.release(); player.game.resume();}); setPhase('playing'); }
      }
    }
    // Observe both players before forwarding either action, so pause never scores.
    if (phase === 'playing' && players.some(player => !fresh(player))) pause('Tracking paused. Both players: return to your sides, lower hands, then resume.');
    if (players.some(player => player.hands?.event?.kind === 'both-hands')) {
      if (phase === 'playing') pause();
      else if (phase === 'paused') $('cue').textContent = 'Lower both players’ hands, then press Resume.';
      return;
    }
    if (phase === 'playing') players.forEach(player => {if (!player.finished && fresh(player)) player.feed(player.action);});
  },
  onStop({reason}) {
    audio.stop(); countdownAt = null;
    players.forEach(player => {player.pose = null; player.action = null; player.game.pause(); player.recognizer.release();});
    $('stop').hidden = true; $('recalibrate').disabled = true;
    if (!['complete','dispose'].includes(reason)) {
      setPhase('idle'); $('instruction').textContent = 'Camera stopped'; $('detail').textContent = 'Enable the camera to start a fresh duel.';
      $('start').textContent = 'Enable camera & play'; $('start').hidden = false;
    }
  },
  onError(error) {
    $('instruction').textContent = 'Camera unavailable';
    $('camera-error').textContent = error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow access and try again.' : error.message;
    $('camera-error').hidden = false;
  },
});
$('start').onclick = () => {audio.activate(); void camera.start();};
$('stop').onclick = () => camera.stop('stopped');
$('pause').onclick = () => phase === 'playing' ? pause() : resume();
$('finish').onclick = finish;
const mute = document.createElement('button'); mute.id = 'duel-sound'; mute.textContent = 'Sound on'; mute.setAttribute('aria-pressed','true'); mute.setAttribute('aria-label','Game sound');
mute.onclick = () => {audio.setMuted(!audio.muted); mute.textContent = audio.muted ? 'Sound off' : 'Sound on'; mute.setAttribute('aria-pressed', String(!audio.muted));};
$('pause').after(mute);
$('recalibrate').onclick = () => {
  if (!camera.running || phase === 'complete') return;
  players.forEach(player => {player.game.pause(); player.recognizer.recalibrate(); player.gestures.reset(player.gate.session); player.gate.reset(player.gate.session);});
  countdownAt = null; countdownId++; audio.stop(); setPhase('setup');
};
setupFullscreen($('arena'), $('fullscreen'), text => {$('cue').textContent = text;});

function statusFor(player) {
  if (player.finished) return 'Board finished';
  if (!fresh(player)) return player.action?.phase === 'calibrating' ? 'Stay still to calibrate' : 'Show shoulders and hands on your side';
  if (phase === 'setup' && !player.gate.open) return player.gate.stage === 'lower' ? 'Lower both hands' : player.gate.stage === 'waiting' ? 'Keep hands visible' : 'Bring hands together for one second';
  return phase === 'setup' ? 'Ready · keep hands lowered' : 'Tracked · on device';
}
function render(now) {
  if (disposed) return;
  if (phase === 'playing' && players.some(player => !fresh(player))) pause('Tracking paused. Both players: return to your sides, lower hands, then resume.');
  if (phase === 'playing') {
    if (previousTime !== null) elapsed += now - previousTime;
    previousTime = now;
    players.forEach(player => {if (['lost','won'].includes(player.game.getState().phase)) {player.finished = true; player.game.pause();}});
    if (elapsed >= DUEL_DURATION_MS || players.every(player => player.finished)) finish();
  }
  $('score').textContent = `${Math.max(0,Math.ceil((DUEL_DURATION_MS - elapsed) / 1000))}s`;
  $('tracking').textContent = `Left · ${statusFor(players[0])}`; $('movement').textContent = `Right · ${statusFor(players[1])}`;
  if (phase === 'playing') $('cue').textContent = config.action;
  if (phase === 'setup' && countdownAt === null) { $('instruction').textContent = 'Get ready together'; $('detail').textContent = 'Each player: calibrate, bring hands together, then lower both hands.'; }
  audio.update({phase: phase === 'playing' ? 'running' : phase === 'setup' && countdownAt !== null ? 'countdown' : 'idle',count:Math.max(1,Math.ceil((3000 - now + (countdownAt ?? now)) / 1000)),countdownId});
  const canvas = $('world'), width = canvas.clientWidth, height = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1,2);
  if (canvas.width !== Math.round(width*dpr) || canvas.height !== Math.round(height*dpr)) {canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);}
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.fillStyle = '#102c33'; ctx.fillRect(0,0,width,height);
  const video = $('camera');
  if (camera.running && video.readyState >= 2) {
    const scale = Math.min(width/video.videoWidth,height/video.videoHeight), w = video.videoWidth*scale, h = video.videoHeight*scale;
    ctx.save(); ctx.translate((width+w)/2,(height-h)/2); ctx.scale(-1,1); ctx.drawImage(video,0,0,w,h);
    for (const player of players) {
      player.overlay.getBoundingClientRect = () => ({width:w,height:h});
      drawBody(player.overlay, fresh(player) ? player.pose : null); ctx.drawImage(player.overlay,0,0,w,h);
    }
    ctx.restore();
  }
  const footer = height - document.querySelector('.controls').getBoundingClientRect().top;
  $('cue').style.bottom = `${footer+12}px`;
  $('arena').style.setProperty('--ar-hud-bottom', `${document.querySelector('.hud').getBoundingClientRect().bottom}px`);
  const toolbarBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hopmodo-controls-bottom')) || 0;
  const top = Math.max($('movement').parentElement.getBoundingClientRect().bottom, toolbarBottom) + 52;
  const bottom = footer + 66, available = Math.max(50,height-top-bottom);
  ctx.strokeStyle = '#fff8e9aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(width/2,top-24); ctx.lineTo(width/2,height-bottom); ctx.stroke();
  const values = scores();
  players.forEach((player,lane) => {
    const half = width/2, left = lane*half, scale = Math.min((half-24)/player.canvas.width,available/player.canvas.height);
    const w = player.canvas.width*scale, h = player.canvas.height*scale;
    if (['playing','paused','complete'].includes(phase)) ctx.drawImage(player.canvas,left+(half-w)/2,top+(available-h)/2,w,h);
    ctx.fillStyle = lane ? '#ffe19a' : '#c9f8a6'; ctx.font = `700 ${width < 600 ? 14 : 22}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(`${player.label} · ${values[lane]} points`,left+half/2,top-10,half-14);
    if (player.finished) {ctx.font = '14px system-ui'; ctx.fillText('Board finished',left+half/2,top+20,half-14);}
  });
  ctx.fillStyle = '#102c33'; ctx.fillRect(width/2-24,top-32,48,28);
  ctx.fillStyle = '#fff8e9'; ctx.font = '700 16px system-ui'; ctx.textAlign = 'center'; ctx.fillText($('score').textContent,width/2,top-12);
  raf = requestAnimationFrame(render);
}
function dispose() {
  if (disposed) return; disposed = true; camera.stop('dispose'); audio.dispose(); players.forEach(player => player.game.destroy()); cancelAnimationFrame(raf); listeners.clear();
}
window.addEventListener('pagehide',dispose,{once:true});
window.gameplay = {
  getFrame: () => ({round,sessionId:session?.sessionId,source:session?.source,phase,canvas:$('world'),video:$('camera'),isAR:true,audio:audio.getAudioStream(),
    score:`Left ${scores()[0]} · Right ${scores()[1]}`,recognition:{mode:'duel',players:players.map(player => ({sessionId:player.pose?.sessionId,action:player.action,start:player.gate.stage}))}}),
  subscribe(callback) {listeners.add(callback); return () => listeners.delete(callback);},
  configureHost({homeURL,recordingNote}) {if(homeURL)$('home').href=homeURL; if(recordingNote)$('privacy-note').textContent=recordingNote;}, dispose,
};
window.integAR = {getState: () => ({phase,round,elapsed,camera:camera.running,players:players.map(player => ({game:player.game.getState(),score:duelScore(config.slug,player.game.getState()),sessionId:player.gate.session?.sessionId,pose:player.pose,action:player.action,start:player.gate.stage,finished:player.finished}))})};
const solo = document.createElement('a'); solo.id = 'solo-mode'; solo.textContent = 'One player';
const soloURL = new URL(location.href); soloURL.searchParams.delete('mode'); solo.href = soloURL.href;
mountGameEntry({root:$('arena'),gameId:config.id,title:`${config.title} · Two players`,description:'Play side by side for 60 seconds. Each player has their own board and score. Highest score wins.',buttons:[$('start')],options:[solo]});
document.querySelector('[data-entry-start]').textContent = 'Both players: bring hands together for one second, then lower them for the shared countdown.';
raf = requestAnimationFrame(render);
}
