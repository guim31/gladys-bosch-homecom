// -----------------------------------------------------------------------------
// Every text the integration produces, in the four languages of the Gladys
// interface. German says "du", Spanish "usted". Vocabulary of the Gladys front
// (front/src/config/i18n) where it has the word. Brands are not translated.
//
// Device and feature names are written once, when the user adds the device:
// they follow the `language` of the configuration (Gladys does not tell a
// device integration the user's language).
// -----------------------------------------------------------------------------

/** Device and feature names, one table per language. */
export const NAMES = {
  en: {
    heatSource: 'Heat generator',
    heatingCircuit: (n) => `Heating circuit ${n}`,
    hotWater: (n) => (n === 1 ? 'Hot water' : `Hot water ${n}`),
    airConditioner: 'Air conditioner',
    roomTemperature: 'Room temperature',
    humidity: 'Humidity',
    targetTemperature: 'Room setpoint',
    operatingMode: 'Operating mode',
    hotWaterTemperature: 'Hot water temperature',
    hotWaterSetpoint: 'Hot water setpoint',
    hotWaterMode: 'Hot water mode',
    boost: 'Extra hot water',
    outdoorTemperature: 'Outdoor temperature',
    supplyTemperature: 'Supply temperature',
    returnTemperature: 'Return temperature',
    pressure: 'System pressure',
    generatorState: 'Generator state',
    energy: 'Total consumption',
    faults: 'Faults',
    power: 'On/Off',
    acMode: 'Mode',
    acSetpoint: 'Setpoint',
    fanSpeed: 'Fan speed',
  },
  fr: {
    heatSource: 'Générateur de chaleur',
    heatingCircuit: (n) => `Circuit de chauffage ${n}`,
    hotWater: (n) => (n === 1 ? 'Eau chaude' : `Eau chaude ${n}`),
    airConditioner: 'Climatiseur',
    roomTemperature: 'Température ambiante',
    humidity: 'Humidité',
    targetTemperature: 'Consigne ambiante',
    operatingMode: 'Mode de fonctionnement',
    hotWaterTemperature: "Température de l'eau chaude",
    hotWaterSetpoint: "Consigne d'eau chaude",
    hotWaterMode: "Mode d'eau chaude",
    boost: "Charge d'eau chaude",
    outdoorTemperature: 'Température extérieure',
    supplyTemperature: 'Température de départ',
    returnTemperature: 'Température de retour',
    pressure: "Pression de l'installation",
    generatorState: 'État du générateur',
    energy: 'Consommation totale',
    faults: 'Défauts',
    power: 'Marche/Arrêt',
    acMode: 'Mode',
    acSetpoint: 'Consigne',
    fanSpeed: 'Vitesse de ventilation',
  },
  de: {
    heatSource: 'Wärmeerzeuger',
    heatingCircuit: (n) => `Heizkreis ${n}`,
    hotWater: (n) => (n === 1 ? 'Warmwasser' : `Warmwasser ${n}`),
    airConditioner: 'Klimaanlage',
    roomTemperature: 'Raumtemperatur',
    humidity: 'Luftfeuchtigkeit',
    targetTemperature: 'Raum-Solltemperatur',
    operatingMode: 'Betriebsart',
    hotWaterTemperature: 'Warmwassertemperatur',
    hotWaterSetpoint: 'Warmwasser-Sollwert',
    hotWaterMode: 'Warmwasser-Modus',
    boost: 'Extra-Warmwasser',
    outdoorTemperature: 'Außentemperatur',
    supplyTemperature: 'Vorlauftemperatur',
    returnTemperature: 'Rücklauftemperatur',
    pressure: 'Anlagendruck',
    generatorState: 'Status des Wärmeerzeugers',
    energy: 'Gesamtverbrauch',
    faults: 'Störungen',
    power: 'Ein/Aus',
    acMode: 'Modus',
    acSetpoint: 'Solltemperatur',
    fanSpeed: 'Lüftergeschwindigkeit',
  },
  es: {
    heatSource: 'Generador de calor',
    heatingCircuit: (n) => `Circuito de calefacción ${n}`,
    hotWater: (n) => (n === 1 ? 'Agua caliente' : `Agua caliente ${n}`),
    airConditioner: 'Aire acondicionado',
    roomTemperature: 'Temperatura ambiente',
    humidity: 'Humedad',
    targetTemperature: 'Consigna ambiente',
    operatingMode: 'Modo de funcionamiento',
    hotWaterTemperature: 'Temperatura del agua caliente',
    hotWaterSetpoint: 'Consigna de agua caliente',
    hotWaterMode: 'Modo de agua caliente',
    boost: 'Carga de agua caliente',
    outdoorTemperature: 'Temperatura exterior',
    supplyTemperature: 'Temperatura de impulsión',
    returnTemperature: 'Temperatura de retorno',
    pressure: 'Presión de la instalación',
    generatorState: 'Estado del generador',
    energy: 'Consumo total',
    faults: 'Averías',
    power: 'Encendido/Apagado',
    acMode: 'Modo',
    acSetpoint: 'Consigna',
    fanSpeed: 'Velocidad del ventilador',
  },
};

