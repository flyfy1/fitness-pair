import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createAccountStore, ACCOUNT_LIMIT_BYTES, ANONYMOUS_LIMIT_BYTES} from './account-store.mjs';

test('2 GB is durable, isolated by account, atomic at the boundary, and freed on deletion or expiry', async t => {
  const directory = await mkdtemp(tmpdir() + '/hopmodo-quota-');
  t.after(() => rm(directory, {recursive: true, force: true}));
  let now = 1000;
  const options = {now: () => now}, store = createAccountStore(directory, options);
  const owner = 'a'.repeat(64), other = 'b'.repeat(64), id = randomUUID();
  await store.reserve(owner, {id, bytes: ACCOUNT_LIMIT_BYTES - 1, expiresAt: 2000});
  const race = await Promise.allSettled([1, 2].map(() => store.reserve(owner, {id: randomUUID(), bytes: 1, expiresAt: 3000})));
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(race.find(result => result.status === 'rejected').reason.status, 413);
  assert.equal((await store.list(owner)).usedBytes, ACCOUNT_LIMIT_BYTES);
  await assert.rejects(store.reserve(other, {id, bytes: 10, expiresAt: 3000}), {status: 409});
  await store.release(other, id);
  assert.equal((await store.list(owner)).usedBytes, ACCOUNT_LIMIT_BYTES);
  const restarted = createAccountStore(directory, options);
  assert.equal((await restarted.list(owner)).usedBytes, ACCOUNT_LIMIT_BYTES);
  assert.equal((await restarted.list(other)).usedBytes, 0);
  await restarted.reserve(other, {id: randomUUID(), bytes: ACCOUNT_LIMIT_BYTES, expiresAt: 3000});
  await restarted.release(owner, id);
  assert.equal((await restarted.list(owner)).usedBytes, 1);
  now = 3000;
  assert.equal((await restarted.list(owner)).usedBytes, 0);
  assert.equal((await restarted.list(other)).usedBytes, 0);
});


test('anonymous pool includes imported clips, persists reservations, and cannot exceed 10 GB', async t => {
  const directory = await mkdtemp(tmpdir() + '/hopmodo-anonymous-');
  t.after(() => rm(directory, {recursive: true, force: true}));
  let now = 1000;
  const store = createAccountStore(directory, {now: () => now});
  const legacy = {id: randomUUID(), bytes: ANONYMOUS_LIMIT_BYTES - 1, expiresAt: 2000};
  await store.syncAnonymous([legacy]); await store.syncAnonymous([legacy]);
  const race = await Promise.allSettled([1, 2].map(() => store.reserve(null, {id: randomUUID(), bytes: 1, expiresAt: 3000})));
  assert.equal(race.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(race.find(item => item.status === 'rejected').reason.status, 413);
  assert.equal((await createAccountStore(directory, {now: () => now}).list(null)).usedBytes, ANONYMOUS_LIMIT_BYTES);
  await store.reserve('a'.repeat(64), {id: randomUUID(), bytes: ACCOUNT_LIMIT_BYTES, expiresAt: 3000});
  await store.release('a'.repeat(64), legacy.id);
  assert.equal((await store.list(null)).usedBytes, ANONYMOUS_LIMIT_BYTES);
  await store.release(null, legacy.id);
  assert.equal((await store.list(null)).usedBytes, 1);
  now = 3000;
  assert.equal((await store.list(null)).usedBytes, 0);
});
