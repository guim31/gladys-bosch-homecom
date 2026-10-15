// -----------------------------------------------------------------------------
// From the Bosch resources to a plain model of one gateway.
//
// Every resource answers the same envelope:
//   { id, type: 'floatValue'|'stringValue'|'refEnum'|..., writeable: 0|1,
//     value, unitOfMeasure?, minValue?, maxValue?, allowedValues? }
// A collection (`/heatingCircuits`) lists its members in `references`.
//
// Supported gateways (deviceType of the gateway list):
//   - heating: `k30`, `k40` (Connect-Key K 30 RF / K 40 RF: Compress 5800i,
//     6800i heat pumps, Condens boilers) and `icom` (Compress 7000i/7001i AW);
//   - air conditioning: `rac` (Climate 3000i, 5000i, 6000i).
// Paths and their meaning: `homecom_alt` (MIT, serbanb11) and its Home
// Assistant integration, which run them on real appliances.
// -----------------------------------------------------------------------------

export const HEATING_TYPES = ['k30', 'k40', 'icom'];
export const AC_TYPES = ['rac'];

/** 'heating' | 'ac' | null (not supported). */
export function gatewayKind(deviceType) {
  const type = String(deviceType ?? '').toLowerCase();
  if (HEATING_TYPES.includes(type)) {
    return 'heating';
  }
  if (AC_TYPES.includes(type)) {
    return 'ac';
  }
  return null;
}

export const ROOT_PATHS = {
  notifications: '/notifications',
  heatingCircuits: '/heatingCircuits',
  dhwCircuits: '/dhwCircuits',
  outdoor: '/system/sensors/temperatures/outdoor_t1',
  supply: '/heatSources/actualSupplyTemperature',
  returnTemp: '/heatSources/returnTemperature',
  pressure: '/heatSources/systemPressure',
  demand: '/heatSources/actualHeatDemand',
  flame: '/heatSources/flameIndication',
  energy: '/heatSources/emon/totalConsumption',
};

export const HC_PATHS = {
  mode: '/operationMode',
  room: '/roomtemperature',
  humidity: '/actualHumidity',
  current: '/currentRoomSetpoint',
  manual: '/manualRoomSetpoint',
  temporary: '/temporaryRoomSetpoint',
  cooling: '/cooling/roomTempSetpoint',
  suwi: '/currentSuWiMode',
  heatCool: '/heatCoolMode',
};

export const DHW_LEVELS = ['high', 'low', 'eco'];

export const DHW_PATHS = {
  mode: '/operationMode',
  actual: '/actualTemp',
  level: '/currentTemperatureLevel',
  setpoint: '/currentSetpoint',
  charge: '/charge',
  ...Object.fromEntries(DHW_LEVELS.map((level) => [level, `/temperatureLevels/${level}`])),
};

export const AC_PATHS = {
  notifications: '/notifications',
  standard: '/airConditioning/standardFunctions',
};

// Plausible ranges: an absent sensor answers a sentinel (-3276.8, 3276.7…).
const RANGES = {
  room: [-40, 60],
  water: [0, 100],
  outdoor: [-60, 70],
  flow: [-20, 120],
  pressure: [0, 10],
  humidity: [0, 100],
};

/** A finite number of the payload, within the range, or null. */
export function readNumber(payload, range) {
  const value = payload?.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (range && (value < range[0] || value > range[1])) {
    return null;
  }
  return value;
}

const readString = (payload) =>
  typeof payload?.value === 'string' && payload.value !== '' ? payload.value : null;

const isWriteable = (payload) => Boolean(payload) && payload.writeable !== 0;

const allowed = (payload) =>
  Array.isArray(payload?.allowedValues)
    ? payload.allowedValues.filter((value) => typeof value === 'string' && value !== '')
    : [];

function bounds(payload) {
  const min = payload?.minValue;
  const max = payload?.maxValue;
  return Number.isFinite(min) && Number.isFinite(max) && min < max ? { min, max } : null;
}

/** The ids of a collection (`/heatingCircuits` → ['hc1', 'hc2']). */
export function memberIds(collection, pattern) {
  const references = Array.isArray(collection?.references) ? collection.references : [];
  return references
    .map((reference) =>
      String(reference?.id ?? '')
        .split('/')
        .pop(),
    )
    .filter((id) => pattern.test(id));
}

export const HC_ID = /^hc\d{1,2}$/;
export const DHW_ID = /^dhw\d{1,2}$/;

/** Paths of the second read, once the circuits are known. */
export function circuitPaths(hcIds, dhwIds) {
  return [
    ...hcIds.flatMap((id) =>
      Object.values(HC_PATHS).map((path) => `${ROOT_PATHS.heatingCircuits}/${id}${path}`),
    ),
    ...dhwIds.flatMap((id) =>
      Object.values(DHW_PATHS).map((path) => `${ROOT_PATHS.dhwCircuits}/${id}${path}`),
    ),
  ];
}

