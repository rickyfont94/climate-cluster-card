// Midea style device: the climate entity has sibling switch/number entities on the
// SAME device_id. Vertical swing is a discovered switch.* sibling, so swing resolves
// to the SWITCH branch and never reaches the climate swing write the fix changed.
// This proves the swing fix cannot regress Midea.
//
// A number.*_fan_speed sibling plus a number.*_min_fan_speed decoy are included to
// mirror a real Midea device (the decoy guards a separate, future sibling-match fix
// and is not asserted by the swing tests).

export const config = { entity: "climate.midea_ac" };

export const states = {
  "climate.midea_ac": {
    entity_id: "climate.midea_ac",
    state: "cool",
    attributes: {
      friendly_name: "Midea A/C",
      hvac_modes: ["off", "cool", "heat", "dry", "fan_only"],
      fan_modes: ["auto", "low", "medium", "high"],
      fan_mode: "auto",
      // Midea climate can also advertise swing_modes, but the card prefers the
      // discovered switch sibling, so this list must NOT be what gets written.
      swing_modes: ["off", "vertical", "horizontal", "both"],
      swing_mode: "off",
      current_temperature: 75,
      temperature: 73,
      supported_features: 441,
    },
  },
  "switch.midea_ac_swing_vertical": {
    entity_id: "switch.midea_ac_swing_vertical",
    state: "off",
    attributes: { friendly_name: "Midea A/C Vertical swing" },
  },
  "number.midea_ac_fan_speed": {
    entity_id: "number.midea_ac_fan_speed",
    state: "50",
    attributes: { min: 0, max: 100, step: 1 },
  },
  "number.midea_ac_min_fan_speed": {
    entity_id: "number.midea_ac_min_fan_speed",
    state: "20",
    attributes: { min: 0, max: 100, step: 1 },
  },
};

export const entities = {
  "climate.midea_ac": { device_id: "dev_midea" },
  "switch.midea_ac_swing_vertical": { device_id: "dev_midea" },
  "number.midea_ac_fan_speed": { device_id: "dev_midea" },
  "number.midea_ac_min_fan_speed": { device_id: "dev_midea" },
};
