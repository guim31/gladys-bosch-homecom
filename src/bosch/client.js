// -----------------------------------------------------------------------------
// Client of the Bosch "pointt" cloud API, the one behind HomeCom Easy.
//
//   GET  /pointt-api/api/v1/gateways/                       the account's gateways
//   POST /pointt-api/api/v1/bulk                            up to 30 resources at once
//   PUT  /pointt-api/api/v1/gateways/{id}/resource{path}    { "value": ... }
//
// The bulk call takes the resource paths WITHOUT the `/resource` prefix (with
// it, every path answers 403) and answers, per path, the cloud status and the
// gateway status: a resource the appliance does not have is a 404 there, not
// an error of the whole call. Endpoints and formats: `homecom_alt` (MIT,
// serbanb11) and its Home Assistant integration.
//
// The access token lives in memory only (about one hour); the refresh token is
// in the store (/data), written before the new access token is used.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { AuthError, exchangeCode, refreshTokens } from './auth.js';

const logger = createLogger({ name: 'bosch-cloud' });

export const API_ROOT = 'https://pointt-api.bosch-thermotechnology.com/pointt-api/api/v1';
export const MAX_BULK_PATHS = 30;
const TIMEOUT_MS = 20000;
// Refresh a little before the expiry announced by SingleKey ID.
const EXPIRY_MARGIN_MS = 60 * 1000;

