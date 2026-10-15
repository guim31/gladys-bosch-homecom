// -----------------------------------------------------------------------------
// The integration end to end, on the SDK's fake Gladys and the fake Bosch
// cloud: account link, discovery, refresh without the core's onPoll,
// commands within the real bounds, fault trigger, expired login, outages.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { HEARTBEAT_MS } from '../src/app.js';
import { MESSAGES } from '../src/i18n.js';
import { GATEWAY, createFakeBosch } from './helpers/fakeBosch.js';
import { STORED_REFRESH_TOKEN, createAll, createWorld, ids } from './helpers/world.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Wait (real time) until the condition holds: file writes are not microtasks. */
async function waitFor(condition, what) {
  for (let i = 0; i < 500; i += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`timed out waiting for ${what}`);
}

const feature = (gladys, type, gatewayId, circuitId, key) =>
  ids(gladys, type, gatewayId, circuitId).feature(key);

/** Run a command the way Gladys does, resolve with its ack. */
function command(gladys, featureId, value) {
  const device = gladys.fake.discoveredDevices.find((d) =>
    featureId.startsWith(`${d.external_id}:`),
  );
  const target = device.features.find((f) => f.external_id === featureId);
  return gladys.fake.setValue(device, target, value);
}

test('an account is linked with the code of the login address the integration handed out', async () => {
  const { gladys, bosch, app, dataDir } = await createWorld({ linked: false });
  try {
    assert.deepEqual(gladys.fake.connectionStatus, {
      connected: false,
      message: MESSAGES.notLinked,
    });
    assert.equal(gladys.fake.discoveredDevices.length, 0);
    assert.equal(bosch.calls.length, 0, 'nothing is asked to Bosch before the link');

    // "Connect": the login address, its verifier kept in /data.
    const ack = await gladys.fake.oauthAuthorizeUrl('bosch_account');
    assert.equal(ack.success, true);
    const url = ack.data.authorize_url;
    assert.match(url, /^https:\/\/singlekey-id\.com\/auth\/connect\/authorize\?/);

    // The user signs in and pastes the whole failed address.
    const code = bosch.signIn(url);
    await gladys.fake.configUpdated({
      ...gladys.fake.config,
      auth_code: `com.bosch.tt.dashtt.pointt://app/login?code=${code}&state=abc`,
    });
    assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
    assert.equal(gladys.fake.discoveredDevices.length, 10);

    // The refresh token is in /data, readable by the integration only; the
    // configuration holds no token.
    const file = join(dataDir, 'bosch-homecom.json');
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.auth.refresh_token, bosch.state.refreshToken);
    assert.equal(saved.login, undefined, 'the verifier is forgotten once used');
    assert.ok(!JSON.stringify(saved).includes(bosch.state.accessToken), 'no access token on disk');
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.ok(!JSON.stringify(gladys.fake.config).includes('refresh'));

    // The same code saved again is not sent twice.
    const tokenCalls = bosch.calls.filter((c) => c.url.includes('singlekey-id')).length;
    await gladys.fake.configUpdated({ ...gladys.fake.config, refresh_minutes: 10 });
    assert.equal(bosch.calls.filter((c) => c.url.includes('singlekey-id')).length, tokenCalls);
    assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  } finally {
    await app.stop();
  }
});

test('a refused or foreign code says what to do', async () => {
  const { gladys, bosch, app } = await createWorld({ linked: false });
  try {
    // A code captured elsewhere (no "Connect" here first).
    await gladys.fake.configUpdated({ ...gladys.fake.config, auth_code: 'FOREIGN-1' });
    assert.deepEqual(gladys.fake.connectionStatus.message, MESSAGES.noLoginStarted);

    // A code of another login: Bosch refuses it.
    const { data } = await gladys.fake.oauthAuthorizeUrl('bosch_account');
    bosch.signIn(data.authorize_url);
    await gladys.fake.configUpdated({ ...gladys.fake.config, auth_code: 'WRONG-1' });
    assert.deepEqual(gladys.fake.connectionStatus.message, MESSAGES.codeRefused);

    // A new login works.
    const again = await gladys.fake.oauthAuthorizeUrl('bosch_account');
    const code = bosch.signIn(again.data.authorize_url);
    await gladys.fake.configUpdated({ ...gladys.fake.config, auth_code: code });
    assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  } finally {
    await app.stop();
  }
});

