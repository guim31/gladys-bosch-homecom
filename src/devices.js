// -----------------------------------------------------------------------------
// The Gladys devices of a Bosch account, their states, and the commands.
//
// One device per thing a user places in a room or a scene:
//   - `heat_source`      the heat pump or boiler: outdoor, supply and return
//                        temperatures, pressure, what it is doing, energy, faults;
//   - `heating_circuit`  one per heating circuit (hc1, hc2…): room temperature,
//                        room setpoint, operating mode;
//   - `hot_water`        one per hot water circuit (dhw1…): temperature,
//                        setpoint, mode, one-off charge ("extra hot water");
//   - `air_conditioner`  one per Climate air conditioner.
// External ids are built from the gateway id Bosch gives (its serial number)
// and the circuit id: they never change (see CLAUDE.md).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { NAMES, TEXT, modeLabel, pick } from './i18n.js';

export const DEVICE_TYPES = {
  HEAT_SOURCE: 'heat_source',
  HEATING_CIRCUIT: 'heating_circuit',
  HOT_WATER: 'hot_water',
  AIR_CONDITIONER: 'air_conditioner',
};

export const FEATURE = {
  OUTDOOR_TEMPERATURE: 'outdoor_temperature',
  SUPPLY_TEMPERATURE: 'supply_temperature',
  RETURN_TEMPERATURE: 'return_temperature',
  PRESSURE: 'system_pressure',
  GENERATOR_STATE: 'generator_state',
  ENERGY: 'energy',
  FAULTS: 'faults',
  ROOM_TEMPERATURE: 'room_temperature',
  HUMIDITY: 'humidity',
  TARGET_TEMPERATURE: 'target_temperature',
  OPERATING_MODE: 'operating_mode',
  TEMPERATURE: 'temperature',
  MODE: 'mode',
  BOOST: 'boost',
  POWER: 'power',
  FAN_SPEED: 'fan_speed',
};

// Mirrors of AC_MODE and AC_FAN_SPEED (Gladys server/utils/constants.js,
// v5.2.1), which the SDK does not export. Bosch values on the left.
export const AC_MODES = { auto: 0, cool: 1, heat: 2, dry: 3, fanOnly: 4 };
export const AC_FAN_SPEEDS = { auto: 0, low: 1, mid: 3, high: 5, quiet: 6, turbo: 7 };

const AC_MODE_LABELS = {
  en: { auto: 'Auto', cool: 'Cooling', heat: 'Heating', dry: 'Drying', fanOnly: 'Fan' },
  fr: {
    auto: 'Auto',
    cool: 'Froid',
    heat: 'Chaud',
    dry: 'Déshumidification',
    fanOnly: 'Ventilation',
  },
  de: { auto: 'Auto', cool: 'Kühlen', heat: 'Heizen', dry: 'Entfeuchten', fanOnly: 'Lüften' },
  es: {
    auto: 'Auto',
    cool: 'Frío',
    heat: 'Calor',
    dry: 'Deshumidificación',
    fanOnly: 'Ventilación',
  },
};
const FAN_LABELS = {
  en: { auto: 'Auto', low: 'Low', mid: 'Medium', high: 'High', quiet: 'Quiet', turbo: 'Turbo' },
  fr: {
    auto: 'Auto',
    low: 'Basse',
    mid: 'Moyenne',
    high: 'Haute',
    quiet: 'Silence',
    turbo: 'Turbo',
  },
  de: { auto: 'Auto', low: 'Niedrig', mid: 'Mittel', high: 'Hoch', quiet: 'Leise', turbo: 'Turbo' },
  es: { auto: 'Auto', low: 'Baja', mid: 'Media', high: 'Alta', quiet: 'Silencio', turbo: 'Turbo' },
};
export { AC_MODE_LABELS, FAN_LABELS };

// Every device is published for the core's poll at the slowest pace it
// knows; the container's own timer does the real work (src/poller.js).
const POLLING = { should_poll: true, poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES };

