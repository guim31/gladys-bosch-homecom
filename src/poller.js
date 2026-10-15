// -----------------------------------------------------------------------------
// The container's own refresh timer.
//
// The devices are published with `should_poll: true` and a valid
// `poll_frequency`, but the core cannot be trusted to call onPoll: Gladys
// 5.2.x skips devices created without `should_poll`, and a device keeps the
// polling fields it was created with (GladysAssistant/Gladys#3198). So the
// container reads the Bosch cloud by itself, at the configured pace, and the
// core's onPoll stays as a fallback.
//
// One read per gateway serves all its devices (heat source, circuits, hot
// water). No double work: the timer skips a gateway read less than half a
// period ago, the core's onPoll one read less than 90 % of a period ago — so
// while the timer runs, the core never triggers a cloud read; it takes over
// only if the timer stalls.
//
// Only the gateways with a device the user added to Gladys are read: the core
// drops the states of a device it does not know.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { parseExternalId } from './devices.js';

const logger = createLogger({ name: 'bosch-poller' });

/**
 * @param {object} options
 * @param {object} options.gladys
 * @param {() => number} options.periodMs the refresh period
 * @param {(gatewayId: string) => Promise<void>} options.readGateway reads and publishes one gateway
 * @param {() => boolean} options.canRead false while no account is linked
 * @param {boolean} [options.timers] run the periodic timer (tests turn it off)
 * @param {() => number} [options.now]
 */
export function createPoller({
  gladys,
  periodMs,
  readGateway,
  canRead,
  timers = true,
  now = () => Date.now(),
}) {
  /** When each gateway was last read (start of the read). */
  const lastReadAt = new Map();
  /** Reads in progress, by gateway: a second caller waits for the same one. */
  const inFlight = new Map();
  let timer = null;
  let stopped = true;

  /** The gateways of the devices the user added to Gladys. */
  function createdGateways() {
    const ids = new Set();
    for (const device of gladys.devices ?? []) {
      const target = parseExternalId(device.external_id);
      if (target) {
        ids.add(target.gatewayId);
      }
    }
    return [...ids];
  }

  async function poll(gatewayId, { force = false, minGap = 0.5 } = {}) {
    let running = inFlight.get(gatewayId);
    while (running && force) {
      await running.catch(() => {});
      running = inFlight.get(gatewayId);
    }
    if (running) {
      return running;
    }
    const last = lastReadAt.get(gatewayId);
    if (!force && last !== undefined && now() - last < periodMs() * minGap) {
      logger.debug(`${gatewayId}: read ${now() - last} ms ago, skipped`);
      return undefined;
    }
    lastReadAt.set(gatewayId, now());
    const run = readGateway(gatewayId);
    inFlight.set(gatewayId, run);
    try {
      return await run;
    } finally {
      inFlight.delete(gatewayId);
    }
  }

  /** One cycle: every gateway with an added device, errors already reported. */
  async function cycle({ force = false } = {}) {
    if (gladys.connected === false || !canRead()) {
      logger.debug('Refresh skipped (Gladys unreachable or no Bosch account)');
      return;
    }
    // One gateway after the other: a handful of requests, never a burst.
    for (const gatewayId of createdGateways()) {
      await poll(gatewayId, { force }).catch(() => {});
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await cycle();
      } catch (err) {
        logger.error(`Refresh cycle failed (${err.message})`);
      } finally {
        schedule();
      }
    }, periodMs());
    timer.unref?.();
  }

  return {
    createdGateways,
    cycle,

    /** (Re)start: reads every added gateway now, then every period. */
    async restart() {
      stopped = false;
      lastReadAt.clear();
      schedule();
      await cycle({ force: true });
    },

    /** The core's onPoll (fallback): reads the gateway unless the timer just did. */
    async pollFromCore(device) {
      const target = parseExternalId(device.external_id);
      if (!target || !canRead()) {
        return;
      }
      await poll(target.gatewayId, { minGap: 0.9 });
    },

    /** A device was just added: its states now, not a period later. */
    async pollDevice(device) {
      const target = parseExternalId(device.external_id);
      if (!target || !canRead()) {
        return;
      }
      await poll(target.gatewayId, { force: true }).catch(() => {});
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
}
