# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Bosch heat pumps and boilers of the HomeCom Easy app (Connect-Key K 30 RF /
  K 40 RF, ICOM), through the Bosch cloud: a heat generator device (outdoor,
  supply and return temperatures, pressure, generator state, consumption,
  faults), a device per heating circuit (room temperature, humidity, room
  setpoint, operating mode) and per hot water circuit (temperature, setpoint,
  mode, extra hot water).
- Bosch Climate air conditioners: on/off, mode, setpoint, fan speed, room
  temperature.
- Commands within the bounds and options the appliance announces.
- Sign-in with a SingleKey ID account (Bosch HomeCom Easy or Buderus
  MyDevice): a "Connect" button and the code pasted once; the integration
  renews the sign-in by itself.
- Dashboard widget "Heating and hot water".
- Scene trigger "Bosch fault reported", with the fault code.
- "Test the connection" button.
- Refresh every 5 minutes by default (2 minutes minimum), by the integration
  itself.
- English, French, German and Spanish, documentation included.

[Unreleased]: https://github.com/guim31/gladys-bosch-homecom/commits/main