// Display bounds when Bosch gives none (min/max are NOT NULL in Gladys).
const DEFAULT_ROOM_RANGE = { min: 5, max: 30 };
const DEFAULT_WATER_RANGE = { min: 30, max: 70 };

const sensor = (key, name, category, type, unit, min, max) => ({
  key,
  name,
  category,
  type,
  ...(unit ? { unit } : {}),
  min,
  max,
  read_only: true,
  has_feedback: false,
  keep_history: true,
});

const temperature = (key, name, min, max) =>
  sensor(key, name, CATEGORIES.TEMPERATURE_SENSOR, TYPES.SENSOR.DECIMAL, UNITS.CELSIUS, min, max);

const text = (key, name) => ({
  ...sensor(key, name, CATEGORIES.TEXT, TYPES.TEXT.TEXT, undefined, 0, 0),
  keep_history: false,
});

const control = (key, name, category, type, { unit, min, max, writable, options }) => ({
  key,
  name,
  category,
  type,
  ...(unit ? { unit } : {}),
  min,
  max,
  read_only: !writable,
  has_feedback: true,
  keep_history: true,
  ...(options ? { supported_options: options } : {}),
});

const textOptions = (values, language) =>
  values.map((value, index) => ({
    value,
    label: modeLabel(language, value),
    sort_order: index,
  }));

const numericOptions = (values, mapping, labels) =>
  values
    .filter((value) => mapping[value] !== undefined)
    .map((value, index) => ({
      value: mapping[value],
      label: labels[value] ?? value,
      sort_order: index,
    }));

/** The ids of one device, from the gateway and circuit ids. */
export function deviceIds(gladys, type, gatewayId, circuitId) {
  return gladys.externalIds(type, circuitId ? `${gatewayId}-${circuitId}` : gatewayId);
}

const FEATURE_ID =
  /^ext:[^:]+:(heat_source|heating_circuit|hot_water|air_conditioner):([^:]+):([a-z_]+)$/;
const DEVICE_ID = /^ext:[^:]+:(heat_source|heating_circuit|hot_water|air_conditioner):([^:]+)$/;

/**
 * What a device or feature external id points at.
 * @returns {{ type: string, gatewayId: string, circuitId: string|null, key: string|null } | null}
 */
export function parseExternalId(externalId) {
  const match = String(externalId).match(FEATURE_ID) ?? String(externalId).match(DEVICE_ID);
  if (!match) {
    return null;
  }
  const [, type, platformId, key = null] = match;
  const circuit = platformId.match(/^(.+)-((?:hc|dhw)\d{1,2})$/);
  return {
    type,
    gatewayId: circuit ? circuit[1] : platformId,
    circuitId: circuit ? circuit[2] : null,
    key,
  };
}

const circuitNumber = (id) => Number(id.replace(/\D/g, '')) || 1;

/**
 * The feature specs of every device of one gateway model, each with a
 * `present` flag (the model carries the value).
 */