/** The Bosch cloud answered an error (not an authentication problem). */
export class ApiError extends Error {
  constructor(message, status, options) {
    super(message, options);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class BoschCloud {
  /**
   * @param {object} options
   * @param {Function} [options.fetch]
   * @param {import('../store.js').Store} options.store
   * @param {() => number} [options.now]
   */
  constructor({ fetch: fetchFn = globalThis.fetch, store, now = () => Date.now() }) {
    this.fetch = fetchFn;
    this.store = store;
    this.now = now;
    this.accessToken = null;
    this.expiresAt = 0;
    this.refreshing = null;
  }

  /** A refresh token is stored: the account was linked. */
  hasAccount() {
    return typeof this.store.get('auth')?.refresh_token === 'string';
  }

  /**
   * Link the account with the code the user copied after signing in.
   * @param {string} code
   */
  async link(code) {
    const login = this.store.get('login');
    if (!login?.verifier) {
      throw new AuthError('no login started from this integration', { code: 'no_login' });
    }
    let tokens;
    try {
      tokens = await exchangeCode(this.fetch, {
        code,
        verifier: login.verifier,
        brand: login.brand,
      });
    } catch (err) {
      // A code works once: SingleKey ID drops it at the first answer, right or
      // wrong. Unreachable, it was never used: the verifier stays for a retry.
      if (err instanceof AuthError) {
        await this.store.set('login', undefined).catch(() => {});
      }
      throw err;
    }
    await this.store.set('login', undefined).catch(() => {});
    await this.saveTokens(tokens, login.brand);
  }

  /** Forget the account (the refresh token was refused). */
  async unlink() {
    this.accessToken = null;
    this.expiresAt = 0;
    await this.store.set('auth', undefined).catch(() => {});
  }

  async saveTokens(tokens, brand) {
    this.accessToken = tokens.accessToken;
    this.expiresAt = this.now() + tokens.expiresIn * 1000;
    try {
      await this.store.set('auth', {
        refresh_token: tokens.refreshToken,
        brand: brand ?? this.store.get('auth')?.brand ?? 'bosch',
        updated_at: new Date(this.now()).toISOString(),
      });
    } catch {
      // Kept in memory: the integration works until the next restart, which
      // will ask for a new login. The store already logged why.
      this.memoryRefreshToken = tokens.refreshToken;
    }
  }

  /** A valid access token, refreshed when needed (one refresh at a time). */
  async token({ force = false } = {}) {
    if (!force && this.accessToken && this.now() < this.expiresAt - EXPIRY_MARGIN_MS) {
      return this.accessToken;
    }
    if (!this.refreshing) {
      const staleToken = this.accessToken;
      this.refreshing = (async () => {
        const refreshToken = this.memoryRefreshToken ?? this.store.get('auth')?.refresh_token;
        if (!refreshToken) {
          throw new AuthError('no account linked', { code: 'no_account' });
        }
        logger.debug(
          force && staleToken ? 'Access token refused, refreshing' : 'Refreshing the access token',
        );
        const tokens = await refreshTokens(this.fetch, refreshToken);
        this.memoryRefreshToken = undefined;
        await this.saveTokens(tokens);
        return tokens.accessToken;
      })().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async request(method, path, body, { retried = false } = {}) {
    const token = await this.token({ force: retried });
    let response;
    try {
      response = await this.fetch(`${API_ROOT}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=UTF-8' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new ApiError(
        `Bosch cloud unreachable (${err.name === 'TimeoutError' ? 'timeout' : err.message})`,
        0,
        { cause: err },
      );
    }
    if (response.status === 401 && !retried) {
      // The token may have been revoked early: one refresh, one more try.
      return this.request(method, path, body, { retried: true });
    }
    if (response.status === 401) {
      // A token just issued and still refused: not a sign-in to redo (the
      // refresh token is kept), a cloud problem to retry.
      throw new ApiError('the Bosch cloud refused a fresh access token (HTTP 401)', 401);
    }
    if (response.status === 429) {
      throw new ApiError('the Bosch cloud limits the requests (HTTP 429)', 429);
    }
    if (!response.ok) {
      throw new ApiError(`the Bosch cloud answered HTTP ${response.status}`, response.status);
    }
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    if (text === '') {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError('the Bosch cloud answered something that is not JSON', response.status);
    }
  }

  /** @returns {Promise<Array<{ deviceId: string, deviceType: string }>>} */
  async getGateways() {
    const list = await this.request('GET', '/gateways/');
    if (!Array.isArray(list)) {
      throw new ApiError('unexpected answer to the gateway list', 200);
    }
    return list
      .filter((entry) => entry && typeof entry.deviceId === 'string' && entry.deviceId !== '')
      .map((entry) => ({
        deviceId: entry.deviceId,
        deviceType: String(entry.deviceType ?? '').toLowerCase(),
      }));
  }

  /**
   * Read resources of one gateway.
   * @param {string} gatewayId
   * @param {string[]} paths without the `/resource` prefix, e.g. `/dhwCircuits`
   * @returns {Promise<Record<string, object>>} the payload of each path that answered 200
   */
  async bulk(gatewayId, paths) {
    const result = {};
    for (let index = 0; index < paths.length; index += MAX_BULK_PATHS) {
      const chunk = paths.slice(index, index + MAX_BULK_PATHS);
      const answer = await this.request('POST', '/bulk', [{ gatewayId, resourcePaths: chunk }]);
      const entries = Array.isArray(answer)
        ? (answer.find((item) => item?.gatewayId === gatewayId) ?? answer[0])?.resourcePaths
        : null;
      if (!Array.isArray(entries)) {
        throw new ApiError('unexpected answer to a bulk read', 200);
      }
      for (const entry of entries) {
        const path = typeof entry?.resourcePath === 'string' ? entry.resourcePath : null;
        const gateway = entry?.gatewayResponse;
        if (
          path &&
          entry.serverStatus === 200 &&
          gateway?.status === 200 &&
          gateway.payload &&
          typeof gateway.payload === 'object'
        ) {
          result[path.replace(/^\/resource(?=\/)/, '')] = gateway.payload;
        }
      }
    }
    return result;
  }

  /**
   * Write one resource.
   * @param {string} gatewayId
   * @param {string} path without the `/resource` prefix
   * @param {string|number} value
   */
  async put(gatewayId, path, value) {
    await this.request('PUT', `/gateways/${encodeURIComponent(gatewayId)}/resource${path}`, {
      value,
    });
  }
}