test('the bulk reads never carry the /resource prefix, and a gateway costs two reads', async () => {
  const { gladys, bosch, app } = await createWorld({ gateways: [GATEWAY.K40] });
  try {
    const bulks = bosch.apiCalls().filter((call) => call.url.endsWith('/bulk'));
    assert.equal(bulks.length, 2, 'roots, then the circuits');
    for (const call of bulks) {
      const [request] = JSON.parse(call.body);
      assert.ok(request.resourcePaths.length <= 30);
      assert.ok(request.resourcePaths.every((path) => !path.startsWith('/resource')));
    }
    assert.equal(gladys.fake.discoveredDevices.length, 3);
  } finally {
    await app.stop();
  }
});

test('the states refresh on the container timer, without the core calling onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  const { gladys, bosch, app } = await createWorld({
    gateways: [GATEWAY.K40],
    timers: true,
    config: { refresh_minutes: 2 },
  });
  try {
    await createAll(gladys);
    const room = feature(gladys, 'heating_circuit', GATEWAY.K40, 'hc1', 'room_temperature');
    assert.equal(gladys.fake.lastState(room), 20.6);

    bosch.set(GATEWAY.K40, '/heatingCircuits/hc1/roomtemperature', 21.3);
    t.mock.timers.tick(60 * 1000);
    await settle();
    assert.equal(gladys.fake.lastState(room), 20.6, 'not before the period');

    t.mock.timers.tick(60 * 1000);
    await waitFor(() => gladys.fake.lastState(room) === 21.3, 'the timer read');
    assert.ok(
      !gladys.fake.wsMessages.some((m) => m.type === 'device.poll'),
      'the core never had to poll',
    );
  } finally {
    await app.stop();
  }
});

test("the core's onPoll is a fallback: skipped right after a read, done once the timer stalls", async () => {
  let now = 1_000_000;
  const { gladys, bosch, app } = await createWorld({ gateways: [GATEWAY.K40] });
  try {
    await createAll(gladys);
    app.poller.stop();
    const device = gladys.fake.discoveredDevices[0];
    const reads = () => bosch.apiCalls().filter((call) => call.url.endsWith('/bulk')).length;
    const before = reads();
    assert.deepEqual(await gladys.fake.poll(device), { success: true });
    assert.equal(reads(), before, 'read moments ago: skipped');

    // Time passes (the timer has stalled): the core's poll reads again.
    const realNow = Date.now;
    now = realNow() + 10 * 60 * 1000;
    Date.now = () => now;
    try {
      await gladys.fake.poll(device);
    } finally {
      Date.now = realNow;
    }
    assert.ok(reads() > before);
  } finally {
    await app.stop();
  }
});

test('only the gateways with an added device are read on refresh', async () => {
  const { gladys, bosch, app } = await createWorld();
  try {
    const k40 = gladys.fake.discoveredDevices.find((d) =>
      d.external_id.endsWith(`heat_source:${GATEWAY.K40}`),
    );
    await gladys.fake.deviceCreated(k40);
    const start = bosch.calls.length;
    await app.poller.restart();
    const read = bosch.calls
      .slice(start)
      .filter((call) => call.url.endsWith('/bulk'))
      .map((call) => JSON.parse(call.body)[0].gatewayId);
    assert.deepEqual(read, [GATEWAY.K40, GATEWAY.K40]);
  } finally {
    await app.stop();
  }
});

test('the room setpoint is written where the appliance takes it, within its bounds', async () => {
  const { gladys, bosch, app } = await createWorld();
  try {
    await createAll(gladys);
    // K40: the manual setpoint, rounded to the half degree.
    const k40 = feature(gladys, 'heating_circuit', GATEWAY.K40, 'hc1', 'target_temperature');
    assert.equal((await command(gladys, k40, 21.4)).success, true);
    assert.deepEqual(bosch.writes.at(-1), {
      gatewayId: GATEWAY.K40,
      path: '/heatingCircuits/hc1/manualRoomSetpoint',
      value: 21.5,
    });
    assert.equal(gladys.fake.lastState(k40), 21.5);

    // Out of the 5–30 °C of the appliance: refused, nothing sent.
    const writes = bosch.writes.length;
    const refused = await command(gladys, k40, 35);
    assert.equal(refused.success, false);
    assert.match(refused.error, /outside 5–30/);
    assert.equal(bosch.writes.length, writes);

    // ICOM: the temporary setpoint, like the HomeCom Easy app.
    const icom = feature(gladys, 'heating_circuit', GATEWAY.ICOM, 'hc2', 'target_temperature');
    await command(gladys, icom, 20);
    assert.equal(bosch.writes.at(-1).path, '/heatingCircuits/hc2/temporaryRoomSetpoint');
  } finally {
    await app.stop();
  }
});

