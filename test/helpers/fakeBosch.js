// -----------------------------------------------------------------------------
// In-memory Bosch cloud: SingleKey ID (authorization code + PKCE, rotating
// refresh tokens) and the pointt API (gateway list, bulk reads, writes), served
// through a `fetch` the integration receives instead of the real one.
//
// It refuses what the real services refuse, as the homecom_alt library and the
// Home Assistant integration describe them: a code used twice or with the wrong
// verifier, a refresh token already rotated, an access token that is not the
// current one, a bulk path carrying the `/resource` prefix (403), a write on a
// read-only resource or out of its bounds.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const ACCOUNT = JSON.parse(
  readFileSync(new URL('../fixtures/bosch-account.json', import.meta.url), 'utf8'),
);

export const GATEWAY = {
  K40: '101000001',
  ICOM: '101000002',
  RAC: '101000003',
  K30: '101000004',
  WDDW2: '101000005',
};

const TOKEN_URL = 'https://singlekey-id.com/auth/connect/token';
const API = 'https://pointt-api.bosch-thermotechnology.com/pointt-api/api/v1';

const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const challengeOf = (verifier) => createHash('sha256').update(verifier).digest('base64url');

/**
 * @param {object} [options]
 * @param {string[]} [options.gateways] ids of the fixture gateways on the account
 * @param {string} [options.refreshToken] refresh token already valid (an account linked earlier)
 */
export function createFakeBosch({ gateways = Object.values(GATEWAY), refreshToken } = {}) {
  const account = {
    gateways: ACCOUNT.gateways.filter((gateway) => gateways.includes(gateway.deviceId)),
    resources: Object.fromEntries(
      gateways.map((id) => {
        const { _comment, ...resources } = ACCOUNT.resources[id];
        return [id, structuredClone(resources)];
      }),
    ),
  };
  let counter = 0;
  const codes = new Map(); // code -> challenge
  const state = {
    accessToken: null,
    refreshToken: refreshToken ?? null,
    down: false,
    rateLimited: false,
    expireAccess: false,
    revoked: false,
    // Gateways whose bulk reads fail (HTTP 500), and an API refusing every token.
    failing: new Set(),
    refuseAllTokens: false,
  };
  const calls = [];
  const writes = [];

  function issueTokens() {
    counter += 1;
    state.accessToken = `access-${counter}`;
    state.refreshToken = `refresh-${counter}`;
    return {
      access_token: state.accessToken,
      refresh_token: state.refreshToken,
      expires_in: 3600,
      token_type: 'Bearer',
    };
  }

  function token(body) {
    const form = new URLSearchParams(body);
    if (form.get('client_id') !== '762162C0-FA2D-4540-AE66-6489F189FADC') {
      return json(400, { error: 'invalid_client' });
    }
    if (form.get('grant_type') === 'authorization_code') {
      const challenge = codes.get(form.get('code'));
      codes.delete(form.get('code')); // single use, right or wrong
      if (!challenge || challengeOf(form.get('code_verifier') ?? '') !== challenge) {
        return json(400, { error: 'invalid_grant' });
      }
      return json(200, issueTokens());
    }
    if (form.get('grant_type') === 'refresh_token') {
      if (
        state.revoked ||
        !state.refreshToken ||
        form.get('refresh_token') !== state.refreshToken
      ) {
        return json(400, { error: 'invalid_grant' });
      }
      return json(200, issueTokens());
    }
    return json(400, { error: 'unsupported_grant_type' });
  }

  function bulk(body) {
    const [request] = JSON.parse(body);
    if (state.failing.has(request.gatewayId)) {
      return json(500, { message: 'gateway does not answer' });
    }
    const resources = account.resources[request.gatewayId];
    if (!resources) {
      return json(404, { message: 'gateway not found' });
    }
    if (request.resourcePaths.length > 30) {
      return json(400, { message: 'too many resource paths' });
    }
    return json(200, [
      {
        gatewayId: request.gatewayId,
        resourcePaths: request.resourcePaths.map((path) => {
          if (path.startsWith('/resource/')) {
            return { resourcePath: path, serverStatus: 403, gatewayResponse: null };
          }
          const payload = resources[path];
          return {
            resourcePath: path,
            serverStatus: 200,
            gatewayResponse: payload
              ? { status: 200, payload: structuredClone(payload) }
              : { status: 404, payload: null },
          };
        }),
      },
    ]);
  }

  // A resource by path; the RAC ones live in the list of standardFunctions.
  function find(gatewayId, path) {
    const resources = account.resources[gatewayId] ?? {};
    if (resources[path]) {
      return resources[path];
    }
    return Object.values(resources)
      .flatMap((payload) => (Array.isArray(payload?.references) ? payload.references : []))
      .find((item) => item.id === path && 'value' in item);
  }

  function put(gatewayId, path, body) {
    const resource = find(gatewayId, path);
    if (!resource || resource.writeable !== 1) {
      return json(403, { message: 'not writeable' });
    }
    const { value } = JSON.parse(body);
    if (resource.allowedValues && !resource.allowedValues.includes(value)) {
      return json(400, { message: 'value not allowed' });
    }
    if (
      resource.minValue !== undefined &&
      (value < resource.minValue || value > resource.maxValue)
    ) {
      return json(400, { message: 'value out of range' });
    }
    resource.value = value;
    writes.push({ gatewayId, path, value });
    return new Response(null, { status: 204 });
  }

  async function fetchFn(url, init = {}) {
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({ method, url, headers: init.headers ?? {}, body: init.body });
    if (state.down) {
      throw new TypeError('fetch failed');
    }
    if (url === TOKEN_URL && method === 'POST') {
      return token(init.body);
    }
    if (!url.startsWith(API)) {
      throw new TypeError(`unexpected address ${url}`);
    }
    if (state.rateLimited) {
      return json(429, { message: 'Too Many Requests' });
    }
    const authorization = init.headers?.Authorization;
    if (
      state.refuseAllTokens ||
      state.expireAccess ||
      !state.accessToken ||
      authorization !== `Bearer ${state.accessToken}`
    ) {
      state.expireAccess = false;
      return json(401, { message: 'Unauthorized' });
    }
    const path = url.slice(API.length);
    if (method === 'GET' && path === '/gateways/') {
      return json(200, structuredClone(account.gateways));
    }
    if (method === 'POST' && path === '/bulk') {
      return bulk(init.body);
    }
    const write = path.match(/^\/gateways\/([^/]+)\/resource(\/.+)$/);
    if (method === 'PUT' && write) {
      return put(decodeURIComponent(write[1]), write[2], init.body);
    }
    return json(404, { message: 'not found' });
  }

  return {
    fetch: fetchFn,
    account,
    state,
    calls,
    writes,
    /** The user signs in on the login page: a code bound to its challenge. */
    signIn(loginUrl) {
      const challenge = new URL(loginUrl).searchParams.get('code_challenge');
      counter += 1;
      const code = `code-${counter}-${'x'.repeat(20)}-1`;
      codes.set(code, challenge);
      return code;
    },
    /** Change a resource value, as the appliance would. */
    set(gatewayId, path, value) {
      find(gatewayId, path).value = value;
    },
    resource: find,
    apiCalls() {
      return calls.filter((call) => call.url.startsWith(API));
    },
  };
}