/** Active and past faults of the `/notifications` resource. */
export function readFaults(payload) {
  const values = Array.isArray(payload?.values) ? payload.values : [];
  return values
    .filter((item) => item && (item.dcd !== undefined || item.ccd !== undefined))
    .map((item) => {
      const display = String(item.dcd ?? '').trim();
      const cause = String(item.ccd ?? '').trim();
      return {
        code: display && cause ? `${display}-${cause}` : display || cause,
        // `act: 'H'` marks an entry of the history, no longer active.
        active: item.act !== 'H',
      };
    })
    .filter((fault) => fault.code !== '');
}

// What the heat source is doing. K30/K40 list the demands (`values`), boilers
// tell which circuit the flame serves (`value`); a number (ICOM) is a
// percentage, not a state.
function readDemand(demand, flame) {
  if (Array.isArray(demand?.values)) {
    const values = demand.values.filter((value) => typeof value === 'string');
    if (values.includes('ch')) return 'heating';
    if (values.includes('dhw')) return 'hot_water';
    if (values.includes('frost')) return 'frost';
    if (values.includes('pool')) return 'pool';
    return 'idle';
  }
  const value = readString(flame);
  if (value === null) {
    return null;
  }
  return { ch: 'heating', dhw: 'hot_water', off: 'idle', none: 'idle' }[value] ?? 'idle';
}

// Where a new room setpoint is written, as the HomeCom Easy app does (and the
// Home Assistant integration, tested on the appliances): in cooling, the
// cooling setpoint (the others answer 404 then); on ICOM, the temporary
// setpoint; on K30/K40, the manual setpoint.
function setpointPath(deviceType, at, cooling) {
  if (cooling && at(HC_PATHS.cooling)) {
    return HC_PATHS.cooling;
  }
  if (deviceType === 'icom' && at(HC_PATHS.temporary)) {
    return HC_PATHS.temporary;
  }
  if (at(HC_PATHS.manual)) {
    return HC_PATHS.manual;
  }
  return at(HC_PATHS.temporary) ? HC_PATHS.temporary : null;
}

function readHeatingCircuit(id, resources, deviceType) {
  const at = (path) => resources[`${ROOT_PATHS.heatingCircuits}/${id}${path}`];
  const mode = at(HC_PATHS.mode);
  const suwi = readString(at(HC_PATHS.suwi));
  const heatCool = readString(at(HC_PATHS.heatCool));
  const cooling = suwi === 'cooling' || heatCool === 'cooling';
  const manual = at(HC_PATHS.manual);
  const current = at(HC_PATHS.current);
  const writePath = setpointPath(deviceType, at, cooling);
  const writeTarget = writePath ? at(writePath) : undefined;
  return {
    id,
    roomTemperature: readNumber(at(HC_PATHS.room), RANGES.room),
    humidity: readNumber(at(HC_PATHS.humidity), RANGES.humidity),
    setpoint: readNumber(current, RANGES.room) ?? readNumber(writeTarget, RANGES.room),
    setpointRange: bounds(writeTarget) ?? bounds(manual) ?? bounds(current),
    setpointWritable: isWriteable(writeTarget),
    setpointPath: writePath,
    mode: readString(mode),
    modes: allowed(mode),
    modeWritable: isWriteable(mode) && allowed(mode).length > 0,
    cooling,
  };
}

function readHotWater(id, resources) {
  const at = (path) => resources[`${ROOT_PATHS.dhwCircuits}/${id}${path}`];
  const mode = at(DHW_PATHS.mode);
  const modeValue = readString(mode);
  const levels = Object.fromEntries(
    DHW_LEVELS.filter((level) => at(DHW_PATHS[level])).map((level) => [
      level,
      at(DHW_PATHS[level]),
    ]),
  );
  // The level the water is heated to now: the mode itself when it is a level
  // (K40 `low`/`high`/`eco`), else the level the programme selected.
  const activeLevel = modeValue && levels[modeValue] ? modeValue : readString(at(DHW_PATHS.level));
  const levelPayload = activeLevel ? levels[activeLevel] : undefined;
  const charge = at(DHW_PATHS.charge);
  const chargeValue = readString(charge);
  const ranges = Object.values(levels).map(bounds).filter(Boolean);
  return {
    id,
    temperature: readNumber(at(DHW_PATHS.actual), RANGES.water),
    mode: modeValue,
    modes: allowed(mode),
    modeWritable: isWriteable(mode) && allowed(mode).length > 0,
    activeLevel: levelPayload ? activeLevel : null,
    setpoint:
      readNumber(at(DHW_PATHS.setpoint), RANGES.water) ?? readNumber(levelPayload, RANGES.water),
    setpointRange: bounds(levelPayload),
    // The widest range of the levels: the display bounds of the feature.
    setpointSpan: ranges.length
      ? {
          min: Math.min(...ranges.map((range) => range.min)),
          max: Math.max(...ranges.map((range) => range.max)),
        }
      : null,
    setpointWritable: Boolean(levelPayload) && isWriteable(levelPayload),
    hasLevels: Object.keys(levels).length > 0,
    boost: chargeValue === null ? null : chargeValue === 'start' || chargeValue === 'on',
    boostWritable: Boolean(charge) && isWriteable(charge),
  };
}

