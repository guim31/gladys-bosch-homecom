// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// SingleKey ID serves the Bosch and the Buderus apps with the same client but
// another redirect address and login page style (see src/bosch/auth.js).
export const BRANDS = ['bosch', 'buderus'];

// Minutes between two reads of the Bosch cloud. The HomeCom Easy app refreshes
// about once a minute while it is open; a home automation reading all day long
// stays well under that (see docs, "Limits").
export const REFRESH_MINUTES = { min: 2, max: 60 };

export const DEFAULT_CONFIG = {
  brand: 'bosch',
  auth_code: '',
  refresh_minutes: 5,
  language: 'fr',
};

/**
 * The code the user pasted: the bare code, or anything around it they copied
 * from the browser (the whole `com.bosch...://app/login?code=...&state=...`
 * address, quotes, spaces).
 * @param {unknown} raw
 * @returns {string}
 */
export function extractAuthCode(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  const text = raw.trim().replace(/^["']|["']$/g, '');
  const inQuery = text.match(/[?&]code=([^&#\s]+)/);
  const code = inQuery ? inQuery[1] : text;
  try {
    return decodeURIComponent(code).trim();
  } catch {
    return code.trim();
  }
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const minutes = Number(source.refresh_minutes);
  return {
    brand: BRANDS.includes(source.brand) ? source.brand : DEFAULT_CONFIG.brand,
    authCode: extractAuthCode(source.auth_code),
    refreshMinutes: Number.isFinite(minutes)
      ? Math.min(REFRESH_MINUTES.max, Math.max(REFRESH_MINUTES.min, Math.round(minutes)))
      : DEFAULT_CONFIG.refresh_minutes,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

/** @param {{ refreshMinutes: number }} config */
export const refreshPeriodMs = (config) => config.refreshMinutes * 60 * 1000;
