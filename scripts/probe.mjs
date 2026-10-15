#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe of the real Bosch services, with the integration's own code, up to the
// refusal of a fake account. Read-only, no account needed, nothing sensitive
// printed (no token, no code, no address with credentials).
//
//   node scripts/probe.mjs
//
// It checks, against the live services:
//   1. the SingleKey ID login address the "Connect" button opens answers
//      (a login page, or a redirect to it);
//   2. the token endpoint refuses an invented code with `invalid_grant` —
//      the answer the integration turns into "Bosch refused the code";
//   3. the token endpoint refuses an invented refresh token the same way —
//      "The Bosch sign-in has expired";
//   4. the pointt API refuses an invented access token (401), and the client
//      then tries one refresh and reports an AuthError, not an outage;
//   5. the bulk endpoint refuses it too (401).
// Exit code 0 when every answer is the expected one.
// -----------------------------------------------------------------------------

import { AuthError, createLogin, exchangeCode, refreshTokens } from '../src/bosch/auth.js';
import { API_ROOT, BoschCloud } from '../src/bosch/client.js';

const results = [];
function report(step, ok, detail) {
  results.push(ok);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${step}: ${detail}`);
}

const describe = (err) =>
  err instanceof AuthError ? `AuthError (${err.code})` : `${err.name}: ${err.message}`;

// 1. The login page.
const login = createLogin('bosch');
try {
  const response = await fetch(login.url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  const location = response.headers.get('location');
  const target = location ? new URL(location, login.url) : null;
  report(
    'login address',
    response.status === 200 || (response.status >= 300 && response.status < 400),
    `HTTP ${response.status}${target ? ` → ${target.host}${target.pathname}` : ''}`,
  );
} catch (err) {
  report('login address', false, describe(err));
}

// 2. An invented authorization code.
try {
  await exchangeCode(fetch, {
    code: 'PROBE-INVALID-CODE-1',
    verifier: login.verifier,
    brand: 'bosch',
  });
  report('code exchange', false, 'an invented code was accepted');
} catch (err) {
  report('code exchange', err instanceof AuthError && err.code === 'invalid_grant', describe(err));
}

// 3. An invented refresh token.
try {
  await refreshTokens(fetch, 'probe-invalid-refresh-token');
  report('token refresh', false, 'an invented refresh token was accepted');
} catch (err) {
  report('token refresh', err instanceof AuthError, describe(err));
}

// 4. The gateway list with an invented access token, through the real client.
const memoryStore = {
  data: { auth: { refresh_token: 'probe-invalid-refresh-token', brand: 'bosch' } },
  get(key) {
    return this.data[key];
  },
  async set(key, value) {
    this.data[key] = value;
  },
};
const cloud = new BoschCloud({ fetch, store: memoryStore });
cloud.accessToken = 'probe-invalid-access-token';
cloud.expiresAt = Date.now() + 3600 * 1000;
try {
  await cloud.getGateways();
  report('gateway list', false, 'an invented access token was accepted');
} catch (err) {
  report('gateway list', err instanceof AuthError, describe(err));
}

// 5. The bulk endpoint, raw: the status only.
try {
  const response = await fetch(`${API_ROOT}/bulk`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer probe-invalid-access-token',
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify([{ gatewayId: '000000000', resourcePaths: ['/notifications'] }]),
    signal: AbortSignal.timeout(15000),
  });
  report(
    'bulk read',
    response.status === 401 || response.status === 403,
    `HTTP ${response.status}`,
  );
} catch (err) {
  report('bulk read', false, describe(err));
}

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `${failed} unexpected answer(s)` : 'Every answer is the expected one.');
process.exitCode = failed ? 1 : 0;