function deviceSpecs(gladys, model, language, suffix) {
  const names = pick(NAMES, language);
  const specs = [];
  const gw = model.gatewayId;

  if (model.kind === 'heating') {
    const { source } = model;
    specs.push({
      type: DEVICE_TYPES.HEAT_SOURCE,
      ids: deviceIds(gladys, DEVICE_TYPES.HEAT_SOURCE, gw),
      name: `${names.heatSource}${suffix}`,
      features: [
        [
          temperature(FEATURE.OUTDOOR_TEMPERATURE, names.outdoorTemperature, -40, 50),
          source.outdoor !== null,
        ],
        [
          temperature(FEATURE.SUPPLY_TEMPERATURE, names.supplyTemperature, 0, 100),
          source.supply !== null,
        ],
        [
          temperature(FEATURE.RETURN_TEMPERATURE, names.returnTemperature, 0, 100),
          source.returnTemp !== null,
        ],
        [
          sensor(
            FEATURE.PRESSURE,
            names.pressure,
            CATEGORIES.PRESSURE_SENSOR,
            TYPES.SENSOR.DECIMAL,
            UNITS.BAR,
            0,
            4,
          ),
          source.pressure !== null,
        ],
        [text(FEATURE.GENERATOR_STATE, names.generatorState), source.state !== null],
        [
          sensor(
            FEATURE.ENERGY,
            names.energy,
            CATEGORIES.ENERGY_SENSOR,
            TYPES.ENERGY_SENSOR.ENERGY,
            UNITS.KILOWATT_HOUR,
            0,
            10000000,
          ),
          source.energy !== null,
        ],
        [text(FEATURE.FAULTS, names.faults), true],
      ],
    });
    for (const hc of model.heatingCircuits) {
      const range = hc.setpointRange ?? DEFAULT_ROOM_RANGE;
      specs.push({
        type: DEVICE_TYPES.HEATING_CIRCUIT,
        ids: deviceIds(gladys, DEVICE_TYPES.HEATING_CIRCUIT, gw, hc.id),
        name: `${names.heatingCircuit(circuitNumber(hc.id))}${suffix}`,
        features: [
          [
            temperature(FEATURE.ROOM_TEMPERATURE, names.roomTemperature, -10, 40),
            hc.roomTemperature !== null,
          ],
          [
            sensor(
              FEATURE.HUMIDITY,
              names.humidity,
              CATEGORIES.HUMIDITY_SENSOR,
              TYPES.SENSOR.DECIMAL,
              UNITS.PERCENT,
              0,
              100,
            ),
            hc.humidity !== null,
          ],
          [
            control(
              FEATURE.TARGET_TEMPERATURE,
              names.targetTemperature,
              CATEGORIES.THERMOSTAT,
              TYPES.THERMOSTAT.TARGET_TEMPERATURE,
              {
                unit: UNITS.CELSIUS,
                min: range.min,
                max: range.max,
                writable: hc.setpointWritable && hc.setpointPath !== null,
              },
            ),
            hc.setpoint !== null || hc.setpointPath !== null,
          ],
          [
            control(
              FEATURE.OPERATING_MODE,
              names.operatingMode,
              CATEGORIES.TEXT,
              TYPES.TEXT.SELECT,
              {
                min: 0,
                max: 0,
                writable: hc.modeWritable,
                options: hc.modes.length ? textOptions(hc.modes, language) : undefined,
              },
            ),
            hc.mode !== null,
          ],
        ],
      });
    }
    for (const dhw of model.hotWater) {
      const range = dhw.setpointSpan ?? DEFAULT_WATER_RANGE;
      specs.push({
        type: DEVICE_TYPES.HOT_WATER,
        ids: deviceIds(gladys, DEVICE_TYPES.HOT_WATER, gw, dhw.id),
        name: `${names.hotWater(circuitNumber(dhw.id))}${suffix}`,
        features: [
          [
            temperature(FEATURE.TEMPERATURE, names.hotWaterTemperature, 0, 80),
            dhw.temperature !== null,
          ],
          [
            control(
              FEATURE.TARGET_TEMPERATURE,
              names.hotWaterSetpoint,
              CATEGORIES.WATER_HEATER,
              TYPES.WATER_HEATER.TARGET_TEMPERATURE,
              {
                unit: UNITS.CELSIUS,
                min: range.min,
                max: range.max,
                writable: dhw.hasLevels,
              },
            ),
            dhw.setpoint !== null || dhw.hasLevels,
          ],
          [
            control(FEATURE.MODE, names.hotWaterMode, CATEGORIES.TEXT, TYPES.TEXT.SELECT, {
              min: 0,
              max: 0,
              writable: dhw.modeWritable,
              options: dhw.modes.length ? textOptions(dhw.modes, language) : undefined,
            }),
            dhw.mode !== null,
          ],
          [
            control(FEATURE.BOOST, names.boost, CATEGORIES.WATER_HEATER, TYPES.WATER_HEATER.BOOST, {
              min: 0,
              max: 1,
              writable: dhw.boostWritable,
            }),
            dhw.boost !== null,
          ],
        ],
      });
    }
  }

  if (model.kind === 'ac') {
    const range = model.setpointRange ?? { min: 16, max: 30 };
    specs.push({
      type: DEVICE_TYPES.AIR_CONDITIONER,
      ids: deviceIds(gladys, DEVICE_TYPES.AIR_CONDITIONER, gw),
      name: `${names.airConditioner}${suffix}`,
      features: [
        [
          control(
            FEATURE.POWER,
            names.power,
            CATEGORIES.AIR_CONDITIONING,
            TYPES.AIR_CONDITIONING.BINARY,
            {
              min: 0,
              max: 1,
              writable: model.powerWritable,
            },
          ),
          model.power !== null,
        ],
        [
          control(
            FEATURE.MODE,
            names.acMode,
            CATEGORIES.AIR_CONDITIONING,
            TYPES.AIR_CONDITIONING.MODE,
            {
              min: 0,
              max: 4,
              writable: model.modeWritable,
              options: model.modes.length
                ? numericOptions(model.modes, AC_MODES, pick(AC_MODE_LABELS, language))
                : undefined,
            },
          ),
          model.mode !== null,
        ],
        [
          control(
            FEATURE.TARGET_TEMPERATURE,
            names.acSetpoint,
            CATEGORIES.AIR_CONDITIONING,
            TYPES.AIR_CONDITIONING.TARGET_TEMPERATURE,
            {
              unit: UNITS.CELSIUS,
              min: range.min,
              max: range.max,
              writable: model.setpointWritable,
            },
          ),
          model.setpoint !== null,
        ],
        [
          control(
            FEATURE.FAN_SPEED,
            names.fanSpeed,
            CATEGORIES.AIR_CONDITIONING,
            TYPES.AIR_CONDITIONING.FAN_SPEED,
            {
              min: 0,
              max: 7,
              writable: model.fanWritable,
              options: model.fanSpeeds.length
                ? numericOptions(model.fanSpeeds, AC_FAN_SPEEDS, pick(FAN_LABELS, language))
                : undefined,
            },
          ),
          model.fanSpeed !== null,
        ],
        [
          temperature(FEATURE.ROOM_TEMPERATURE, names.roomTemperature, -10, 40),
          model.roomTemperature !== null,
        ],
      ],
    });
  }
  return specs;
}