/**
 * Labels of the Bosch mode values, by language. A value the table does not
 * know is shown as Bosch sends it.
 */
export const MODE_LABELS = {
  en: {
    auto: 'Programme',
    manual: 'Manual',
    off: 'Off',
    low: 'Eco',
    high: 'Comfort',
    eco: 'Eco+',
    ownprogram: 'Own programme',
  },
  fr: {
    auto: 'Programme',
    manual: 'Manuel',
    off: 'Arrêt',
    low: 'Éco',
    high: 'Confort',
    eco: 'Éco+',
    ownprogram: 'Programme personnel',
  },
  de: {
    auto: 'Zeitprogramm',
    manual: 'Manuell',
    off: 'Aus',
    low: 'Eco',
    high: 'Komfort',
    eco: 'Eco+',
    ownprogram: 'Eigenes Programm',
  },
  es: {
    auto: 'Programa',
    manual: 'Manual',
    off: 'Apagado',
    low: 'Eco',
    high: 'Confort',
    eco: 'Eco+',
    ownprogram: 'Programa propio',
  },
};

/** @returns {string} */
export function modeLabel(language, value) {
  return MODE_LABELS[language]?.[String(value).toLowerCase()] ?? String(value);
}

/** Short texts: states, widget labels. */
export const TEXT = {
  heating: {
    en: 'Heating',
    fr: 'Chauffage',
    de: 'Heizen',
    es: 'Calefacción',
  },
  hot_water: {
    en: 'Hot water',
    fr: 'Eau chaude',
    de: 'Warmwasser',
    es: 'Agua caliente',
  },
  frost: {
    en: 'Frost protection',
    fr: 'Hors-gel',
    de: 'Frostschutz',
    es: 'Antihielo',
  },
  pool: {
    en: 'Pool',
    fr: 'Piscine',
    de: 'Pool',
    es: 'Piscina',
  },
  idle: {
    en: 'Idle',
    fr: 'Au repos',
    de: 'Bereit',
    es: 'En reposo',
  },
  noFault: {
    en: 'No fault',
    fr: 'Aucun défaut',
    de: 'Keine Störung',
    es: 'Sin averías',
  },
  room: {
    en: 'Room',
    fr: 'Ambiance',
    de: 'Raum',
    es: 'Ambiente',
  },
  setpoint: {
    en: 'Setpoint',
    fr: 'Consigne',
    de: 'Sollwert',
    es: 'Consigna',
  },
  outdoor: {
    en: 'Outdoor',
    fr: 'Extérieur',
    de: 'Außen',
    es: 'Exterior',
  },
  heatingMode: {
    en: 'Heating mode',
    fr: 'Mode chauffage',
    de: 'Heizmodus',
    es: 'Modo calefacción',
  },
  hotWaterMode: {
    en: 'Hot water mode',
    fr: 'Mode eau chaude',
    de: 'Warmwasser-Modus',
    es: 'Modo agua caliente',
  },
  generator: {
    en: 'Generator',
    fr: 'Générateur',
    de: 'Wärmeerzeuger',
    es: 'Generador',
  },
  faults: {
    en: 'Faults',
    fr: 'Défauts',
    de: 'Störungen',
    es: 'Averías',
  },
  boost: {
    en: 'Extra hot water',
    fr: "Charge d'eau",
    de: 'Extra-Warmwasser',
    es: 'Carga de agua',
  },
  unknown: {
    en: 'Unknown',
    fr: 'Inconnu',
    de: 'Unbekannt',
    es: 'Desconocido',
  },
};

