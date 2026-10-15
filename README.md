# Bosch HomeCom Easy for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that
reads and controls the Bosch heat pumps, boilers and air conditioners of the
**HomeCom Easy** app (Compress, Condens, Climate), through the Bosch cloud — the
"pointt" API the app uses, with a SingleKey ID sign-in.

> **Developed without the hardware: feedback welcome.** The integration is
> built and tested against the answers published by the community projects
> credited below (their tests and fixtures), not against a real appliance nor a
> real Bosch account. Please report what works and what does not in the
> [issues](https://github.com/guim31/gladys-bosch-homecom/issues).

This project is **not affiliated with Bosch**. It is distinct from the Bosch
Smart Home (Smart Home Controller) integration.

## Features

- **Heat pumps and boilers** on a Connect-Key **K 30 RF / K 40 RF** (Compress
  5800i, 6800i, Condens boilers…) or an **ICOM** module (Compress 7000i / 7001i
  AW), as several Gladys devices:
  - **Heat generator**: outdoor, supply and return temperatures, system
    pressure, generator state (heating, hot water, frost protection, idle),
    total consumption (ICOM), active fault codes;
  - **Heating circuit** (one per circuit): room temperature, humidity, **room
    setpoint** and **operating mode** (programme, manual, off);
  - **Hot water** (one per circuit): temperature, **setpoint** (of the level in
    use), **mode** (off, eco, comfort, own programme…), **extra hot water**
    (one-off charge).
- **Climate air conditioners** (3000i, 5000i, 6000i): on/off, mode, setpoint,
  fan speed, room temperature — with the native Gladys air conditioning
  controls.
- Every command stays **within the bounds the appliance announces** (setpoint
  ranges, offered modes and fan speeds); anything else is refused before it
  reaches Bosch.
- **Dashboard widget** "Heating and hot water": room, setpoint, hot water and
  outdoor temperatures, the modes, the generator state, the faults, and an
  _Extra hot water_ button.
- **Scene trigger** _Bosch fault reported_: once per new fault code, with the
  code as a variable.
- A **Test the connection** button, and a connection status that says what to
  do (sign in, code refused, sign-in expired, cloud down).
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later.
- A **HomeCom Easy** account (SingleKey ID) where the appliance works in the
  app (Buderus **MyDevice** accounts too).
- A browser with developer tools for the one-time sign-in.
- Internet access from Gladys to `singlekey-id.com` and
  `pointt-api.bosch-thermotechnology.com`.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-bosch-homecom`
   (or install **Bosch HomeCom Easy** from the catalog once it is listed).
2. In **Configuration**, choose the app brand and save, then click **Connect**:
   the Bosch sign-in page opens in a new tab. Open the developer tools there
   (F12, **Network** tab), sign in, copy the value after `code=` of the last
   request (the page itself fails to open: the address is the app's), paste it
   in **Authorization code** and save within a minute.
3. Open the **Discover** tab and add the devices.

The user guide, with the troubleshooting, is in [`docs/en.md`](docs/en.md)
(also in [French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md));
Gladys links it from the Configuration screen.

## How it works

- **Sign-in**: SingleKey ID accepts only the redirect address of the app
  (`com.bosch.tt.dashtt.pointt://app/login`), which no browser opens. The
  _Connect_ button (`account_link` field) hands out the authorization address
  with a **fresh PKCE verifier**, kept in `/data` until the code comes back;
  the code is exchanged once, and the **refresh token** (rotated by Bosch at
  each use) is written to `/data/bosch-homecom.json` (mode 600) before the new
  access token is used. The password never reaches the integration; no login
  protection is bypassed.
- **Reading**: `POST /pointt-api/api/v1/bulk` reads up to 30 resources of a
  gateway in one request (paths without the `/resource` prefix). A heating
  gateway costs two requests (the roots, then its circuits), an air conditioner
  one. Each answer carries `value`, `writeable`, `minValue`/`maxValue` and
  `allowedValues`: the bounds and options of the Gladys features come from
  there.
- **Refresh**: the container reads the gateways that have a device added in
  Gladys every `refresh_minutes` (5 by default, 2 minimum), with its own timer
  (the core's polling is unreliable for external devices, Gladys#3198); the
  core's `onPoll` remains a fallback that skips a gateway read moments ago.
  Only the changed values are sent, and each one again every 12 hours.
- **Commands**: `PUT /pointt-api/api/v1/gateways/{id}/resource{path}` with
  `{ "value": … }`. The room setpoint goes where the HomeCom Easy app writes it
  (K30/K40: manual setpoint, ICOM: temporary setpoint, in cooling: cooling
  setpoint); the hot water setpoint is the temperature of the active level.
- `/data/bosch-homecom.json` also keeps the appliances seen last (so a restart
  while the cloud is down still lists them) and the fault codes already
  reported (no new alert after a restart).

## What was checked, and what was not

- Checked here, with the SDK's fake Gladys and an in-memory Bosch cloud built
  from the payloads of `homecom_alt` and of its Home Assistant integration: the
  sign-in (PKCE pair cross-checked against the public login address of the
  Home Assistant integration), discovery of K30, K40, ICOM and RAC gateways,
  the refresh without the core's poll, every command and its bounds, the fault
  trigger, the expired sign-in, outages and rate limits, quiet logs without
  secrets, the widget content against the SDK validator, the store validator.
- `scripts/probe.mjs` runs the real sign-in path against the live services up
  to the refusal of a fake account (`npm run probe`): it could not run from the
  development environment, whose network refuses the Bosch hosts.
- **Not checked**: a real account and appliance, the real expiry times of the
  code and tokens, the K40 behaviour of the manual setpoint in programme mode,
  the `account_link` button and the widget in a real Gladys.

## Limitations

- Cloud only; the Bosch API is unofficial (the app's) and may change.
- Not covered: holiday/away programmes, schedules, ventilation, solar circuits,
  pools, energy history, water heaters (`wddw2`), thermostats (`rrc2`),
  wallboxes, and air conditioners commissioned over Matter (another Bosch
  backend, MQTT).
- Settings that could be dangerous (heat curves, maximum flow temperature,
  thermal disinfection) are deliberately not offered.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
npm run probe   # live Bosch services, read-only, no account
```

The tests use the fake Gladys of the SDK
(`@gladysassistant/integration-sdk/testing`) and an in-memory Bosch cloud
(`test/helpers/fakeBosch.js`, fixtures in `test/fixtures/bosch-account.json`).
See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [homecom_alt](https://github.com/serbanb11/homecom_alt) by serbanb11 and
  contributors (MIT): the endpoints, the SingleKey ID parameters of the app,
  the bulk format and the payload shapes, re-implemented here in JavaScript.
- [bosch-homecom-hass](https://github.com/serbanb11/bosch-homecom-hass), the
  Home Assistant integration by serbanb11 and contributors (MIT): the sign-in
  procedure, where each setpoint is written, the hot water modes, and the
  air conditioner fixture reused in `test/fixtures/bosch-account.json`.
- The architecture and the conformity tests follow
  [gladys-wled](https://github.com/guim31/gladys-wled) and
  [gladys-subsonic](https://github.com/guim31/gladys-subsonic).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Robert Bosch
GmbH, Bosch Thermotechnology or Buderus. "Bosch", "HomeCom Easy", "SingleKey
ID", "Compress", "Condens", "Climate" and "Buderus" are trademarks of their
owners.

## License

Apache-2.0
