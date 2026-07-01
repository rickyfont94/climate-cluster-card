// Device with user-defined extra toggles (issue #34). The climate entity carries a
// mix of extra_toggles: a switch (two-state), an input_boolean (two-state, with a
// YAML name/icon override), a select (cycles its own options), plus one unavailable
// and one entirely-missing entity to prove the degrade path. Indices below match the
// config.extra_toggles order and are what the tests reference.
//
//   0  switch.bedroom_ac_anti_mildew        (off)      -> switch.turn_on
//   1  input_boolean.bedroom_ac_uv_lamp     (on)       -> input_boolean.turn_off  (name/icon override)
//   2  select.bedroom_ac_wind_mode          ("auto")   -> select.select_option "gentle"
//   3  switch.bedroom_ac_unavailable        (unavailable) -> dimmed, inert
//   4  switch.bedroom_ac_missing            (not in states) -> dimmed, inert

export const config = {
  entity: "climate.bedroom_ac",
  extra_toggles: [
    "switch.bedroom_ac_anti_mildew",
    { entity: "input_boolean.bedroom_ac_uv_lamp", name: "UV Lamp", icon: "mdi:weather-sunny" },
    "select.bedroom_ac_wind_mode",
    "switch.bedroom_ac_unavailable",
    "switch.bedroom_ac_missing",
  ],
};

export const WIND_OPTIONS = ["auto", "gentle", "strong"];

export const states = {
  "climate.bedroom_ac": {
    entity_id: "climate.bedroom_ac",
    state: "cool",
    attributes: {
      friendly_name: "Bedroom A/C",
      hvac_modes: ["off", "cool", "heat"],
      current_temperature: 75,
      temperature: 73,
      supported_features: 1,
    },
  },
  "switch.bedroom_ac_anti_mildew": {
    entity_id: "switch.bedroom_ac_anti_mildew",
    state: "off",
    attributes: { friendly_name: "Bedroom A/C Anti-Mildew" },
  },
  "input_boolean.bedroom_ac_uv_lamp": {
    entity_id: "input_boolean.bedroom_ac_uv_lamp",
    state: "on",
    attributes: { friendly_name: "Bedroom A/C UV Lamp" },
  },
  "select.bedroom_ac_wind_mode": {
    entity_id: "select.bedroom_ac_wind_mode",
    state: "auto",
    attributes: { friendly_name: "Bedroom A/C Wind Mode", options: WIND_OPTIONS },
  },
  "switch.bedroom_ac_unavailable": {
    entity_id: "switch.bedroom_ac_unavailable",
    state: "unavailable",
    attributes: {},
  },
  // switch.bedroom_ac_missing is intentionally absent from states.
};

export const entities = {
  "climate.bedroom_ac": { device_id: "dev_bedroom" },
  "switch.bedroom_ac_anti_mildew": { device_id: "dev_bedroom" },
  "input_boolean.bedroom_ac_uv_lamp": { device_id: "dev_bedroom" },
  "select.bedroom_ac_wind_mode": { device_id: "dev_bedroom" },
  "switch.bedroom_ac_unavailable": { device_id: "dev_bedroom" },
};
