// -----------------------------------------------------------------------------
// From the Bosch resources to the model: values, bounds, writable resources,
// absent sensors, heating-only systems.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  circuitPaths,
  gatewayKind,
  readAirConditioner,
  readFaults,
  readHeatingSystem,
  readNumber,
} from '../src/bosch/model.js';
import { ACCOUNT, GATEWAY } from './helpers/fakeBosch.js';

const gateway = (id) => ACCOUNT.gateways.find((g) => g.deviceId === id);
const resources = (id) => ACCOUNT.resources[id];

test('the supported gateway types', () => {
  assert.equal(gatewayKind('k40'), 'heating');
  assert.equal(gatewayKind('K30'), 'heating');
  assert.equal(gatewayKind('icom'), 'heating');
  assert.equal(gatewayKind('rac'), 'ac');
  for (const unsupported of ['wddw2', 'rrc2', 'commodule', 'bacon_rac', 'generic', '', undefined]) {
    assert.equal(gatewayKind(unsupported), null, String(unsupported));
  }
});

test('a K40 heat pump', () => {
  const model = readHeatingSystem(gateway(GATEWAY.K40), resources(GATEWAY.K40));
  assert.deepEqual(model.source, {
    outdoor: 7.5,
    supply: 34.2,
    returnTemp: 29.8,
    pressure: 1.6,
    state: 'heating',
    energy: null, // the K40 lists per-use counters without a total: not published
  });
  const [hc] = model.heatingCircuits;
  assert.equal(hc.roomTemperature, 20.6);
  assert.equal(hc.setpoint, 21, 'the setpoint in force, not the manual one');
  assert.deepEqual(hc.setpointRange, { min: 5, max: 30 });
  assert.equal(hc.setpointPath, '/manualRoomSetpoint');
  assert.deepEqual(hc.modes, ['off', 'manual', 'auto']);
  assert.equal(hc.cooling, false);

  const [dhw] = model.hotWater;
  assert.equal(dhw.mode, 'high');
  assert.equal(dhw.activeLevel, 'high');
  assert.equal(dhw.setpoint, 55);
  assert.deepEqual(dhw.setpointRange, { min: 30, max: 60 });
  assert.deepEqual(dhw.setpointSpan, { min: 30, max: 60 });
  assert.equal(dhw.boost, false);
  assert.equal(dhw.boostWritable, true);
  assert.deepEqual(model.faults, [{ code: 'A11-1010', active: false }]);
});

test('an ICOM heat pump: temporary setpoint, programme level, absent room sensor', () => {
  const model = readHeatingSystem(gateway(GATEWAY.ICOM), resources(GATEWAY.ICOM));
  assert.equal(model.heatingCircuits.length, 2);
  assert.equal(model.heatingCircuits[0].setpointPath, '/temporaryRoomSetpoint');
  assert.equal(model.heatingCircuits[1].roomTemperature, null, '-3276.8 means no sensor');
  assert.equal(model.source.energy, 1234.5);
  assert.equal(model.source.state, null, 'a demand in % is not a state');
  const [dhw] = model.hotWater;
  assert.equal(dhw.mode, 'ownprogram');
  assert.equal(dhw.activeLevel, 'high', 'the level the programme selected');
  assert.equal(dhw.setpoint, 55);
});

test('a heating-only boiler has no hot water device', () => {
  const model = readHeatingSystem(gateway(GATEWAY.K30), resources(GATEWAY.K30));
  assert.deepEqual(model.hotWater, []);
  assert.equal(model.source.state, 'heating', 'from the flame');
  assert.equal(model.source.returnTemp, null);
});

test('a Climate air conditioner', () => {
  const model = readAirConditioner(gateway(GATEWAY.RAC), resources(GATEWAY.RAC));
  assert.equal(model.power, false);
  assert.equal(model.mode, 'auto');
  assert.deepEqual(model.modes, ['auto', 'heat', 'cool', 'dry', 'fanOnly']);
  assert.equal(model.fanSpeed, 'quiet');
  assert.deepEqual(model.setpointRange, { min: 16, max: 30 });
  assert.equal(model.roomTemperature, 23.5);
  assert.equal(model.available, true);
  assert.equal(readAirConditioner(gateway(GATEWAY.RAC), {}).available, false);
});

test('faults: active codes and history', () => {
  assert.deepEqual(
    readFaults({
      values: [
        { dcd: 'E01', act: 'A', fc: '8' },
        { dcd: 'E07', act: 'H', fc: '4' },
        { dcd: 'A01', ccd: '5' },
        { foo: 'bar' },
      ],
    }),
    [
      { code: 'E01', active: true },
      { code: 'E07', active: false },
      { code: 'A01-5', active: true },
    ],
  );
  assert.deepEqual(readFaults(undefined), []);
});

test('numbers: sentinels and non-numbers are no value', () => {
  assert.equal(readNumber({ value: 21.5 }, [-40, 60]), 21.5);
  assert.equal(readNumber({ value: -3276.8 }, [-40, 60]), null);
  assert.equal(readNumber({ value: '21' }), null);
  assert.equal(readNumber({ value: Number.NaN }), null);
  assert.equal(readNumber(undefined), null);
});

test('the circuit paths of the second read', () => {
  const paths = circuitPaths(['hc1'], ['dhw1']);
  assert.ok(paths.includes('/heatingCircuits/hc1/roomtemperature'));
  assert.ok(paths.includes('/dhwCircuits/dhw1/temperatureLevels/high'));
  assert.ok(paths.every((path) => !path.startsWith('/resource')));
});
