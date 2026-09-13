import {mountRecording} from './recording.js';
import './game-shell.css';

// Each game owns its stage and controls; the arcade owns entry, exit and replays.
export function mountGame(container, game) {
  document.body.classList.add('game-mode');
  container.innerHTML = `<main id="main" class="game-play" aria-label="${game.title}">
    <iframe id="game-frame" src="${game.path}" title="${game.title} game" allow="camera; fullscreen" referrerpolicy="same-origin"></iframe>
    <div class="game-replay-tools">
      <a class="back" href="/#arcade">← Back to the arcade</a>
      <div class="record-bar" id="record-panel"></div>
    </div>
    <section class="local-result" id="local-result" hidden></section>
  </main>`;
  const frame = container.querySelector('#game-frame');
  frame.addEventListener('load', () => connectHome(frame));
  mountRecording(game, frame);
}

function connectHome(frame) {
  const doc = frame.contentDocument;
  const brand = doc?.querySelector('.brand');
  if (!brand) return;

  let home = brand;
  if (brand.tagName !== 'A') {
    // Keep headings and game-specific brand layout intact inside the link.
    home = doc.createElement('a');
    brand.replaceWith(home);
    home.append(brand);
  }
  home.classList.add('arcade-home');
  home.href = '/#arcade';
  home.target = '_top';
  home.title = 'Back to the Hopmodo arcade';
  home.setAttribute('aria-label', 'Back to the Hopmodo arcade');
  const style = doc.createElement('style');
  style.textContent = `
    .arcade-home { color: inherit; text-decoration: none; pointer-events: auto; }
    .arcade-home:focus-visible { outline: 3px solid currentColor; outline-offset: 5px; }
  `;
  doc.head.append(style);
}