/**
 * The devices to publish for the gateway models.
 * @param {object} gladys
 * @param {object[]} models gateway models (src/bosch/model.js)
 * @param {object} options
 * @param {string} options.language
 * @param {Set<string>} [options.seen] feature external ids published before:
 *   kept even when Bosch skipped them this time, so a sensor that misses one
 *   read never changes the structure of the device (an "Update" button).
 * @returns {{ devices: object[], published: string[] }}
 */
export function buildDevices(gladys, models, { language, seen = new Set() }) {
  const devices = [];
  const published = [];
  const count = (kind) => models.filter((model) => model.kind === kind).length;
  for (const model of models) {
    // Two systems on one account: tell them apart by their gateway id.
    const suffix = count(model.kind) > 1 ? ` (${model.gatewayId})` : '';
    for (const spec of deviceSpecs(gladys, model, language, suffix)) {
      const features = spec.features
        .filter(([feature, present]) => present || seen.has(spec.ids.feature(feature.key)))
        .map(([{ key, ...feature }]) => ({ ...feature, external_id: spec.ids.feature(key) }));
      if (features.length === 0) {
        continue;
      }
      published.push(...features.map((feature) => feature.external_id));
      devices.push({
        name: `Bosch ${spec.name}`,
        external_id: spec.ids.device,
        ...POLLING,
        features,
      });
    }
  }
  return { devices, published };
}

const round = (value, step = 0.1) => Math.round(value / step) * step;
const num = (value) =>
  value === null || value === undefined ? null : Number(round(value).toFixed(1));

/**
 * The states of one gateway model, for publishChangedStates.
 * @returns {Array<{ device_feature_external_id: string, state?: number, text?: string }>}
 */
