export function mountTrackingLoader(container) {
  container.innerHTML = `<div class="tracking-copy"><strong id="tracking-title" role="status">Getting movement controls ready</strong><span id="tracking-detail">Camera stays off until you choose to play.</span></div><div class="tracking-download"><progress aria-label="Movement controls download"></progress><span id="tracking-bytes"></span></div><button type="button">Cancel download</button>`;
  const title = container.querySelector('#tracking-title');
  const detail = container.querySelector('#tracking-detail');
  const bytes = container.querySelector('#tracking-bytes');
  const bar = container.querySelector('progress');
  const button = container.querySelector('button');
  const set = (element, text) => { if (element.textContent !== text) element.textContent = text; };
  let worker, timer, deadline;
  function stop() { worker?.terminate(); worker = null; clearTimeout(timer); clearTimeout(deadline); }
  function retryState(message) {
    stop(); set(title, message); set(detail, 'Keep exploring, or retry when you’re ready.');
    bar.hidden = true; bytes.textContent = ''; button.hidden = false; button.textContent = 'Retry download';
  }
  function start() {
    stop(); bar.hidden = false; bar.removeAttribute('value'); button.hidden = false; button.textContent = 'Cancel download';
    set(title, 'Getting movement controls ready'); set(detail, 'Camera stays off until you choose to play.');
    try {
      worker = new Worker('/runtime/pose-worker.js');
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') {
          if (data.state === 'downloading') set(title, 'Downloading movement controls');
          else if (data.state === 'checking') set(title, 'Checking movement controls');
          if (data.total > 0) { bar.max = data.total; bar.value = data.loaded; }
          else bar.removeAttribute('value');
          const mb = value => (value / 1_000_000).toFixed(1);
          bytes.textContent = data.total > 0 ? `${Math.floor(data.loaded / data.total * 100)}% · ${mb(data.loaded)} / ${mb(data.total)} MB` : data.loaded ? `${mb(data.loaded)} MB received` : '';
        } else if (data.type === 'preloaded') {
          stop(); set(title, 'Movement controls ready');
          set(detail, data.persistent ? 'Saved on this device. Your browser may clear these files.' : 'This browser couldn’t save the files. Starting a game may download them again.');
          bar.hidden = true; bytes.textContent = ''; button.hidden = true;
        } else if (data.type === 'error') retryState(data.name === 'TimeoutError' ? 'Download took too long' : 'Download couldn’t finish');
      };
      worker.onerror = () => retryState('Download couldn’t finish');
      worker.postMessage({ type: 'preload', base: new URL('/', location.href).href });
      timer = setTimeout(() => set(detail, 'Still working. Slow connections can take a few minutes. You can keep browsing.'), 20_000);
      deadline = setTimeout(() => retryState('Download took too long'), 310_000);
    } catch { retryState('Download couldn’t start'); }
  }
  button.addEventListener('click', () => worker ? retryState('Download paused') : start());
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', event => { if (event.persisted) start(); });
  start();
}
