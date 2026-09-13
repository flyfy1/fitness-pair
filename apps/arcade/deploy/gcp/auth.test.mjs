import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createAccountStore} from './account-store.mjs';
import {createAuth} from './auth.mjs';

const origin = 'https://fitness.example.test', issuer = 'https://identity.example.test';
const getCookie = (response, name) => response.headers.get('set-cookie').match(new RegExp(`${name}=([^;]*)`))[1];
test('PKCE login verifies state, resolves central identity server-side, persists the product session and revokes logout', async t => {
  const directory = await mkdtemp(tmpdir() + '/hopmodo-auth-');
  t.after(() => rm(directory, {recursive: true, force: true}));
  let challenge, network = 0, now = 1000;
  const store = createAccountStore(directory), config = {origin, issuer, clientId: 'hopmodo', clientSecret: 's'.repeat(40), store, now: () => now,
    fetcher: async (url, options) => {
      network++;
      if (url.pathname === '/token') {
        assert.equal(options.headers.Authorization, 'Basic ' + Buffer.from('hopmodo:' + 's'.repeat(40)).toString('base64'));
        assert.equal(options.body.get('redirect_uri'), origin + '/api/auth/callback');
        assert.equal(createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'), challenge);
        return Response.json({access_token: 'server-only-token'});
      }
      assert.equal(url.href, issuer + '/userinfo');
      assert.equal(options.headers.Authorization, 'Bearer server-only-token');
      return Response.json({sub: 'central-user', email: 'player@example.test'});
    }};
  const auth = createAuth(config), request = (path, options) => new Request(origin + path, options);
  async function start() {
    const response = await auth.handle(request('/api/auth/start?returnTo=' + encodeURIComponent('/library?publish=550e8400-e29b-41d4-a716-446655440000')));
    const target = new URL(response.headers.get('location'));
    challenge = target.searchParams.get('code_challenge');
    assert.equal(target.searchParams.get('ui_locales'), 'en');
    assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
    assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax.*Secure/);
    return {state: target.searchParams.get('state'), headers: {Cookie: '__Host-hopmodo_login=' + getCookie(response, '__Host-hopmodo_login')}};
  }
  let tx = await start();
  const invalid = await auth.handle(request('/api/auth/callback?code=x&state=wrong', {headers: tx.headers}));
  assert.equal(invalid.headers.get('location'), '/shared?login=expired'); assert.equal(network, 0);
  tx = await start();
  const callbackPath = '/api/auth/callback?code=single-use&state=' + tx.state;
  const response = await auth.handle(request(callbackPath, {headers: tx.headers}));
  assert.equal(response.headers.get('location'), '/library?publish=550e8400-e29b-41d4-a716-446655440000');
  assert.equal(network, 2);
  assert.equal((await auth.handle(request(callbackPath, {headers: tx.headers}))).headers.get('location'), '/shared?login=expired');
  const cookie = '__Host-hopmodo_session=' + getCookie(response, '__Host-hopmodo_session');
  const restarted = createAuth(config), sessionRequest = request('/api/auth/session', {headers: {Cookie: cookie}});
  const session = await (await restarted.handle(sessionRequest)).json();
  assert.deepEqual(session.user, {email: 'player@example.test'});
  assert.equal(JSON.stringify(session).includes('server-only-token'), false);
  await assert.rejects(restarted.requireUser(request('/api/clips/x', {method: 'PUT', headers: {Cookie: cookie, Origin: 'https://attacker.test', 'X-CSRF-Token': session.csrfToken}}), true), {status: 403});
  await assert.rejects(restarted.requireUser(request('/api/clips/x', {method: 'PUT', headers: {Cookie: cookie, Origin: origin}}), true), {status: 403});
  await restarted.handle(request('/api/auth/logout', {method: 'POST', headers: {Cookie: cookie, Origin: origin, 'X-CSRF-Token': session.csrfToken}}));
  assert.equal((await (await restarted.handle(sessionRequest)).json()).user, null);
  tx = await start(); now += 600001;
  assert.equal((await auth.handle(request('/api/auth/callback?code=x&state=' + tx.state, {headers: tx.headers}))).headers.get('location'), '/shared?login=expired');
  const external = await auth.handle(request('/api/auth/start?returnTo=https://attacker.test'));
  const state = new URL(external.headers.get('location')).searchParams.get('state');
  const cancelled = await auth.handle(request('/api/auth/callback?error=access_denied&state=' + state, {headers: {Cookie: '__Host-hopmodo_login=' + getCookie(external, '__Host-hopmodo_login')}}));
  assert.equal(cancelled.headers.get('location'), '/shared?login=cancelled');
});
