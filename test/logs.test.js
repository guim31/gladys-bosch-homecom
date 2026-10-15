// -----------------------------------------------------------------------------
// Quiet logs (CLAUDE.md, "Journaux calmes"): a normal refresh writes nothing at
// the info level, a repeated failure writes one line when it starts and one
// when it ends, and no secret ever reaches the logs — at any level.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GATEWAY } from './helpers/fakeBosch.js';
import { STORED_REFRESH_TOKEN, createAll, createWorld } from './helpers/world.js';

/** Capture what the SDK logger writes (console.log / console.error) at a level. */
function captureLogs(t, level) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) =>
    lines.push(
      args
        .map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : String(arg)))
        .join(' '),
    );
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

test('a normal refresh writes nothing at the info level', async (t) => {
  const { gladys, app } = await createWorld({ gateways: [GATEWAY.K40, GATEWAY.RAC] });
  try {
    await createAll(gladys);
    const lines = captureLogs(t, 'info');
    await app.poller.restart();
    await app.poller.restart();
    assert.deepEqual(lines, []);
  } finally {
    await app.stop();
  }
});

test('an outage writes one line when it starts and one when it ends', async (t) => {
  const { gladys, bosch, app } = await createWorld({ gateways: [GATEWAY.K40] });
  try {
    await createAll(gladys);
    const lines = captureLogs(t, 'info');
    bosch.state.down = true;
    for (let i = 0; i < 4; i += 1) {
      await app.poller.restart();
    }
    assert.equal(lines.length, 1, lines.join('\n'));
    assert.match(lines[0], /\[WARN\].*Bosch cloud unreachable/);
    bosch.state.down = false;
    await app.poller.restart();
    await app.poller.restart();
    assert.equal(lines.length, 2, lines.join('\n'));
    assert.match(lines[1], /\[INFO\].*answers again/);
  } finally {
    await app.stop();
  }
});

test('no token, code or verifier appears in the logs, even in debug', async (t) => {
  const lines = captureLogs(t, 'debug');
  const { gladys, bosch, app, dataDir } = await createWorld({
    linked: false,
    gateways: [GATEWAY.K40],
  });
  try {
    const { data } = await gladys.fake.oauthAuthorizeUrl('bosch_account');
    const verifier = JSON.parse(await readFile(join(dataDir, 'bosch-homecom.json'), 'utf8')).login
      .verifier;
    const code = bosch.signIn(data.authorize_url);
    await gladys.fake.configUpdated({ ...gladys.fake.config, auth_code: code });
    await createAll(gladys);
    bosch.state.expireAccess = true;
    await app.poller.restart();
    await gladys.fake.action('test_connection', {});
    bosch.state.revoked = true;
    bosch.state.expireAccess = true;
    await app.poller.restart();

    assert.ok(lines.length > 5, 'the debug level shows the activity');
    const secrets = [
      code,
      verifier,
      STORED_REFRESH_TOKEN,
      'access-',
      'refresh-',
      data.authorize_url,
      new URL(data.authorize_url).searchParams.get('code_challenge'),
    ];
    for (const line of lines) {
      for (const secret of secrets) {
        assert.ok(!line.includes(secret), `a secret leaked: ${line}`);
      }
    }
  } finally {
    await app.stop();
  }
});

test('one appliance down among several: one line, and the status does not flap', async (t) => {
  const { gladys, bosch, app } = await createWorld({ gateways: [GATEWAY.K40, GATEWAY.RAC] });
  try {
    await createAll(gladys);
    const lines = captureLogs(t, 'info');
    bosch.state.failing.add(GATEWAY.RAC);
    const statuses = gladys.fake.connectionStatuses.length;
    for (let i = 0; i < 3; i += 1) {
      await app.poller.restart();
    }
    assert.equal(lines.length, 1, lines.join('\n'));
    assert.match(lines[0], new RegExp(`\\[WARN\\].*${GATEWAY.RAC}.*HTTP 500`));
    assert.equal(gladys.fake.connectionStatuses.length, statuses + 1, 'one status change');
    assert.equal(gladys.fake.connectionStatus.connected, false);

    bosch.state.failing.clear();
    await app.poller.restart();
    assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
    assert.equal(lines.length, 2);
  } finally {
    await app.stop();
  }
});
