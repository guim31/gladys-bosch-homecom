// -----------------------------------------------------------------------------
// Dashboard widget "Heating and hot water" (Gladys 5.1+).
//
// The live values are tiles bound to the device features (they follow the
// states with no refresh); the modes, the generator state and the faults are
// status rows built from the last read, nudged by requestWidgetRefresh when
// they change. One button, bound to the hot water charge feature: a numeric
// device_feature button is the one with a native active state.
//
// Budget of the core: 8 components, 6 tiles, 1 status, 2 texts, 4 buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { DEVICE_TYPES, FEATURE, deviceIds } from './devices.js';
import { MESSAGES, TEXT, modeLabel, pick } from './i18n.js';

export const WIDGET_KEY = 'heating_overview';

const notice = (texts, language) => ({
  ttl_seconds: 60,
  components: [{ type: 'text', variant: 'body', text: pick(texts, language) }],
});

/**
 * @param {object} options
 * @param {object} options.gladys
 * @param {object|null} options.model the heating model to show, null when none
 * @param {Set<string>} options.created feature external ids of the devices added to Gladys
 * @param {string} options.language
 * @param {number} options.ttlSeconds
 */
export function buildWidgetContent({ gladys, model, created, language, ttlSeconds = 300 }) {
  if (!model) {
    return notice(MESSAGES.widgetNoSystem, language);
  }
  const gw = model.gatewayId;
  const source = deviceIds(gladys, DEVICE_TYPES.HEAT_SOURCE, gw);
  const hc = model.heatingCircuits[0];
  const dhw = model.hotWater[0];
  const hcIds = hc ? deviceIds(gladys, DEVICE_TYPES.HEATING_CIRCUIT, gw, hc.id) : null;
  const dhwIds = dhw ? deviceIds(gladys, DEVICE_TYPES.HOT_WATER, gw, dhw.id) : null;

  const components = [];
  const tile = (ids, key, label, icon) => {
    const id = ids?.feature(key);
    if (id && created.has(id)) {
      components.push({ type: 'value', device_feature: id, label: pick(label, language), icon });
    }
  };
  tile(hcIds, FEATURE.ROOM_TEMPERATURE, TEXT.room, 'home');
  tile(hcIds, FEATURE.TARGET_TEMPERATURE, TEXT.setpoint, 'thermometer');
  tile(dhwIds, FEATURE.TEMPERATURE, TEXT.hot_water, 'droplet');
  tile(source, FEATURE.OUTDOOR_TEMPERATURE, TEXT.outdoor, 'sun');

  const items = [];
  if (hc?.mode) {
    items.push({
      label: pick(TEXT.heatingMode, language),
      value: modeLabel(language, hc.mode).slice(0, 40),
      icon: 'thermometer',
      color: hc.mode === 'off' ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.PRIMARY,
    });
  }
  if (dhw?.mode) {
    items.push({
      label: pick(TEXT.hotWaterMode, language),
      value: modeLabel(language, dhw.mode).slice(0, 40),
      icon: 'droplet',
      color: dhw.mode.toLowerCase() === 'off' ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.PRIMARY,
    });
  }
  if (model.source.state) {
    items.push({
      label: pick(TEXT.generator, language),
      value: pick(TEXT[model.source.state], language),
      icon: 'activity',
      color: model.source.state === 'idle' ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.SUCCESS,
    });
  }
  const active = [
    ...new Set(model.faults.filter((fault) => fault.active).map((fault) => fault.code)),
  ];
  items.push({
    label: pick(TEXT.faults, language),
    value: active.length ? active.join(', ').slice(0, 40) : pick(TEXT.noFault, language),
    icon: active.length ? 'alert-triangle' : 'check-circle',
    color: active.length ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
  });
  components.push({ type: 'status', items });

  const boost = dhwIds?.feature(FEATURE.BOOST);
  if (boost && created.has(boost) && dhw.boostWritable) {
    components.push({
      type: 'button',
      label: pick(TEXT.boost, language),
      icon: 'zap',
      style: 'secondary',
      device_feature: boost,
      value: 1,
    });
  }
  return { ttl_seconds: Math.min(3600, Math.max(60, ttlSeconds)), components };
}

/** What the status rows show: a change of it calls for a widget refresh. */
export function widgetSignature(model) {
  if (!model || model.kind !== 'heating') {
    return null;
  }
  return JSON.stringify([
    model.heatingCircuits[0]?.mode,
    model.hotWater[0]?.mode,
    model.hotWater[0]?.boostWritable,
    model.source.state,
    model.faults.filter((fault) => fault.active).map((fault) => fault.code),
  ]);
}

export { notice as noticeContent };