/**
 * Model of a heating gateway from the two reads.
 * @param {{ deviceId: string, deviceType: string }} gateway
 * @param {Record<string, object>} resources payloads by path (both reads merged)
 */
export function readHeatingSystem(gateway, resources) {
  const hcIds = memberIds(resources[ROOT_PATHS.heatingCircuits], HC_ID);
  const dhwIds = memberIds(resources[ROOT_PATHS.dhwCircuits], DHW_ID);
  const energy = readNumber(resources[ROOT_PATHS.energy]);
  return {
    gatewayId: gateway.deviceId,
    deviceType: gateway.deviceType,
    kind: 'heating',
    heatingCircuits: hcIds.map((id) => readHeatingCircuit(id, resources, gateway.deviceType)),
    // A heating-only system lists a DHW circuit whose resources all answer 404.
    hotWater: dhwIds
      .map((id) => readHotWater(id, resources))
      .filter((dhw) => dhw.temperature !== null || dhw.mode !== null),
    source: {
      outdoor: readNumber(resources[ROOT_PATHS.outdoor], RANGES.outdoor),
      supply: readNumber(resources[ROOT_PATHS.supply], RANGES.flow),
      returnTemp: readNumber(resources[ROOT_PATHS.returnTemp], RANGES.flow),
      pressure: readNumber(resources[ROOT_PATHS.pressure], RANGES.pressure),
      state: readDemand(resources[ROOT_PATHS.demand], resources[ROOT_PATHS.flame]),
      energy: energy !== null && energy >= 0 ? energy : null,
    },
    faults: readFaults(resources[ROOT_PATHS.notifications]),
  };
}

// RAC: everything comes in `standardFunctions`, a list of resources.
function racResource(standard, name) {
  const references = Array.isArray(standard?.references) ? standard.references : [];
  return references.find((item) => item?.id === `/airConditioning/${name}`);
}

/**
 * Model of an air conditioner.
 * @param {{ deviceId: string, deviceType: string }} gateway
 * @param {Record<string, object>} resources
 */
export function readAirConditioner(gateway, resources) {
  const standard = resources[AC_PATHS.standard];
  const control = racResource(standard, 'acControl');
  const mode = racResource(standard, 'operationMode');
  const fan = racResource(standard, 'fanSpeed');
  const setpoint = racResource(standard, 'temperatureSetpoint');
  const power = readString(control);
  return {
    gatewayId: gateway.deviceId,
    deviceType: gateway.deviceType,
    kind: 'ac',
    available: Boolean(standard),
    power: power === null ? null : power === 'on',
    powerWritable: isWriteable(control),
    mode: readString(mode),
    modes: allowed(mode),
    modeWritable: isWriteable(mode) && allowed(mode).length > 0,
    fanSpeed: readString(fan),
    fanSpeeds: allowed(fan),
    fanWritable: isWriteable(fan) && allowed(fan).length > 0,
    setpoint: readNumber(setpoint, RANGES.room),
    setpointRange: bounds(setpoint),
    setpointWritable: isWriteable(setpoint),
    roomTemperature: readNumber(racResource(standard, 'roomTemperature'), RANGES.room),
    faults: readFaults(resources[AC_PATHS.notifications]),
  };
}

/**
 * Read a whole gateway: one bulk call for the roots, a second one for the
 * circuits (two calls, three past 30 circuit resources).
 * @param {import('./client.js').BoschCloud} cloud
 * @param {{ deviceId: string, deviceType: string }} gateway
 */
export async function readGateway(cloud, gateway) {
  const kind = gatewayKind(gateway.deviceType);
  if (kind === 'ac') {
    const resources = await cloud.bulk(gateway.deviceId, Object.values(AC_PATHS));
    return readAirConditioner(gateway, resources);
  }
  if (kind === 'heating') {
    const roots = await cloud.bulk(gateway.deviceId, Object.values(ROOT_PATHS));
    const hcIds = memberIds(roots[ROOT_PATHS.heatingCircuits], HC_ID);
    const dhwIds = memberIds(roots[ROOT_PATHS.dhwCircuits], DHW_ID);
    const paths = circuitPaths(hcIds, dhwIds);
    const circuits = paths.length ? await cloud.bulk(gateway.deviceId, paths) : {};
    return readHeatingSystem(gateway, { ...roots, ...circuits });
  }
  return null;
}
