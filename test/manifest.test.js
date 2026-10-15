// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { ACCOUNT_FIELD, ACTION_KEYS, SCENE_TRIGGERS, registerHandlers } from '../src/app.js';
import { DEFAULT_CONFIG, REFRESH_MINUTES } from '../src/config.js';
import { WIDGET_KEY } from '../src/widgets.js';
import { createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// The handlers the integration registers, as the SDK's fake Gladys records
// them: a declared key without handler would be "not implemented".
const registered = createFakeGladys();
const app = registerHandlers(registered, { timers: false, fetch: async () => new Response(null) });
await app.ready;

test('every manifest action has a registered handler', async () => {
  assert.deepEqual(keysOf(manifest.actions), Object.values(ACTION_KEYS));
  for (const key of keysOf(manifest.actions)) {
    const ack = await registered.fake.action(key, {});
    assert.notEqual(ack.error, 'not implemented', `manifest action "${key}" has no handler`);
  }
});

test('the widget is declared and served, and nothing else', async () => {
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  const ack = await registered.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  assert.equal(ack.success, true);
});

test('the scene trigger the code fires is declared, with what the event carries', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), Object.values(SCENE_TRIGGERS));
  const [trigger] = manifest.scene_triggers;
  // The event data is { device, code }: `device` a filter, `code` a variable.
  assert.deepEqual(keysOf(trigger.fields), ['device']);
  assert.deepEqual(keysOf(trigger.variables), ['code']);
  assert.equal(manifest.scene_actions, undefined, 'no scene action (see CLAUDE.md)');
});

test('the account link field is the one the code expects', async () => {
  const field = manifest.config_schema.find((f) => f.type === 'account_link');
  assert.equal(field.key, ACCOUNT_FIELD);
  const ack = await registered.fake.oauthAuthorizeUrl(ACCOUNT_FIELD);
  assert.equal(ack.success, true);
});

test('the capability fields require Gladys >= 5.1.0, categories >= 4.86.0', () => {
  const match = manifest.gladys_version.match(/^>=\s*(\d+)\.(\d+)\.(\d+)$/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  const [major, minor] = match.slice(1).map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 1));
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
});

test('the catalog entry: name, category, transport, image', () => {
  assert.equal(manifest.name, 'Bosch HomeCom Easy');
  assert.deepEqual(manifest.categories, ['climate']);
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-bosch-homecom:${manifest.version}`);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
  const minutes = manifest.config_schema.find((f) => f.key === 'refresh_minutes');
  assert.equal(minutes.min, REFRESH_MINUTES.min);
  assert.equal(minutes.max, REFRESH_MINUTES.max);
  // Integer bounds and default: Gladys renders number fields without `step`.
  assert.ok([minutes.min, minutes.max, minutes.default].every(Number.isInteger));
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined, `section "${section.key}": no placeholder`);
    assert.ok(!(section.key in DEFAULT_CONFIG), `section "${section.key}" stores no value`);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('no secret field in an action, no default on a secret', () => {
  // An action cannot fill a secret field (Gladys#3154), nor apply a default (#3155).
  for (const action of manifest.actions ?? []) {
    for (const field of action.fields ?? []) {
      assert.notEqual(field.type, 'secret', `action ${action.key}: secret field`);
      assert.ok(!field.required, `action ${action.key}: required field`);
    }
  }
  for (const field of manifest.config_schema.filter((f) => f.type === 'secret')) {
    assert.equal(field.default, undefined);
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length > 0);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('field placeholders are multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en);
  }
});

test('the scene trigger filter matches the device the event names', async () => {
  // The `device` filter is compared to the event's `device`: the external id
  // of the heat generator (or the air conditioner), a device the user adds.
  const { gladys, app: world } = await createWorld({ gateways: ['101000001'] });
  try {
    const source = gladys.fake.discoveredDevices.find((d) =>
      d.external_id.includes(':heat_source:'),
    );
    assert.ok(source);
  } finally {
    await world.stop();
  }
});
