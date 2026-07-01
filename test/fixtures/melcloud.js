// MelCloud / Mitsubishi style climate entity. Swing options are vane POSITIONS
// with NO "off" member, so the old hardcoded literal "off" write was rejected by
// Home Assistant. There is no swing switch sibling, so swing resolves to the
// climate branch (the code path the fix touches).

export const config = { entity: "climate.melcloud_ac" };

export const states = {
  "climate.melcloud_ac": {
    entity_id: "climate.melcloud_ac",
    state: "cool",
    attributes: {
      friendly_name: "MELCloud A/C",
      hvac_modes: ["off", "heat", "dry", "cool", "fan_only", "heat_cool"],
      fan_modes: ["Auto", "1", "2", "3", "4", "5"],
      fan_mode: "Auto",
      swing_modes: ["Auto", "1", "2", "3", "4", "5", "Swing"],
      swing_mode: "Auto",
      current_temperature: 22,
      temperature: 21,
      min_temp: 10,
      max_temp: 31,
      target_temp_step: 0.5,
      supported_features: 425,
    },
  },
};

export const entities = {
  "climate.melcloud_ac": { device_id: "dev_melcloud" },
};
