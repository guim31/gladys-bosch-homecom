# Bosch HomeCom Easy

## Overview

This integration brings the Bosch appliances of your **HomeCom Easy** account into Gladys, through the Bosch cloud
(the same one the app uses):

- **heat pumps and boilers** connected to a **Connect-Key K 30 RF / K 40 RF** (Compress 5800i, 6800i, Condens
  boilers…) or to an **ICOM** module (Compress 7000i / 7001i AW): outdoor temperature, supply and return
  temperatures, system pressure, generator state, faults, and per heating circuit the room temperature, the room
  setpoint and the operating mode; the domestic hot water with its temperature, setpoint, mode and one-off charge;
- **Climate air conditioners** (3000i, 5000i, 6000i): on/off, mode, setpoint, fan speed, room temperature.

It reads the cloud every few minutes and sends your commands right away, within the limits the appliance announces.

> **Developed without the hardware**: this integration was written from the public work of the community (see
> "Limits" and the README credits) and tested against recorded answers, not on a real appliance. Your feedback is
> welcome, on the Gladys forum or in the GitHub issues.

This integration is not affiliated with, nor endorsed by, Bosch. It is distinct from the **Bosch Smart Home**
integration (Smart Home Controller), which covers other products.

## Requirements

- Gladys **5.1.0** or later.
- A **HomeCom Easy** account (SingleKey ID) where your appliance is already set up and working in the app. Buderus
  appliances of the **MyDevice** app work the same way: choose "Buderus MyDevice" as app brand.
- A computer with a browser that has developer tools (Chrome, Edge, Firefox) for the one-time sign-in.
- Gladys must reach the Internet (`singlekey-id.com` and `pointt-api.bosch-thermotechnology.com`).

## Configuration

Bosch gives no public sign-in for third-party software: the integration uses the sign-in of the app, which ends on
an address only the app can open. You copy one code by hand, once.

1. In **Integrations → Bosch HomeCom Easy → Configuration**, choose the **app brand** and save.
2. Click **Connect** next to "Bosch account (SingleKey ID)": the Bosch sign-in page opens in a new tab.
3. In that tab, press **F12** to open the developer tools and select the **Network** tab. Then sign in with your
   SingleKey ID email and password.
4. The last page does not open (the browser cannot open `com.bosch.tt.dashtt.pointt://…`): this is expected. In the
   Network tab, find the request whose address contains `code=` and copy the value after `code=` (it ends with
   `-1`). Copying the whole address also works.
5. Paste it in **Authorization code** and **save within a minute**: the code is short-lived and works once.

The status turns to "connected" and the appliances appear in the **Discovery** tab: add the ones you want.

Your password never reaches Gladys. The integration keeps a **refresh token** in its private volume (`/data`) and
renews it on its own: you sign in again only if Bosch revokes it (password change, sign-out of all sessions…). The
status then says so.

Other settings:

- **Refresh interval**: how often the cloud is read, 5 minutes by default, 2 minutes minimum.
- **Language of the device names**: the names written when you add a device (French by default).
- **Test the connection**: lists the appliances of the account, supported or not.

## Devices

Each appliance gives several Gladys devices, so you can place each circuit in its room. Only the values your
appliance reports are created.

### Heat generator

The heat pump or the boiler: outdoor temperature, supply and return temperatures, system pressure (bar), generator
state (heating, hot water, frost protection, idle), total consumption (kWh, ICOM only), and the active fault codes
("No fault" otherwise).

### Heating circuit

One device per circuit (hc1, hc2…): room temperature (when a room sensor or thermostat is fitted), humidity
(when available), **room setpoint** and **operating mode** (programme, manual, off — the modes the circuit offers).
The setpoint is limited to the range the appliance announces (5–30 °C usually) and rounded to the half degree.
In cooling, the cooling setpoint is changed.

### Hot water

One device per hot water circuit: water temperature, **setpoint**, **mode** (off, eco, comfort, own programme…,
as offered by the appliance) and **extra hot water**, a one-off charge you start or stop. The setpoint changes the
temperature of the level in use (comfort, eco…); it cannot be changed when the hot water is off.

