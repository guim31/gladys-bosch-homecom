// -----------------------------------------------------------------------------
// SingleKey ID sign-in (OAuth 2.0 authorization code + PKCE), as the HomeCom
// Easy app does it.
//
// SingleKey ID only knows the app's own redirect address
// (`com.bosch.tt.dashtt.pointt://app/login`), which no browser can open: the
// user signs in, the browser fails on that address, and the user copies the
// `code` it carries into the configuration. No password ever reaches the
// integration, and nothing on the login page is bypassed.
//
// The client id, scopes and redirect addresses are the public values of the
// app, published by the MIT-licensed `homecom_alt` library (serbanb11). Unlike
// that library, a fresh PKCE verifier is drawn for every login address.
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';

export const SINGLEKEY_AUTHORIZE_URL = 'https://singlekey-id.com/auth/connect/authorize';
export const SINGLEKEY_TOKEN_URL = 'https://singlekey-id.com/auth/connect/token';
export const CLIENT_ID = '762162C0-FA2D-4540-AE66-6489F189FADC';

const SCOPE = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'pointt.gateway.claiming',
  'pointt.gateway.removal',
  'pointt.gateway.list',
  'pointt.gateway.users',
  'pointt.gateway.resource.dashapp',
  'pointt.castt.flow.token-exchange',
  'bacon',
  'hcc.tariff.read',
].join(' ');

export const BRAND_SETTINGS = {
  bosch: { redirectUri: 'com.bosch.tt.dashtt.pointt://app/login', styleId: 'tt_bsch' },
  buderus: { redirectUri: 'com.buderus.tt.dashtt://app/login', styleId: 'tt_bud' },
};

const TIMEOUT_MS = 15000;

/** The account must be linked again (refresh token refused or missing). */
export class AuthError extends Error {
  constructor(message, { code } = {}) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const base64url = (buffer) => buffer.toString('base64url');

/** RFC 7636 S256 challenge of a verifier. */
export const codeChallenge = (verifier) =>
  base64url(createHash('sha256').update(verifier).digest());

/**
 * A new login: the address to open, and the verifier to keep until the code
 * comes back.
 * @param {'bosch'|'buderus'} brand
 * @param {() => Buffer} [random] test seam
 */
export function createLogin(brand, random = (size) => randomBytes(size)) {
  const settings = BRAND_SETTINGS[brand] ?? BRAND_SETTINGS.bosch;
  const verifier = base64url(random(48));
  const params = new URLSearchParams({
    state: base64url(random(16)),
    nonce: base64url(random(16)),
    code_challenge: codeChallenge(verifier),
    redirect_uri: settings.redirectUri,
    client_id: CLIENT_ID,
    response_type: 'code',
    prompt: 'login',
    scope: SCOPE,
    code_challenge_method: 'S256',
    style_id: settings.styleId,
  });
  return { url: `${SINGLEKEY_AUTHORIZE_URL}?${params}`, verifier, brand };
}

async function postToken(fetchFn, form) {
  let response;
  try {
    response = await fetchFn(SINGLEKEY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(
      `SingleKey ID unreachable (${err.name === 'TimeoutError' ? 'timeout' : err.message})`,
      { cause: err },
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status === 400 || response.status === 401) {
    // invalid_grant: a used, expired or mistyped code, or a revoked refresh token.
    const code = typeof body?.error === 'string' ? body.error : `http_${response.status}`;
    throw new AuthError(`SingleKey ID refused the request (${code})`, { code });
  }
  if (!response.ok) {
    throw new Error(`SingleKey ID answered HTTP ${response.status}`);
  }
  if (typeof body?.access_token !== 'string' || typeof body?.refresh_token !== 'string') {
    throw new Error('SingleKey ID answered without tokens');
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: Number.isFinite(body.expires_in) ? body.expires_in : 3600,
  };
}

/**
 * Exchange the code the user copied for the first tokens.
 * @param {Function} fetchFn
 * @param {{ code: string, verifier: string, brand: string }} login
 */
export function exchangeCode(fetchFn, { code, verifier, brand }) {
  const settings = BRAND_SETTINGS[brand] ?? BRAND_SETTINGS.bosch;
  return postToken(fetchFn, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: settings.redirectUri,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
}

/**
 * New tokens from the refresh token. Bosch rotates it: the old one stops
 * working once the new one is issued.
 */
export function refreshTokens(fetchFn, refreshToken) {
  return postToken(fetchFn, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
}
