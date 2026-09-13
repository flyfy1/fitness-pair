import {listClips, updateClip} from './local-clips.js';

export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function accountAPI(path, options) {
  const response = await fetch(path, {credentials: 'same-origin', ...options});
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Please try again.'), {status: response.status});
  return data;
}
export const getSession = () => accountAPI('/api/auth/session');
export const loginURL = (returnTo = '/shared') => '/api/auth/start?returnTo=' + encodeURIComponent(returnTo);
export function storageLabel(bytes) {
  if (bytes < 1000) return `${bytes} B`;
  return bytes < 1_000_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}
export async function mountAccountNav() {
  const element = document.querySelector('[data-account-nav]');
  if (!element) return;
  try {
    const session = await getSession();
    if (!session.enabled) return;
    element.innerHTML = `<a class="account-link" href="${session.user ? '/shared' : loginURL()}">${session.user ? 'My shared clips' : 'Log in'}</a>`;
  } catch { element.innerHTML = '<a class="account-link" href="/shared">My account</a>'; }
}
export async function removeSharedClip(id, legacyKey) {
  const session = legacyKey ? null : await getSession();
  await accountAPI('/api/clips/' + encodeURIComponent(id), {method: 'DELETE', headers: legacyKey ?
    {Authorization: 'Bearer ' + legacyKey} : {'X-CSRF-Token': session.csrfToken || ''}});
  // A cloud removal succeeds even when this device cannot open its local library.
  try {
    const local = (await listClips()).find(clip => clip.id === id);
    if (local) { local.shared = false; await updateClip(local); }
  } catch { /* The local video is never removed by this action. */ }
}
export function confirmRemoval(container, action) {
  container.innerHTML = '<p>Remove this shared clip? Its link will stop working. Your local video will stay on this device.</p><div class="clip-actions"><button data-confirm-remove>Remove shared clip</button><button data-keep-clip>Keep clip</button></div><p role="status" data-remove-status></p>';
  container.querySelector('[data-keep-clip]').onclick = () => { container.innerHTML = ''; };
  const confirm = container.querySelector('[data-confirm-remove]');
  confirm.focus();
  confirm.onclick = async () => {
    confirm.disabled = true;
    container.querySelector('[data-keep-clip]').disabled = true;
    try { await action(); }
    catch (error) {
      container.querySelector('[data-remove-status]').textContent = error.message;
      confirm.disabled = false; container.querySelector('[data-keep-clip]').disabled = false;
    }
  };
}
export async function renderShared(container, notice = '') {
  container.innerHTML = '<div class="utility-head"><div><p class="kicker">Your Integ.Life account</p><h1>MY SHARED CLIPS.</h1><p>Manage the videos you published, from any device.</p></div><a class="button outline" href="/library">My local clips ↗</a></div><div data-account-body role="status">Loading your account…</div>';
  const body = container.querySelector('[data-account-body]');
  try {
    const session = await getSession();
    const loginState = new URLSearchParams(location.search).get('login');
    const loginMessage = {expired:'Your login attempt expired. Please start again.', cancelled:'Login cancelled. Your local clips are still here.', failed:'Login could not finish. Please try again.'}[loginState] || '';
    if (!session.enabled) { body.innerHTML = '<p>Account sharing is not available on this site yet. Your local clips are still available.</p>'; return; }
    if (!session.user) {
      body.innerHTML = `<div class="empty-state"><h2>YOUR CLIPS. YOUR ACCOUNT.</h2><p>${escapeHTML(loginMessage || 'Log in with Integ.Life to publish clips and manage what you share.')}</p><a class="button primary" href="${loginURL()}">Log in with Integ.Life ↗</a><p>2 GB of shared storage per account. Logging in does not upload your local videos.</p></div>`;
      return;
    }
    body.innerHTML = `<div class="account-summary"><p>Logged in as <strong>${escapeHTML(session.user.email)}</strong></p><button data-logout>Log out</button><p data-account-status role="status">${escapeHTML(notice || loginMessage)}</p></div><div data-shared-body>Loading your shared clips…</div>`;
    body.querySelector('[data-logout]').onclick = async event => {
      event.target.disabled = true;
      try { await accountAPI('/api/auth/logout', {method:'POST', headers:{'X-CSRF-Token':session.csrfToken}}); location.assign('/shared'); }
      catch (error) { body.querySelector('[data-account-status]').textContent = error.message; event.target.disabled = false; }
    };
    const account = await accountAPI('/api/account/clips');
    const content = body.querySelector('[data-shared-body]');
    content.innerHTML = `<section class="storage-summary" aria-label="Shared storage"><div><strong>${storageLabel(account.usedBytes)} of 2 GB used</strong><span>${storageLabel(Math.max(0, account.limitBytes - account.usedBytes))} available</span></div><meter min="0" max="${account.limitBytes}" value="${account.usedBytes}" aria-label="Shared storage used"></meter><p>Deleting clips frees space. Shared clips expire after 7 days. Each clip can be up to 90 seconds / 20 MiB.</p></section><div class="clip-grid" data-owned-clips></div>`;
    const grid = content.querySelector('[data-owned-clips]');
    if (!account.clips.length) { grid.innerHTML = '<div class="empty-state"><h2>NO SHARED CLIPS YET.</h2><p>Choose a video from My local clips to publish it here.</p><a class="text-link" href="/library">Open My local clips →</a></div>'; return; }
    for (const clip of account.clips) {
      const card = document.createElement('article'); card.className = 'clip-card';
      card.innerHTML = `${clip.unavailable ? '<p class="notice">This upload did not finish or is being removed. Remove it to release its reserved storage.</p>' : `<video controls playsinline preload="none" src="/api/media/${clip.id}" aria-label="${escapeHTML(clip.title)}"></video>`}<h3>${escapeHTML(clip.title)}</h3><p>${storageLabel(clip.bytes)} · Expires ${new Date(clip.expiresAt).toLocaleDateString()}</p><div class="clip-actions">${clip.unavailable ? '' : `<a href="/clips/${clip.id}">Open shared link ↗</a>`}<button data-remove>Remove</button></div><div data-confirmation></div>`;
      card.querySelector('[data-remove]').onclick = () => confirmRemoval(card.querySelector('[data-confirmation]'), async () => {
        await removeSharedClip(clip.id); await renderShared(container, 'Shared clip removed. Your storage has been updated.');
      });
      grid.append(card);
    }
  } catch (error) {
    body.innerHTML = `<div class="empty-state"><h2>COULDN’T LOAD YOUR SHARED CLIPS.</h2><p>${escapeHTML(error.message)}</p><a class="text-link" href="/shared">Try again ↻</a></div>`;
  }
}
