import {randomBytes, createHash, timingSafeEqual} from 'node:crypto';
import {ACCOUNT_LIMIT_BYTES} from './account-store.mjs';

const random = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => timingSafeEqual(Buffer.from(hash(a || '')), Buffer.from(hash(b || '')));
const fail = (status, message) => Object.assign(new Error(message), {status});
const lifetime = 7 * 86400000;
const headers = {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'};
const json = (value, status = 200) => Response.json(value, {status, headers});
export function createAuth({origin, issuer, clientId, clientSecret, store, fetcher = fetch, now = Date.now}) {
  const secure = new URL(origin).protocol === 'https:';
  if (new URL(issuer).protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(new URL(issuer).hostname)) throw Error('HTTPS identity provider required');
  if (!clientId || clientSecret?.length < 32) throw Error('OAuth client is not configured');
  const callback = origin + '/api/auth/callback';
  const sessionName = secure ? '__Host-hopmodo_session' : 'hopmodo_session';
  const transactionName = secure ? '__Host-hopmodo_login' : 'hopmodo_login';
  const cookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const cookies = request => Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(item => item.trim().split('=')));
  const transactions = new Map();
  function returnPath(raw) {
    try {
      const url = new URL(raw || '/shared', origin);
      if (url.origin !== origin || !/^\/(?:admin\/games|library|shared|gallery|clips\/[a-f0-9-]{36})?$/.test(url.pathname)) return '/shared';
      // Only the local clip selector survives login; arbitrary redirects and credentials do not.
      const clip = url.searchParams.get('publish');
      return url.pathname + (url.pathname === '/library' && /^[a-f0-9-]{36}$/.test(clip || '') ? '?publish=' + clip : '');
    } catch { return '/shared'; }
  }
  function redirect(location, setCookies = []) {
    const result = new Headers({...headers, Location: location});
    for (const value of setCookies) result.append('Set-Cookie', value);
    return new Response(null, {status: 303, headers: result});
  }
  async function user(request, write = false) {
    const token = cookies(request)[sessionName];
    if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return null;
    const session = await store.read('sessions', hash(token));
    if (!session || session.expiresAt <= now()) return null;
    if (write && (request.headers.get('Origin') !== origin || !equal(request.headers.get('X-CSRF-Token'), session.csrf)))
      throw fail(403, 'Refresh this page before trying again.');
    return session;
  }
  async function requireUser(request, write = false) {
    const session = await user(request, write);
    if (!session) throw fail(401, 'Log in with Integ.Life to manage your shared clips.');
    return session;
  }
  return {user, requireUser, ...Object.fromEntries(['list', 'reserve', 'release', 'syncAnonymous', 'anonymousEvictions'].map(key => [key, store[key]])),
    async handle(request) {
      const url = new URL(request.url), path = url.pathname;
      if (!path.startsWith('/api/auth/')) return null;
      if (path === '/api/auth/session' && request.method === 'GET') {
        const session = await user(request);
        return json({enabled: true, user: session ? {email: session.email} : null, csrfToken: session?.csrf || null, limitBytes: ACCOUNT_LIMIT_BYTES});
      }
      if (path === '/api/auth/start' && request.method === 'GET') {
        for (const [key, tx] of transactions) if (tx.expiresAt <= now()) transactions.delete(key);
        if (transactions.size >= 1000) throw fail(429, 'Login is busy. Please try again shortly.');
        const old = cookies(request)[transactionName]; if (old) transactions.delete(old);
        const transaction = random(), state = random(), verifier = random();
        transactions.set(transaction, {state, verifier, next: returnPath(url.searchParams.get('returnTo')), expiresAt: now() + 600000});
        const target = new URL('/authorize', issuer);
        target.search = new URLSearchParams({response_type: 'code', client_id: clientId, redirect_uri: callback, state,
          code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', ui_locales: /^zh(?:-|$)/i.test(url.searchParams.get('lang') || '') ? 'zh-CN' : 'en', theme: clientId});
        return redirect(target.href, [cookie(transactionName, transaction, 600)]);
      }
      if (path === '/api/auth/callback' && request.method === 'GET') {
        const token = cookies(request)[transactionName], tx = transactions.get(token);
        transactions.delete(token); // Single use, including failed exchanges and cancelled login.
        const clear = cookie(transactionName, '', 0);
        if (!tx || tx.expiresAt <= now() || !equal(tx.state, url.searchParams.get('state')))
          return redirect('/shared?login=expired', [clear]);
        if (url.searchParams.has('error')) return redirect(tx.next + (tx.next.includes('?') ? '&' : '?') + 'login=cancelled', [clear]);
        const code = url.searchParams.get('code');
        if (!code || code.length > 2048) return redirect('/shared?login=failed', [clear]);
        try {
          const response = await fetcher(new URL('/token', issuer), {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
            headers: {Authorization: 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({grant_type: 'authorization_code', code, redirect_uri: callback, code_verifier: tx.verifier})});
          if (!response.ok) throw Error('Token exchange failed');
          const access = (await response.json()).access_token;
          if (typeof access !== 'string' || !access || access.length > 10000) throw Error('Invalid access token');
          const identity = await fetcher(new URL('/userinfo', issuer), {headers: {Authorization: 'Bearer ' + access}, redirect: 'error', signal: AbortSignal.timeout(15000)});
          if (!identity.ok) throw Error('Identity lookup failed');
          const profile = await identity.json();
          if (typeof profile.sub !== 'string' || !profile.sub || profile.sub.length > 512 || typeof profile.email !== 'string' || profile.email.length > 320 || !profile.email.includes('@')) throw Error('Invalid identity');
          const session = random();
          await store.write('sessions', hash(session), {userId: hash(issuer + '\n' + profile.sub), email: profile.email, csrf: random(), expiresAt: now() + lifetime});
          const previous = cookies(request)[sessionName];
          if (/^[A-Za-z0-9_-]{43}$/.test(previous || '')) await store.remove('sessions', hash(previous));
          return redirect(tx.next, [clear, cookie(sessionName, session, lifetime / 1000)]);
        } catch { return redirect('/shared?login=failed', [clear]); }
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        await requireUser(request, true);
        await store.remove('sessions', hash(cookies(request)[sessionName]));
        const result = json({ok: true}); result.headers.append('Set-Cookie', cookie(sessionName, '', 0)); return result;
      }
      return json({error: 'Not found.'}, 404);
    }
  };
}
