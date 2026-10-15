// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, the fake Bosch cloud, a
// temporary /data, and the integration wired on top through registerHandlers.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { createFakeBosch } from './fakeBosch.js';

// The integration logs its lifecycle: keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows it.
process.env.LOG_LEVEL ??= 'silent';

export const STORED_REFRESH_TOKEN = 'refresh-stored-secret-0001';

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {boolean} [options.linked] an account linked before (refresh token in /data)
 * @param {string[]} [options.gateways] fixture gateways on the account
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {string} [options.dataDir]
 */
export async function createWorld({
  config = {},
  linked = true,
  gateways,
  connect = true,
  timers = false,
  devices = [],
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-bosch-')),
  bosch = createFakeBosch({ gateways, refreshToken: linked ? STORED_REFRESH_TOKEN : undefined }),
} = {}) {
  const store = new Store(dataDir);
  if (linked) {
    await store.set('auth', { refresh_token: STORED_REFRESH_TOKEN, brand: 'bosch' });
  }
  const gladys = createFakeGladys({ config: { language: 'en', ...config }, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    fetch: bosch.fetch,
    timers,
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, bosch, app, dataDir };
}

/** The user adds every discovered device in Gladys. */
export async function createAll(gladys) {
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(device);
  }
}

/** The external id of a fixture device. */
export const ids = (gladys, type, gatewayId, circuitId) =>
  gladys.externalIds(type, circuitId ? `${gatewayId}-${circuitId}` : gatewayId);
