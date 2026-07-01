// Generic climate entity whose swing_modes contain a genuine lowercase "off"
// alongside real on members. This is the path that already worked before the fix;
// the tests lock it so the change does not regress on/off toggling.

export const config = { entity: "climate.generic_ac" };

export const states = {
  "climate.generic_ac": {
    entity_id: "climate.generic_ac",
    state: "cool",
    attributes: {
      friendly_name: "Generic A/C",
      hvac_modes: ["off", "cool", "heat", "fan_only"],
      fan_modes: ["auto", "low", "medium", "high"],
      fan_mode: "auto",
      swing_modes: ["off", "vertical", "horizontal", "both"],
      swing_mode: "off",
      current_temperature: 74,
      temperature: 72,
      supported_features: 41,
    },
  },
};

export const entities = {
  "climate.generic_ac": { device_id: "dev_generic" },
};