test('in cooling, the room setpoint goes to the cooling setpoint', async () => {
  const bosch = createFakeBosch({ gateways: [GATEWAY.K40], refreshToken: STORED_REFRESH_TOKEN });
  bosch.set(GATEWAY.K40, '/heatingCircuits/hc1/heatCoolMode', 'cooling');
  bosch.account.resources[GATEWAY.K40]['/heatingCircuits/hc1/cooling/roomTempSetpoint'] = {
    id: '/heatingCircuits/hc1/cooling/roomTempSetpoint',
    type: 'floatValue',
    writeable: 1,
    value: 25,
    unitOfMeasure: 'C',
    minValue: 18,
    maxValue: 30,
  };
  const { gladys, app } = await createWorld({ bosch });
  try {
    await createAll(gladys);
    const target = feature(gladys, 'heating_circuit', GATEWAY.K40, 'hc1', 'target_temperature');
    await command(gladys, target, 24);
    assert.equal(bosch.writes.at(-1).path, '/heatingCircuits/hc1/cooling/roomTempSetpoint');
    assert.equal((await command(gladys, target, 17)).success, false, 'cooling bounds');
  } finally {
    await app.stop();
  }
});

test('modes only take the values the appliance offers', async () => {
  const { gladys, bosch, app } = await createWorld();
  try {
    await createAll(gladys);
    const mode = feature(gladys, 'heating_circuit', GATEWAY.K40, 'hc1', 'operating_mode');
    await command(gladys, mode, 'manual');
    assert.deepEqual(bosch.writes.at(-1).value, 'manual');
    assert.equal(gladys.fake.lastState(mode), 'manual');
    assert.equal((await command(gladys, mode, 'turbo')).success, false);

    const dhwMode = feature(gladys, 'hot_water', GATEWAY.K40, 'dhw1', 'mode');
    await command(gladys, dhwMode, 'Off');
    assert.deepEqual(bosch.writes.at(-1), {
      gatewayId: GATEWAY.K40,
      path: '/dhwCircuits/dhw1/operationMode',
      value: 'Off',
    });
  } finally {
    await app.stop();
  }
});

test('the hot water setpoint is the temperature of the active level', async () => {
  const { gladys, bosch, app } = await createWorld();
  try {
    await createAll(gladys);
    // K40 in "high": the high level, 30–60 °C.
    const k40 = feature(gladys, 'hot_water', GATEWAY.K40, 'dhw1', 'target_temperature');
    await command(gladys, k40, 52);
    assert.deepEqual(bosch.writes.at(-1), {
      gatewayId: GATEWAY.K40,
      path: '/dhwCircuits/dhw1/temperatureLevels/high',
      value: 52,
    });
    assert.equal((await command(gladys, k40, 65)).success, false, 'above the level maximum');

    // ICOM following its programme: the level the programme selected.
    const icom = feature(gladys, 'hot_water', GATEWAY.ICOM, 'dhw1', 'target_temperature');
    await command(gladys, icom, 50);
    assert.equal(bosch.writes.at(-1).path, '/dhwCircuits/dhw1/temperatureLevels/high');

    // Off: no level to set.
    await command(gladys, feature(gladys, 'hot_water', GATEWAY.K40, 'dhw1', 'mode'), 'Off');
    bosch.set(GATEWAY.K40, '/dhwCircuits/dhw1/currentTemperatureLevel', 'off');
    await app.poller.restart();
    const refused = await command(gladys, k40, 50);
    assert.equal(refused.success, false);
    assert.match(refused.error, /mode "Off"/);
  } finally {
    await app.stop();
  }
});

test('extra hot water starts and stops a one-off charge', async () => {
  const { gladys, bosch, app } = await createWorld({ gateways: [GATEWAY.K40] });
  try {
    await createAll(gladys);
    const boost = feature(gladys, 'hot_water', GATEWAY.K40, 'dhw1', 'boost');
    await command(gladys, boost, 1);
    assert.deepEqual(bosch.writes.at(-1).value, 'start');
    assert.equal(gladys.fake.lastState(boost), 1);
    await command(gladys, boost, 0);
    assert.deepEqual(bosch.writes.at(-1).value, 'stop');
  } finally {
    await app.stop();
  }
});