### Air conditioner

On/off, mode (auto, cooling, heating, drying, fan), setpoint (16–30 °C usually), fan speed and room temperature.

## Widget

**Heating and hot water** shows on the dashboard the room temperature and setpoint of the first circuit, the hot
water and outdoor temperatures, the heating and hot water modes, what the generator is doing and the faults, with an
**Extra hot water** button. In its settings, pick any device of a system to show that one (useful with several
gateways); empty, the first one is shown.

## Scene trigger

**Bosch fault reported** starts a scene when an appliance reports a **new** fault code. Choose the heat generator or
the air conditioner, or leave empty for any. The variable **Fault code** holds the code (for example `A01-5`), to
put in a notification. The faults already present when you sign in do not start the scene, and a fault starts it
once, not at every reading.

The temperatures, modes and setpoints are device features: use them in the usual "device value" triggers and
conditions of the scene editor.

## Scene examples

- **Fault alert**: trigger "Bosch fault reported" → send the message "Heat pump fault {{triggerEvent.data.code}}"
  to the family.
- **Hot water on solar surplus**: when the solar production exceeds 2 kW, set "Extra hot water" of the hot water
  device to on.
- **Away**: when everybody leaves, set the room setpoint to 17 °C; when the first person comes back, to 20 °C.
- **Summer evening**: at 19:00, if the living room is above 27 °C, switch the air conditioner on in cooling mode at
  25 °C.

## Troubleshooting

- **"This code does not come from the Connect button"**: the code was captured elsewhere (for example with another
  tool). Click **Connect** in this integration, sign in again, and paste the new code.
- **"Bosch refused the code"**: the code was used already, has expired (it lives about a minute), or was copied
  incompletely. Click **Connect** again; paste the value right after `code=`, up to `&` if there is one.
- **No request with `code=`**: open the developer tools **before** signing in, in the tab of the sign-in page. With
  Chrome, tick "Preserve log" in the Network tab.
- **"The Bosch sign-in has expired"**: Bosch revoked the refresh token. Sign in again as in Configuration.
- **"The Bosch cloud does not answer"**: an Internet or Bosch outage; the integration retries at every refresh and
  says when it works again. The devices stay listed.
- **A device is missing**: run **Test the connection**. An appliance listed as "not supported" (water heater
  `wddw2`, thermostat `rrc2`, wallbox, Matter air conditioner…) is not covered yet.
- **A command is refused**: the value is outside the range the appliance announces, or the mode is not offered by
  this appliance. The integration logs say why (`LOG_LEVEL=debug` shows every reading).

## Limits

- **Cloud only**: no local access. If the Bosch cloud or the Internet connection is down, nothing is read nor sent.
- **Quotas**: Bosch publishes no quota for this API. The integration stays sparing: two to three requests per
  gateway at each refresh (5 minutes by default, 2 minutes minimum), one request per command, and it stops as soon
  as Bosch answers "too many requests" or refuses the sign-in.
- **Unofficial API**: it is the one of the HomeCom Easy app, documented by the community. Bosch may change it
  without notice.
- **Delay**: a command is shown at once, but the cloud may take a minute to report the new value; the next reading
  confirms or corrects it.
- **K30/K40 in programme mode**: the room setpoint written is the one of the manual mode (as in the Home Assistant
  integration). To change the room temperature now, switch the circuit to manual.
- Not covered: holiday and away programmes, schedules, ventilation, solar circuits, pools, energy history (daily
  and monthly counters), water heaters `wddw2`, thermostats `rrc2`, wallboxes, and air conditioners commissioned
  over Matter.
- Values that could be dangerous (heat curves, maximum flow temperature, thermal disinfection) are not offered.

## Data and privacy

The integration stores in its private volume (`/data`): the refresh token of your Bosch account, the PKCE secret of
the last sign-in in progress, the list of your appliances and the fault codes already reported. It never stores nor
logs your password, your tokens or the authorization code. It only talks to `singlekey-id.com` and
`pointt-api.bosch-thermotechnology.com`.
