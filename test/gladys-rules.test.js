// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures: a K40 heat pump (one heating circuit, hot water), an ICOM heat
// pump (two circuits, hot water), a heating-only K30 boiler and a Climate air
// conditioner — in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const scenarios = [
  { label: 'English names', config: { language: 'en' } },
  { label: 'French names', config: { language: 'fr' } },
  { label: 'German names', config: { language: 'de' } },
  { label: 'Spanish names', config: { language: 'es' } },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const { gladys, app } = await createWorld({ config: scenario.config });
    try {
      const devices = gladys.fake.discoveredDevices;
      assert.equal(devices.length, 10, `expected the fixture devices, got ${devices.length}`);
      const deviceIds = new Set();
      const deviceNames = new Set();

      for (const device of devices) {
        const where = device.name;
        assert.ok(!deviceIds.has(device.external_id), `${where}: duplicate device external_id`);
        deviceIds.add(device.external_id);
        assert.ok(!deviceNames.has(device.name), `${where}: duplicate device name`);
        deviceNames.add(device.name);

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
            const allowed = table.units_by_category[feature.category];
            if (allowed) {
              assert.ok(
                allowed.includes(feature.unit),
                `${at}: unit ${feature.unit} not for ${feature.category}`,
              );
            }
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(
            feature.external_id.startsWith(`${device.external_id}:`),
            `${at}: id outside its device`,
          );
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);
          assert.ok(feature.name.length <= 40, `${at}: name longer than 40 characters`);
        }
      }
    } finally {
      await app.stop();
    }
  });
}

test('the published states are those Gladys accepts (numbers, or a non-empty text)', async () => {
  const { gladys, app } = await createWorld();
  try {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(device);
    }
    assert.ok(gladys.fake.states.length >= 40);
    const features = new Map(
      gladys.fake.discoveredDevices.flatMap((device) =>
        device.features.map((f) => [f.external_id, f]),
      ),
    );
    for (const state of gladys.fake.states) {
      const feature = features.get(state.device_feature_external_id);
      assert.ok(feature, `state of an unknown feature ${state.device_feature_external_id}`);
      if (feature.category === 'text') {
        assert.equal(typeof state.text, 'string', `${feature.name}: text state expected`);
        assert.ok(state.text.trim() !== '', `${feature.name}: empty text`);
      } else {
        assert.ok(Number.isFinite(state.state), `${feature.name}: numeric state expected`);
      }
      // A select only ever takes one of its options.
      if (feature.supported_options) {
        const values = feature.supported_options.map((option) => option.value);
        const value = feature.category === 'text' ? state.text : state.state;
        assert.ok(values.includes(value), `${feature.name}: ${value} is not one of ${values}`);
      }
    }
  } finally {
    await app.stop();
  }
});
