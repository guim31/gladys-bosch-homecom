// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake Gladys)
// and returns the running app, so index.js stays a few lines and the tests
// drive the very same wiring.
//
// Lifecycle:
//   1. "Connect" (account_link field): a SingleKey ID login address with a
//      fresh PKCE verifier, kept in /data;
//   2. the user pastes the code → exchanged for the tokens, the refresh token
//      kept in /data;
//   3. the gateways of the account are read and published as devices;
//   4. every `refresh_minutes`, the gateways with an added device are read
//      again and the changed values published (src/poller.js).
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { createLogin, AuthError } from './bosch/auth.js';
import { BoschCloud } from './bosch/client.js';
import { gatewayKind, readGateway } from './bosch/model.js';
import { normalizeConfig, refreshPeriodMs } from './config.js';
import {
  CommandError,
  DEVICE_TYPES,
  buildDevices,
  deviceIds,
  modelStates,
  parseExternalId,
  planCommand,
} from './devices.js';
import { MESSAGES, pick } from './i18n.js';
import { createIssueLog } from './issues.js';
import { createPoller } from './poller.js';
import { Store } from './store.js';
import { WIDGET_KEY, buildWidgetContent, noticeContent, widgetSignature } from './widgets.js';

const logger = createLogger({ name: 'bosch-homecom' });

export const ACTION_KEYS = { TEST_CONNECTION: 'test_connection' };
export const SCENE_TRIGGERS = { FAULT_REPORTED: 'fault_reported' };
export const ACCOUNT_FIELD = 'bosch_account';

// A stable value is sent again at least this often: past 48 h without a
// state, the Gladys front shows "no recent value".
export const HEARTBEAT_MS = 12 * 60 * 60 * 1000;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams
 * @param {Store} [options.store]
 * @param {Function} [options.fetch]
 * @param {boolean} [options.timers] run the refresh timer
 * @param {() => number} [options.now]
 * @param {Function} [options.random] random bytes for the login (tests)
 */