test('the air conditioner speaks the Gladys values of modes and fan speeds', async () => {
  const { gladys, bosch, app } = await createWorld({ gateways: [GATEWAY.RAC] });
  try {
    await createAll(gladys);
    const id = (key) => feature(gladys, 'air_conditioner', GATEWAY.RAC, null, key);
    const device = gladys.fake.discoveredDevices[0];
    const mode = device.features.find((f) => f.external_id === id('mode'));
    assert.deepEqual(
      mode.supported_options.map((o) => o.value),
      [0, 2, 1, 3, 4],
      'auto, heat, cool, dry, fan — as Bosch lists them',
    );

    await command(gladys, id('power'), 1);
    assert.deepEqual(bosch.writes.at(-1), {
      gatewayId: GATEWAY.RAC,
      path: '/airConditioning/acControl',
      value: 'on',
    });
    await command(gladys, id('mode'), 3);
    assert.equal(bosch.writes.at(-1).value, 'dry');
    await command(gladys, id('fan_speed'), 5);
    assert.equal(bosch.writes.at(-1).value, 'high');
    assert.equal(
      (await command(gladys, id('fan_speed'), 7)).success,
      false,
      'no turbo on this unit',
    );
    await command(gladys, id('target_temperature'), 22.5);
    assert.equal(bosch.writes.at(-1).value, 22.5);
    assert.equal((await command(gladys, id('target_temperature'), 31)).success, false);
  } finally {
    await app.stop();
  }
});

test('a new fault fires the scene trigger once; the faults present at the link do not', async () => {
  const bosch = createFakeBosch({ gateways: [GATEWAY.K40], refreshToken: STORED_REFRESH_TOKEN });
  bosch.account.resources[GATEWAY.K40]['/notifications'].values.push({
    dcd: 'H07',
    ccd: '1037',
    act: 'A',
  });
  const { gladys, app } = await createWorld({ bosch });
  try {
    await createAll(gladys);
    const faults = feature(gladys, 'heat_source', GATEWAY.K40, null, 'faults');
    assert.equal(gladys.fake.lastState(faults), 'H07-1037');
    assert.deepEqual(gladys.fake.sceneEvents, [], 'known at the link: no alert');

    bosch.account.resources[GATEWAY.K40]['/notifications'].values.push({
      dcd: 'A01',
      ccd: '5',
      act: 'A',
    });
    await app.poller.restart();
    assert.deepEqual(gladys.fake.sceneEvents, [
      {
        key: 'fault_reported',
        data: { device: ids(gladys, 'heat_source', GATEWAY.K40).device, code: 'A01-5' },
      },
    ]);
    assert.equal(gladys.fake.lastState(faults), 'H07-1037, A01-5');

    await app.poller.restart();
    assert.equal(gladys.fake.sceneEvents.length, 1, 'once per fault');
    assert.ok(gladys.fake.widgetRefreshes.includes('heating_overview'));
  } finally {
    await app.stop();
  }
});

test('an expired login says so and stops reading the cloud', async () => {
  const { gladys, bosch, app } = await createWorld({ gateways: [GATEWAY.K40] });
  try {
    await createAll(gladys);
    bosch.state.revoked = true;
    bosch.state.expireAccess = true;
    await app.poller.restart();
    assert.deepEqual(gladys.fake.connectionStatus, {
      connected: false,
      message: MESSAGES.loginExpired,
    });
    assert.equal(app.cloud.hasAccount(), false);

    const calls = bosch.calls.length;
    await app.poller.restart();
    assert.equal(bosch.calls.length, calls, 'no more requests');
    const widget = await gladys.fake.widgetGet('heating_overview', {
      settings: {},
      language: 'en',
    });
    assert.match(JSON.stringify(widget.data), /Not connected/);
  } finally {
    await app.stop();
  }
});

test('an access token refused early is refreshed once, and the new refresh token kept', async () => {
  const { gladys, bosch, app, dataDir } = await createWorld({ gateways: [GATEWAY.K40] });
  try {
    await createAll(gladys);
    bosch.state.expireAccess = true;
    await app.poller.restart();
    assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
    const saved = JSON.parse(await readFile(join(dataDir, 'bosch-homecom.json'), 'utf8'));
    assert.equal(saved.auth.refresh_token, bosch.state.refreshToken);
    assert.notEqual(saved.auth.refresh_token, STORED_REFRESH_TOKEN);
  } finally {
    await app.stop();
  }
});

