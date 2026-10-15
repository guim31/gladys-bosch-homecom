// -----------------------------------------------------------------------------
// SingleKey ID sign-in: the login address, the PKCE challenge, the code the
// user pastes, the token exchanges.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthError,
  CLIENT_ID,
  codeChallenge,
  createLogin,
  exchangeCode,
  refreshTokens,
} from '../src/bosch/auth.js';
import { extractAuthCode, normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';
import { createFakeBosch } from './helpers/fakeBosch.js';

test('the PKCE challenge is the S256 of the verifier, as SingleKey ID checks it', () => {
  // The public verifier/challenge pair of the homecom_alt library (MIT) and of
  // the login address of its Home Assistant README.
  const verifier =
    'AZbpLzMvXigq_jz7_riwNDV8BQYT30prXGDyRHdQMo0GYre3si9YJfG4b1U-QWERtOiX_9mCJE2SAPvJMeM2yA';
  assert.equal(codeChallenge(verifier), 'Fc6eY3uMBJkFqa4VqcULuLuKC5Do70XMw7oa_Pxafw0');
});

test('every login draws a new verifier, and the address carries its challenge', () => {
  const first = createLogin('bosch');
  const second = createLogin('bosch');
  assert.notEqual(first.verifier, second.verifier);
  assert.ok(first.verifier.length >= 43 && first.verifier.length <= 128, 'RFC 7636 length');
  assert.match(first.verifier, /^[A-Za-z0-9_-]+$/);

  const url = new URL(first.url);
  assert.equal(url.origin + url.pathname, 'https://singlekey-id.com/auth/connect/authorize');
  const params = url.searchParams;
  assert.equal(params.get('code_challenge'), codeChallenge(first.verifier));
  assert.equal(params.get('code_challenge_method'), 'S256');
  assert.equal(params.get('client_id'), CLIENT_ID);
  assert.equal(params.get('response_type'), 'code');
  assert.equal(params.get('redirect_uri'), 'com.bosch.tt.dashtt.pointt://app/login');
  assert.equal(params.get('style_id'), 'tt_bsch');
  assert.match(params.get('scope'), /offline_access/);
  assert.match(params.get('scope'), /pointt\.gateway\.resource\.dashapp/);
  assert.ok(params.get('state') && params.get('nonce'));
  // The verifier itself never leaves the integration.
  assert.ok(!first.url.includes(first.verifier));
});

test('the Buderus app has its own redirect address and login style', () => {
  const params = new URL(createLogin('buderus').url).searchParams;
  assert.equal(params.get('redirect_uri'), 'com.buderus.tt.dashtt://app/login');
  assert.equal(params.get('style_id'), 'tt_bud');
});

test('the pasted code is taken from whatever the user copied', () => {
  assert.equal(extractAuthCode('  ABC123-1 '), 'ABC123-1');
  assert.equal(
    extractAuthCode('com.bosch.tt.dashtt.pointt://app/login?code=7F2A%2B9-1&state=xyz'),
    '7F2A+9-1',
  );
  assert.equal(extractAuthCode('"ABC-1"'), 'ABC-1');
  assert.equal(extractAuthCode(undefined), '');
  assert.equal(extractAuthCode(12), '');
});

test('the configuration is normalized', () => {
  assert.deepEqual(normalizeConfig({}), {
    brand: 'bosch',
    authCode: '',
    refreshMinutes: DEFAULT_CONFIG.refresh_minutes,
    language: 'fr',
  });
  const config = normalizeConfig({
    brand: 'buderus',
    refresh_minutes: 1,
    language: 'de',
    auth_code: 'x-1',
  });
  assert.equal(config.brand, 'buderus');
  assert.equal(config.refreshMinutes, 2, 'two minutes at least');
  assert.equal(config.language, 'de');
  assert.equal(normalizeConfig({ refresh_minutes: 600 }).refreshMinutes, 60);
  assert.equal(normalizeConfig({ refresh_minutes: '10' }).refreshMinutes, 10);
  assert.equal(normalizeConfig({ brand: 'viessmann', language: 'it' }).brand, 'bosch');
  assert.equal(normalizeConfig(null).language, 'fr');
});

test('a code is exchanged once, with the verifier of its login', async () => {
  const bosch = createFakeBosch();
  const login = createLogin('bosch');
  const code = bosch.signIn(login.url);

  await assert.rejects(
    exchangeCode(bosch.fetch, { code, verifier: createLogin('bosch').verifier, brand: 'bosch' }),
    (err) => err instanceof AuthError && err.code === 'invalid_grant',
  );
  // Dropped at the first try, even a wrong one.
  await assert.rejects(
    exchangeCode(bosch.fetch, { code, verifier: login.verifier, brand: 'bosch' }),
    AuthError,
  );

  const second = createLogin('bosch');
  const tokens = await exchangeCode(bosch.fetch, {
    code: bosch.signIn(second.url),
    verifier: second.verifier,
    brand: 'bosch',
  });
  assert.equal(typeof tokens.accessToken, 'string');
  assert.equal(typeof tokens.refreshToken, 'string');
  assert.equal(tokens.expiresIn, 3600);

  // The refresh token rotates: the previous one is refused afterwards.
  const next = await refreshTokens(bosch.fetch, tokens.refreshToken);
  assert.notEqual(next.refreshToken, tokens.refreshToken);
  await assert.rejects(refreshTokens(bosch.fetch, tokens.refreshToken), AuthError);
});

test('an unreachable SingleKey ID is not taken for a refused login', async () => {
  const bosch = createFakeBosch({ refreshToken: 'r-1' });
  bosch.state.down = true;
  await assert.rejects(refreshTokens(bosch.fetch, 'r-1'), (err) => !(err instanceof AuthError));
});