export function registerHandlers(gladys, options = {}) {
  const store = options.store ?? new Store();
  const now = options.now ?? (() => Date.now());
  const cloud = new BoschCloud({ fetch: options.fetch, store, now });
  const issues = createIssueLog(logger);

  let config = normalizeConfig();
  /** Latest model of each supported gateway, by gateway id. */
  const models = new Map();
  /** Feature external ids published at least once (persisted). */
  let seen = new Set();
  let lastStatus = null;
  const signatures = new Map();

  const ready = store.load().then((data) => {
    seen = new Set(Array.isArray(data.seen) ? data.seen : []);
    for (const model of Object.values(data.models ?? {})) {
      if (model?.gatewayId && model.kind) {
        models.set(model.gatewayId, model);
      }
    }
  });

  async function setStatus(connected, message) {
    const key = JSON.stringify([connected, message?.en ?? null]);
    if (key === lastStatus) {
      return;
    }
    lastStatus = key;
    await gladys.setConnectionStatus(connected, message).catch((err) => {
      lastStatus = null;
      logger.debug(`setConnectionStatus failed (${err.message})`);
    });
  }

  /** What fails now, by key ('account', or a gateway id): one line each. */
  const failing = new Set();

  /** A failure of the cloud: an expired login, or an outage. */
  async function reportFailure(err, what, key = 'account') {
    if (err instanceof AuthError) {
      if (cloud.hasAccount()) {
        logger.warn(`Bosch sign-in refused (${err.code ?? err.message}): a new login is needed`);
        await cloud.unlink();
      }
      poller.stop();
      await setStatus(false, MESSAGES.loginExpired);
      return;
    }
    failing.add(key);
    issues.fail(key, `${what} failed: ${err.message}`);
    await setStatus(false, MESSAGES.cloudUnreachable(err.message.slice(0, 80)));
  }

  async function reportSuccess(key = 'account') {
    failing.delete(key);
    issues.ok(
      key,
      key === 'account' ? 'The Bosch cloud answers again' : `${key}: the Bosch cloud answers again`,
    );
    if (failing.size === 0) {
      await setStatus(true);
    }
  }

  // --- Devices ---------------------------------------------------------------

  async function publishDevices() {
    const list = [...models.values()];
    const { devices, published } = buildDevices(gladys, list, { language: config.language, seen });
    await gladys.publishDiscoveredDevices(devices);
    const before = seen.size;
    for (const id of published) {
      seen.add(id);
    }
    if (seen.size !== before) {
      await store.set('seen', [...seen]).catch(() => {});
    }
  }

  /** Read the account: its gateways, each supported one, then publish. */
  async function discover() {
    if (!cloud.hasAccount()) {
      await publishDevices();
      return false;
    }
    try {
      const gateways = await cloud.getGateways();
      const supported = gateways.filter((gateway) => gatewayKind(gateway.deviceType));
      const known = new Set(supported.map((gateway) => gateway.deviceId));
      for (const id of models.keys()) {
        if (!known.has(id)) {
          models.delete(id);
        }
      }
      for (const gateway of supported) {
        // One appliance that does not answer keeps its last model; the others
        // are read.
        try {
          const model = await readGateway(cloud, gateway);
          models.set(gateway.deviceId, model);
          await reportSuccess(gateway.deviceId);
        } catch (err) {
          if (err instanceof AuthError) {
            throw err;
          }
          await reportFailure(
            err,
            `Reading ${gateway.deviceType} ${gateway.deviceId}`,
            gateway.deviceId,
          );
        }
      }
      const summary = gateways.map((g) => `${g.deviceType || '?'}`).join(', ') || 'none';
      logger.info(
        `Bosch account read: ${gateways.length} gateway(s) (${summary}), ${supported.length} supported`,
      );
      await store.set('models', Object.fromEntries(models)).catch(() => {});
      await publishDevices();
      await reportSuccess();
      if (supported.length === 0) {
        await setStatus(true, MESSAGES.noGateway);
      }
      return true;
    } catch (err) {
      await reportFailure(err, 'Reading the Bosch account');
      // The devices seen last stay in the Discovery tab.
      await publishDevices().catch(() => {});
      return false;
    }
  }

  // --- Refresh -----------------------------------------------------------------

  async function refreshGateway(gatewayId) {
    const previous = models.get(gatewayId);
    const gateway = { deviceId: gatewayId, deviceType: previous?.deviceType ?? '' };
    try {
      if (!previous) {
        // Never read (a device added before a reinstall): ask Bosch what it is.
        const found = (await cloud.getGateways()).find((entry) => entry.deviceId === gatewayId);
        if (!found || !gatewayKind(found.deviceType)) {
          logger.debug(`${gatewayId}: not a supported gateway of the account`);
          return;
        }
        gateway.deviceType = found.deviceType;
      }
      const model = await readGateway(cloud, gateway);
      models.set(gatewayId, model);
      await reportSuccess(gatewayId);
      await gladys.publishChangedStates(modelStates(gladys, model, config.language), {
        heartbeat: HEARTBEAT_MS,
      });
      logger.debug(`${gatewayId}: read`);
      await afterRead(model);
    } catch (err) {
      await reportFailure(
        err,
        `Refreshing ${gateway.deviceType || 'gateway'} ${gatewayId}`,
        gatewayId,
      );
      throw err;
    }
  }

  async function afterRead(model) {
    // A circuit or a sensor Bosch did not show before: publish it.
    const { published } = buildDevices(gladys, [...models.values()], {
      language: config.language,
      seen,
    });
    if (published.some((id) => !seen.has(id))) {
      logger.info(`${model.gatewayId}: new circuit or sensor, devices published again`);
      await publishDevices();
    }
    await reportNewFaults(model);
    const signature = widgetSignature(model);
    if (signature !== null && signatures.get(model.gatewayId) !== signature) {
      const first = !signatures.has(model.gatewayId);
      signatures.set(model.gatewayId, signature);
      if (!first) {
        gladys.requestWidgetRefresh(WIDGET_KEY);
      }
    }
  }

  // A new active fault code fires the `fault_reported` trigger once. The codes
  // already active when the account is linked are taken as known: no alert
  // storm at installation.
  async function reportNewFaults(model) {
    const faults = store.get('faults') ?? {};
    const active = [...new Set(model.faults.filter((f) => f.active).map((f) => f.code))].sort();
    const known = faults[model.gatewayId];
    if (Array.isArray(known)) {
      const type = model.kind === 'ac' ? DEVICE_TYPES.AIR_CONDITIONER : DEVICE_TYPES.HEAT_SOURCE;
      const device = deviceIds(gladys, type, model.gatewayId).device;
      for (const code of active.filter((code) => !known.includes(code))) {
        logger.info(`${model.gatewayId}: fault ${code} reported`);
        await gladys
          .publishSceneEvent(SCENE_TRIGGERS.FAULT_REPORTED, { device, code })
          .catch((err) => logger.warn(`Scene event refused: ${err.message}`));
      }
    }
    if (!Array.isArray(known) || known.join() !== active.join()) {
      await store.set('faults', { ...faults, [model.gatewayId]: active }).catch(() => {});
    }
  }

  const poller = createPoller({
    gladys,
    periodMs: () => refreshPeriodMs(config),
    readGateway: refreshGateway,
    canRead: () => cloud.hasAccount(),
    timers: options.timers ?? true,
    now,
  });

  // --- Account link ------------------------------------------------------------

  /**
   * The code pasted in the configuration: exchanged once.
   * @returns {Promise<boolean>} true when the status already says why it failed
   */
  async function linkWithCode() {
    const code = config.authCode;
    if (!code) {
      return false;
    }
    const hash = sha256(code);
    if (store.get('last_code') === hash) {
      return false; // already tried (linked, or refused): a new code is needed
    }
    try {
      await cloud.link(code);
      await store.set('last_code', hash).catch(() => {});
      failing.clear();
      logger.info('Bosch account linked');
      lastStatus = null;
      return false;
    } catch (err) {
      if (err instanceof AuthError) {
        await store.set('last_code', hash).catch(() => {});
        logger.warn(`Bosch account link refused (${err.code ?? err.message})`);
        await setStatus(
          false,
          err.code === 'no_login' ? MESSAGES.noLoginStarted : MESSAGES.codeRefused,
        );
        return true;
      }
      // SingleKey ID unreachable: the code may still be valid, tried again later.
      await reportFailure(err, 'Linking the Bosch account');
      return true;
    }
  }

  async function start() {
    await ready;
    const explained = await linkWithCode();
    if (!cloud.hasAccount()) {
      poller.stop();
      await publishDevices().catch((err) =>
        logger.warn(`Publishing the devices failed: ${err.message}`),
      );
      if (!explained) {
        await setStatus(false, MESSAGES.notLinked);
      }
      return;
    }
    await discover();
    await poller.restart();
  }

  gladys.onOAuthAuthorizeUrl(async (key) => {
    await ready;
    const login = createLogin(config.brand, options.random);
    await store.set('login', {
      verifier: login.verifier,
      brand: login.brand,
      created_at: new Date(now()).toISOString(),
    });
    logger.info(`Bosch login address handed out (${key}, ${login.brand})`);
    return login.url;
  });

  // --- Gladys events ---------------------------------------------------------

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await start();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys.setConnectionStatus(false, MESSAGES.initFailed).catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    poller.stop();
  });

  gladys.onConfigUpdated(async (raw) => {
    const previous = config;
    config = normalizeConfig(raw);
    logger.info('Configuration updated');
    if (previous.language !== config.language && cloud.hasAccount()) {
      // New option labels (names stay: Gladys keeps those of the creation).
      await publishDevices().catch(() => {});
      await gladys.forgetPublishedStates();
    }
    await start();
  });

  gladys.onScanRequest(async () => {
    logger.info('Scan requested');
    await ready;
    await discover();
  });

  gladys.onPoll((device) => poller.pollFromCore(device));
  gladys.onDeviceCreated(async (device) => {
    // Everything again: Gladys dropped the states of the features it did not
    // have yet. The SDK forgot what it had published for that device.
    await poller.pollDevice(device);
    gladys.requestWidgetRefresh(WIDGET_KEY);
  });
  gladys.onDeviceUpdated((device) => poller.pollDevice(device));

  gladys.onSetValue(async (device, feature, value) => {
    const target = parseExternalId(feature.external_id);
    if (!target?.key) {
      throw new Error(`Unknown feature ${feature.external_id}`);
    }
    logger.info(`Command ${target.type}/${target.key} = ${value} (${target.gatewayId})`);
    let model = models.get(target.gatewayId);
    if (!model) {
      await refreshGateway(target.gatewayId);
      model = models.get(target.gatewayId);
    }
    if (!model) {
      throw new Error(`Bosch gateway ${target.gatewayId} not found`);
    }
    let plan;
    try {
      plan = planCommand(model, target, value);
    } catch (err) {
      if (err instanceof CommandError) {
        logger.warn(`Command refused: ${err.message}`);
      }
      throw err;
    }
    try {
      await cloud.put(target.gatewayId, plan.path, plan.value);
    } catch (err) {
      await reportFailure(err, 'Sending the command');
      throw err;
    }
    // Bosch takes a while to show the new value: shown now, confirmed (or
    // corrected) by the next read.
    await gladys.publishChangedStates([
      { device_feature_external_id: feature.external_id, ...plan.state },
    ]);
  });

  gladys.onAction(ACTION_KEYS.TEST_CONNECTION, async () => {
    await ready;
    logger.info('Action: test the connection');
    if (!cloud.hasAccount()) {
      return MESSAGES.notLinked;
    }
    try {
      const gateways = await cloud.getGateways();
      await reportSuccess();
      const describe = (list) => list.map((g) => `${g.deviceType || '?'} ${g.deviceId}`).join(', ');
      return MESSAGES.gateways(
        describe(gateways.filter((g) => gatewayKind(g.deviceType))),
        describe(gateways.filter((g) => !gatewayKind(g.deviceType))),
      );
    } catch (err) {
      await reportFailure(err, 'Testing the connection');
      return err instanceof AuthError
        ? MESSAGES.loginExpired
        : MESSAGES.cloudUnreachable(err.message.slice(0, 80));
    }
  });

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings, language } = {}) => {
    await ready;
    const lang = ['en', 'fr', 'de', 'es'].includes(language) ? language : config.language;
    const created = new Set(
      (gladys.devices ?? []).flatMap((device) => (device.features ?? []).map((f) => f.external_id)),
    );
    const chosen = settings?.device ? parseExternalId(settings.device)?.gatewayId : null;
    const heating = [...models.values()].filter((model) => model.kind === 'heating');
    const model =
      (chosen ? heating.find((m) => m.gatewayId === chosen) : null) ??
      heating.find((m) =>
        created.has(deviceIds(gladys, DEVICE_TYPES.HEAT_SOURCE, m.gatewayId).feature('faults')),
      ) ??
      null;
    if (!cloud.hasAccount()) {
      return noticeContent(MESSAGES.notLinked, lang);
    }
    return buildWidgetContent({
      gladys,
      model,
      created,
      language: lang,
      ttlSeconds: refreshPeriodMs(config) / 1000,
    });
  });

  return {
    ready,
    cloud,
    store,
    models,
    poller,
    get config() {
      return config;
    },
    async stop() {
      poller.stop();
      await store.flush();
    },
    pick: (texts) => pick(texts, config.language),
  };
}