test('a fresh access token still refused is an outage, not a sign-in to redo', async () => {
  const { gladys, bosch, app } = await createWorld({ gateways: [GATEWAY.K40] });
  try {
    await createAll(gladys);
    bosch.state.refuseAllTokens = true;
    await app.poller.restart();
    assert.equal(app.cloud.hasAccount(), true, 'the refresh token is kept');
    assert.match(gladys.fake.connectionStatus.message.en, /does not answer.*401/);
    bosch.state.refuseAllTokens = false;
    await app.poller.restart();
    assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  } finally {
    await app.stop();
  }
});

test('a cloud outage is reported once, the recovery too, and the devices stay listed', async () => {
  const { gladys, bosch, app, dataDir } = await createWorld({ gateways: [GATEWAY.K40] });
  try {
    await createAll(gladys);
    bosch.state.down = true;
    await app.poller.restart();
    assert.equal(gladys.fake.connectionStatus.connected, false);
    assert.match(gladys.fake.connectionStatus.message.en, /does not answer/);

    bosch.state.rateLimited = true;
    bosch.state.down = false;
    await app.poller.restart();
    assert.match(gladys.fake.connectionStatus.message.en, /429/);

    bosch.state.rateLimited = false;
    await app.poller.restart();
    assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  } finally {
    await app.stop();
  }

  // Restarted while the cloud is down: the devices seen last are still listed.
  const bosch2 = createFakeBosch({ gateways: [GATEWAY.K40] });
  bosch2.state.down = true;
  const second = await createWorld({ linked: false, dataDir, bosch: bosch2 });
  try {
    assert.equal(second.gladys.fake.discoveredDevices.length, 3);
    assert.equal(second.gladys.fake.connectionStatus.connected, false);
  } finally {
    await second.app.stop();
  }
});

test('an unchanged value is sent again every 12 hours at least', async (t) => {
  const { gladys, app } = await createWorld({ gateways: [GATEWAY.K40] });
  try {
    await createAll(gladys);
    const calls = [];
    const original = gladys.publishChangedStates.bind(gladys);
    t.mock.method(gladys, 'publishChangedStates', (states, options) => {
      calls.push(options);
      return original(states, options);
    });
    await app.poller.restart();
    assert.ok(calls.some((options) => options?.heartbeat === HEARTBEAT_MS));
    assert.ok(HEARTBEAT_MS <= 12 * 60 * 60 * 1000);

    const pressure = feature(gladys, 'heat_source', GATEWAY.K40, null, 'system_pressure');
    const count = () =>
      gladys.fake.states.filter((s) => s.device_feature_external_id === pressure).length;
    const before = count();
    await app.poller.restart();
    assert.equal(count(), before, 'unchanged: not sent again');

    const realNow = Date.now;
    Date.now = () => realNow() + HEARTBEAT_MS + 1000;
    try {
      await app.poller.restart();
    } finally {
      Date.now = realNow;
    }
    assert.equal(count(), before + 1, 'sent again past the heartbeat');
  } finally {
    await app.stop();
  }
});

test('"Test the connection" lists the supported and unsupported appliances', async () => {
  const { gladys, app } = await createWorld();
  try {
    const ack = await gladys.fake.action('test_connection', {});
    assert.equal(ack.success, true);
    const message = ack.data?.message ?? ack.data;
    assert.match(
      message.en,
      /Supported: k40 101000001, icom 101000002, rac 101000003, k30 101000004\./,
    );
    assert.match(message.fr, /Non pris en charge : wddw2 101000005/);
  } finally {
    await app.stop();
  }
});

test('a scan reads the account again', async () => {
  const { gladys, bosch, app } = await createWorld({ gateways: [GATEWAY.K40] });
  try {
    bosch.account.resources[GATEWAY.K40]['/heatingCircuits'].references.push({
      id: '/heatingCircuits/hc2',
    });
    bosch.account.resources[GATEWAY.K40]['/heatingCircuits/hc2/operationMode'] = {
      id: '/heatingCircuits/hc2/operationMode',
      type: 'stringValue',
      writeable: 1,
      value: 'auto',
      allowedValues: ['off', 'manual', 'auto'],
    };
    await gladys.fake.scanRequest();
    assert.ok(
      gladys.fake.discoveredDevices.some((d) => d.external_id.endsWith(`${GATEWAY.K40}-hc2`)),
    );
  } finally {
    await app.stop();
  }
});
