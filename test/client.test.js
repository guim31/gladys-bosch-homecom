// -----------------------------------------------------------------------------
// The Bosch cloud client: bulk reads (chunks of 30, per-path statuses), token
// refresh, refused tokens, rate limit.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthError } from '../src/bosch/auth.js';
import { ApiError, BoschCloud, MAX_BULK_PATHS } from '../src/bosch/client.js';
import { Store } from '../src/store.js';
import { GATEWAY, createFakeBosch } from './helpers/fakeBosch.js';

async function setup({ refreshToken = 'r-0' } = {}) {
  const bosch = createFakeBosch({ refreshToken });
  const store = new Store(mkdtempSync(join(tmpdir(), 'bosch-client-')));
  await store.set('auth', { refresh_token: refreshToken, brand: 'bosch' });
  return { bosch, store, cloud: new BoschCloud({ fetch: bosch.fetch, store }) };
}

test('a bulk read is split in chunks of 30 paths, and 404 paths are left out', async () => {
  const { bosch, cloud } = await setup();
  const paths = Array.from({ length: 40 }, (_, i) => `/unknown/${i}`).concat('/heatingCircuits');
  const result = await cloud.bulk(GATEWAY.K40, paths);
  assert.deepEqual(Object.keys(result), ['/heatingCircuits']);
  const bulks = bosch.apiCalls().filter((call) => call.url.endsWith('/bulk'));
  assert.deepEqual(
    bulks.map((call) => JSON.parse(call.body)[0].resourcePaths.length),
    [MAX_BULK_PATHS, 11],
  );
});

test('the access token is refreshed once for concurrent requests, and kept in memory only', async () => {
  const { bosch, cloud, store } = await setup();
  await Promise.all([
    cloud.getGateways(),
    cloud.getGateways(),
    cloud.bulk(GATEWAY.K40, ['/dhwCircuits']),
  ]);
  const refreshes = bosch.calls.filter((call) => call.url.includes('singlekey-id'));
  assert.equal(refreshes.length, 1);
  assert.equal(store.get('auth').refresh_token, bosch.state.refreshToken);
  assert.ok(!JSON.stringify(store.data).includes(bosch.state.accessToken));
});

test('a refresh token Bosch refuses is an AuthError (a new login is needed)', async () => {
  const { bosch, cloud } = await setup();
  bosch.state.revoked = true;
  await assert.rejects(cloud.getGateways(), AuthError);
});

test('an HTTP error or a rate limit is an ApiError with its status', async () => {
  const { bosch, cloud } = await setup();
  await cloud.getGateways();
  bosch.state.rateLimited = true;
  await assert.rejects(cloud.getGateways(), (err) => err instanceof ApiError && err.status === 429);
  bosch.state.rateLimited = false;
  await assert.rejects(
    cloud.put(GATEWAY.K40, '/heatingCircuits/hc1/roomtemperature', 3),
    (err) => err.status === 403,
  );
});

test('a write sends { value } to the resource path', async () => {
  const { bosch, cloud } = await setup();
  await cloud.put(GATEWAY.K40, '/dhwCircuits/dhw1/charge', 'start');
  const call = bosch.apiCalls().at(-1);
  assert.equal(call.method, 'PUT');
  assert.ok(call.url.endsWith(`/gateways/${GATEWAY.K40}/resource/dhwCircuits/dhw1/charge`));
  assert.deepEqual(JSON.parse(call.body), { value: 'start' });
});