/** Sentences: connection status, action results, widget states (≤ 200 characters). */
export const MESSAGES = {
  notLinked: {
    en: 'Not connected: click "Connect", sign in, then paste the code in "Authorization code".',
    fr: 'Non connecté : cliquez sur « Se connecter », identifiez-vous, puis collez le code dans « Code d’autorisation ».',
    de: 'Nicht verbunden: Klicke auf „Verbinden“, melde dich an und füge den Code unter „Autorisierungscode“ ein.',
    es: 'Sin conexión: haga clic en «Conectar», inicie sesión y pegue el código en «Código de autorización».',
  },
  noLoginStarted: {
    en: 'This code does not come from the "Connect" button of this integration: click it, sign in again, and paste the new code.',
    fr: 'Ce code ne vient pas du bouton « Se connecter » de cette intégration : cliquez dessus, reconnectez-vous et collez le nouveau code.',
    de: 'Dieser Code stammt nicht vom Button „Verbinden“ dieser Integration: Klicke darauf, melde dich erneut an und füge den neuen Code ein.',
    es: 'Este código no procede del botón «Conectar» de esta integración: haga clic en él, inicie sesión de nuevo y pegue el nuevo código.',
  },
  codeRefused: {
    en: 'Bosch refused the code (used, expired or incomplete). Click "Connect" again and paste the new code within a minute.',
    fr: 'Bosch a refusé le code (déjà utilisé, expiré ou incomplet). Cliquez à nouveau sur « Se connecter » et collez le nouveau code dans la minute.',
    de: 'Bosch hat den Code abgelehnt (benutzt, abgelaufen oder unvollständig). Klicke erneut auf „Verbinden“ und füge den neuen Code innerhalb einer Minute ein.',
    es: 'Bosch ha rechazado el código (usado, caducado o incompleto). Haga clic de nuevo en «Conectar» y pegue el nuevo código en menos de un minuto.',
  },
  loginExpired: {
    en: 'The Bosch sign-in has expired or was revoked: click "Connect" and sign in again.',
    fr: 'La connexion Bosch a expiré ou a été révoquée : cliquez sur « Se connecter » et identifiez-vous à nouveau.',
    de: 'Die Bosch-Anmeldung ist abgelaufen oder wurde widerrufen: Klicke auf „Verbinden“ und melde dich erneut an.',
    es: 'La sesión de Bosch ha caducado o ha sido revocada: haga clic en «Conectar» e inicie sesión de nuevo.',
  },
  cloudUnreachable: (detail) => ({
    en: `The Bosch cloud does not answer (${detail}). Retrying at the next refresh.`,
    fr: `Le cloud Bosch ne répond pas (${detail}). Nouvel essai au prochain rafraîchissement.`,
    de: `Die Bosch-Cloud antwortet nicht (${detail}). Neuer Versuch bei der nächsten Aktualisierung.`,
    es: `La nube de Bosch no responde (${detail}). Se reintentará en la próxima actualización.`,
  }),
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  noGateway: {
    en: 'Connected, but the account has no appliance this integration supports.',
    fr: "Connecté, mais le compte n'a aucun appareil pris en charge par cette intégration.",
    de: 'Verbunden, aber das Konto hat kein Gerät, das diese Integration unterstützt.',
    es: 'Conectado, pero la cuenta no tiene ningún aparato compatible con esta integración.',
  },
  gateways: (supported, unsupported) => ({
    en:
      `Connected. Supported: ${supported || 'none'}.` +
      (unsupported ? ` Not supported: ${unsupported}.` : ''),
    fr:
      `Connecté. Pris en charge : ${supported || 'aucun'}.` +
      (unsupported ? ` Non pris en charge : ${unsupported}.` : ''),
    de:
      `Verbunden. Unterstützt: ${supported || 'keine'}.` +
      (unsupported ? ` Nicht unterstützt: ${unsupported}.` : ''),
    es:
      `Conectado. Compatibles: ${supported || 'ninguno'}.` +
      (unsupported ? ` No compatibles: ${unsupported}.` : ''),
  }),
  widgetNoSystem: {
    en: 'No Bosch heating system added to Gladys yet.',
    fr: 'Aucun chauffage Bosch ajouté à Gladys pour le moment.',
    de: 'Noch keine Bosch-Heizung zu Gladys hinzugefügt.',
    es: 'Todavía no se ha añadido ninguna calefacción Bosch a Gladys.',
  },
  widgetNoData: {
    en: 'Waiting for the first reading of the Bosch cloud.',
    fr: 'En attente de la première lecture du cloud Bosch.',
    de: 'Warte auf die erste Abfrage der Bosch-Cloud.',
    es: 'Esperando la primera lectura de la nube de Bosch.',
  },
};

/** One language of a multi-language object, English as fallback. */
export const pick = (texts, language) => texts[language] ?? texts.en;
