// -----------------------------------------------------------------------------
// The "Heating and hot water" widget: exactly what the core renders (the SDK's
// validator), bound to features that exist on the devices the user added.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/widgets.js';
import { GATEWAY } from './helpers/fakeBosch.js';
import { createAll, createWorld, ids } from './helpers/world.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];

async function content(gladys, settings = {}, language = 'en') {
  const ack = await gladys.fake.widgetGet(WIDGET_KEY, { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content ?? ack.data;
}

test('the widget fits the core budget in every language, bound to existing features', async () => {
  const { gladys, app } = await createWorld({ gateways: [GATEWAY.K40] });
  try {
    await createAll(gladys);
    const features = new Set(
      gladys.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.external_id)),
    );
    for (const language of LANGUAGES) {
      const widget = await content(gladys, {}, language);
      assert.deepEqual(validateWidgetContent(widget), [], language);
      const bound = widget.components.filter((c) => c.device_feature).map((c) => c.device_feature);
      assert.equal(bound.length, 5, 'four tiles and the hot water button');
      for (const id of bound) {
        assert.ok(features.has(id), `${id} is not a feature of the devices`);
      }
      const status = widget.components.find((c) => c.type === 'status');
      assert.equal(status.items.length, 4);
    }
    const fr = await content(gladys, {}, 'fr');
    const status = fr.components.find((c) => c.type === 'status');
    assert.deepEqual(
      status.items.map((item) => item.value),
      ['Programme', 'Confort', 'Chauffage', 'Aucun défaut'],
    );
  } finally {
    await app.stop();
  }
});

test('the widget shows the system chosen in its settings', async () => {
  const { gladys, app } = await createWorld({ gateways: [GATEWAY.K40, GATEWAY.ICOM] });
  try {
    await createAll(gladys);
    const icom = ids(gladys, 'hot_water', GATEWAY.ICOM, 'dhw1').device;
    const widget = await content(gladys, { device: icom });
    assert.ok(
      widget.components.some((c) => c.device_feature?.includes(`${GATEWAY.ICOM}-hc1`)),
      'tiles of the ICOM system',
    );
    assert.deepEqual(validateWidgetContent(widget), []);
  } finally {
    await app.stop();
  }
});

test('without an added heating system, the widget says so', async () => {
  const { gladys, app } = await createWorld({ gateways: [GATEWAY.RAC] });
  try {
    const widget = await content(gladys, {}, 'de');
    assert.deepEqual(validateWidgetContent(widget), []);
    assert.match(widget.components[0].text, /Noch keine Bosch-Heizung/);
  } finally {
    await app.stop();
  }
});

test('a tile is only bound to a device the user added', async () => {
  const { gladys, app } = await createWorld({ gateways: [GATEWAY.K40] });
  try {
    const source = gladys.fake.discoveredDevices.find((d) => d.external_id.includes('heat_source'));
    await gladys.fake.deviceCreated(source);
    const widget = await content(gladys);
    const bound = widget.components.filter((c) => c.device_feature).map((c) => c.device_feature);
    assert.deepEqual(bound, [
      ids(gladys, 'heat_source', GATEWAY.K40).feature('outdoor_temperature'),
    ]);
    assert.deepEqual(validateWidgetContent(widget), []);
  } finally {
    await app.stop();
  }
});
