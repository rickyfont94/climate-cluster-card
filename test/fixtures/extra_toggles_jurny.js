// Real-world extra_toggles regression case (issue #34): a Tuya Local AC exposing the
// vendor-specific feature entities a stock climate entity does not surface. The four
// entity ids are a real user's Tuya Local device, wired up as extra_toggles: three
// two-state switches plus one select whose own options drive the cycle. Indices below
// match config.extra_toggles order and are what the tests reference.
//
//   0  switch.salon_anti_mould          (off) -> switch.turn_on
//   1  select.salon_smart_wind          ("off") -> select.select_option "gentle"
//   2  switch.salon_uv_sterilization    (on)  -> switch.turn_off
//   3  switch.salon_evaporator_cleaning (off) -> switch.turn_on
//
// The select's real options are not known to us, so a representative on/off wind list
// is used; the assertions only require the sent option to be a member of THIS list.

// Bare-string form: exactly what the user pasted, four raw entity ids.
export const config = {
  entity: "climate.salon_ac",
  extra_toggles: [
    "switch.salon_anti_mould",
    "select.salon_smart_wind",
    "switch.salon_uv_sterilization",
    "switch.salon_evaporator_cleaning",
  ],
};

// Object form: same four entities, but two carry a YAML name/icon override. Proves the
// {entity, name, icon} shape normalizes and operates identically to the string form.
export const configObjects = {
  entity: "climate.salon_ac",
  extra_toggles: [
    { entity: "switch.salon_anti_mould", name: "Anti Mould", icon: "mdi:spray-bottle" },
    { entity: "select.salon_smart_wind", name: "Smart Wind" },
    { entity: "switch.salon_uv_sterilization" },
    { entity: "switch.salon_evaporator_cleaning" },
  ],
};

export const SMART_WIND_OPTIONS = ["off", "gentle", "strong"];

export const states = {
  "climate.salon_ac": {
    entity_id: "climate.salon_ac",
    state: "cool",
    attributes: {
      friendly_name: "Salon A/C",
      hvac_modes: ["off", "cool", "heat", "dry", "fan_only"],
      current_temperature: 75,
      temperature: 72,
      supported_features: 1,
    },
  },
  "switch.salon_anti_mould": {
    entity_id: "switch.salon_anti_mould",
    state: "off",
    attributes: { friendly_name: "Salon Anti-Mould" },
  },
  "select.salon_smart_wind": {
    entity_id: "select.salon_smart_wind",
    state: "off",
    attributes: { friendly_name: "Salon Smart Wind", options: SMART_WIND_OPTIONS },
  },
  "switch.salon_uv_sterilization": {
    entity_id: "switch.salon_uv_sterilization",
    state: "on",
    attributes: { friendly_name: "Salon UV Sterilization" },
  },
  "switch.salon_evaporator_cleaning": {
    entity_id: "switch.salon_evaporator_cleaning",
    state: "off",
    attributes: { friendly_name: "Salon Evaporator Cleaning" },
  },
};

export const entities = {
  "climate.salon_ac": { device_id: "dev_salon" },
  "switch.salon_anti_mould": { device_id: "dev_salon" },
  "select.salon_smart_wind": { device_id: "dev_salon" },
  "switch.salon_uv_sterilization": { device_id: "dev_salon" },
  "switch.salon_evaporator_cleaning": { device_id: "dev_salon" },
};