export function modelStates(gladys, model, language) {
  const states = [];
  const push = (ids, key, value) => {
    if (value === null || value === undefined) {
      return;
    }
    const entry = { device_feature_external_id: ids.feature(key) };
    if (typeof value === 'string') {
      entry.text = value;
    } else {
      entry.state = value;
    }
    states.push(entry);
  };
  const gw = model.gatewayId;

  if (model.kind === 'heating') {
    const ids = deviceIds(gladys, DEVICE_TYPES.HEAT_SOURCE, gw);
    const { source } = model;
    push(ids, FEATURE.OUTDOOR_TEMPERATURE, num(source.outdoor));
    push(ids, FEATURE.SUPPLY_TEMPERATURE, num(source.supply));
    push(ids, FEATURE.RETURN_TEMPERATURE, num(source.returnTemp));
    push(
      ids,
      FEATURE.PRESSURE,
      source.pressure === null ? null : Number(source.pressure.toFixed(2)),
    );
    push(ids, FEATURE.GENERATOR_STATE, source.state ? pick(TEXT[source.state], language) : null);
    push(ids, FEATURE.ENERGY, source.energy);
    push(ids, FEATURE.FAULTS, faultsText(model.faults, language));
    for (const hc of model.heatingCircuits) {
      const hcIds = deviceIds(gladys, DEVICE_TYPES.HEATING_CIRCUIT, gw, hc.id);
      push(hcIds, FEATURE.ROOM_TEMPERATURE, num(hc.roomTemperature));
      push(hcIds, FEATURE.HUMIDITY, num(hc.humidity));
      push(hcIds, FEATURE.TARGET_TEMPERATURE, num(hc.setpoint));
      push(hcIds, FEATURE.OPERATING_MODE, hc.mode);
    }
    for (const dhw of model.hotWater) {
      const dhwIds = deviceIds(gladys, DEVICE_TYPES.HOT_WATER, gw, dhw.id);
      push(dhwIds, FEATURE.TEMPERATURE, num(dhw.temperature));
      push(dhwIds, FEATURE.TARGET_TEMPERATURE, num(dhw.setpoint));
      push(dhwIds, FEATURE.MODE, dhw.mode);
      push(dhwIds, FEATURE.BOOST, dhw.boost === null ? null : Number(dhw.boost));
    }
  }

  if (model.kind === 'ac' && model.available) {
    const ids = deviceIds(gladys, DEVICE_TYPES.AIR_CONDITIONER, gw);
    push(ids, FEATURE.POWER, model.power === null ? null : Number(model.power));
    push(ids, FEATURE.MODE, AC_MODES[model.mode]);
    push(ids, FEATURE.TARGET_TEMPERATURE, num(model.setpoint));
    push(ids, FEATURE.FAN_SPEED, AC_FAN_SPEEDS[model.fanSpeed]);
    push(ids, FEATURE.ROOM_TEMPERATURE, num(model.roomTemperature));
  }
  return states;
}

/** "No fault", or the active codes (never an empty text: Gladys drops it). */
export function faultsText(faults, language) {
  const active = [...new Set(faults.filter((fault) => fault.active).map((fault) => fault.code))];
  return active.length ? active.join(', ').slice(0, 250) : pick(TEXT.noFault, language);
}

/** A command refused before reaching Bosch, with the reason. */
export class CommandError extends Error {}

function checkRange(value, range, what) {
  if (!Number.isFinite(value)) {
    throw new CommandError(`${what}: ${value} is not a number`);
  }
  if (range && (value < range.min || value > range.max)) {
    throw new CommandError(`${what}: ${value} is outside ${range.min}–${range.max} °C`);
  }
}

/**
 * Turn a Gladys command into the Bosch write it means.
 * @param {object} model the latest model of the gateway
 * @param {{ type: string, circuitId: string|null, key: string }} target from parseExternalId
 * @param {number|string} value
 * @returns {{ path: string, value: string|number, state: object }} the write, and the
 *   state to publish once Bosch accepted it
 */
export function planCommand(model, target, value) {
  const { type, circuitId, key } = target;
  const setpoint = (number) => Math.round(Number(number) * 2) / 2;

  if (type === DEVICE_TYPES.HEATING_CIRCUIT && model.kind === 'heating') {
    const hc = model.heatingCircuits.find((circuit) => circuit.id === circuitId);
    if (!hc) {
      throw new CommandError(`heating circuit ${circuitId} not found`);
    }
    const base = `/heatingCircuits/${hc.id}`;
    if (key === FEATURE.TARGET_TEMPERATURE) {
      if (!hc.setpointWritable || !hc.setpointPath) {
        throw new CommandError('this room setpoint cannot be changed from the cloud');
      }
      const target = setpoint(value);
      checkRange(target, hc.setpointRange, 'room setpoint');
      return { path: `${base}${hc.setpointPath}`, value: target, state: { state: target } };
    }
    if (key === FEATURE.OPERATING_MODE) {
      return modeCommand(hc, `${base}/operationMode`, value);
    }
  }

  if (type === DEVICE_TYPES.HOT_WATER && model.kind === 'heating') {
    const dhw = model.hotWater.find((circuit) => circuit.id === circuitId);
    if (!dhw) {
      throw new CommandError(`hot water circuit ${circuitId} not found`);
    }
    const base = `/dhwCircuits/${dhw.id}`;
    if (key === FEATURE.TARGET_TEMPERATURE) {
      if (!dhw.activeLevel || !dhw.setpointWritable) {
        throw new CommandError(
          `the hot water setpoint cannot be changed in mode "${dhw.mode}": choose a mode with a temperature level`,
        );
      }
      const target = Math.round(Number(value));
      checkRange(target, dhw.setpointRange, 'hot water setpoint');
      return {
        path: `${base}/temperatureLevels/${dhw.activeLevel}`,
        value: target,
        state: { state: target },
      };
    }
    if (key === FEATURE.MODE) {
      return modeCommand(dhw, `${base}/operationMode`, value);
    }
    if (key === FEATURE.BOOST) {
      if (!dhw.boostWritable) {
        throw new CommandError('the hot water charge cannot be started from the cloud');
      }
      const on = Number(value) === 1;
      return { path: `${base}/charge`, value: on ? 'start' : 'stop', state: { state: Number(on) } };
    }
  }

  if (type === DEVICE_TYPES.AIR_CONDITIONER && model.kind === 'ac') {
    if (key === FEATURE.POWER) {
      if (!model.powerWritable) {
        throw new CommandError('the air conditioner cannot be switched from the cloud');
      }
      const on = Number(value) === 1;
      return {
        path: '/airConditioning/acControl',
        value: on ? 'on' : 'off',
        state: { state: Number(on) },
      };
    }
    if (key === FEATURE.MODE) {
      const mode = Object.keys(AC_MODES).find((name) => AC_MODES[name] === Number(value));
      if (!mode || !model.modes.includes(mode) || !model.modeWritable) {
        throw new CommandError(`mode ${value} is not offered by this air conditioner`);
      }
      return {
        path: '/airConditioning/operationMode',
        value: mode,
        state: { state: Number(value) },
      };
    }
    if (key === FEATURE.FAN_SPEED) {
      const speed = Object.keys(AC_FAN_SPEEDS).find(
        (name) => AC_FAN_SPEEDS[name] === Number(value),
      );
      if (!speed || !model.fanSpeeds.includes(speed) || !model.fanWritable) {
        throw new CommandError(`fan speed ${value} is not offered by this air conditioner`);
      }
      return { path: '/airConditioning/fanSpeed', value: speed, state: { state: Number(value) } };
    }
    if (key === FEATURE.TARGET_TEMPERATURE) {
      if (!model.setpointWritable) {
        throw new CommandError('this setpoint cannot be changed from the cloud');
      }
      const target = setpoint(value);
      checkRange(target, model.setpointRange, 'setpoint');
      return {
        path: '/airConditioning/temperatureSetpoint',
        value: target,
        state: { state: target },
      };
    }
  }

  throw new CommandError(`${type}/${key} cannot be controlled`);
}

function modeCommand(circuit, path, value) {
  const mode = String(value);
  if (!circuit.modeWritable || !circuit.modes.includes(mode)) {
    throw new CommandError(`mode "${mode}" is not offered (${circuit.modes.join(', ') || 'none'})`);
  }
  return { path, value: mode, state: { text: mode } };
}
