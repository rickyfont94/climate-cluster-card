// A climate entity whose fan list spells auto with a capital A and carries no
// percent number sibling (MelCloud / Mitsubishi and friends look like this).
// The card used to send a hardcoded lowercase "auto", which is not a member of
// this list, so Home Assistant rejected the call and the clover tap did nothing.

export const config = { entity: "climate.melcloud_ac" };

export const states = {
  "climate.melcloud_ac": {
    entity_id: "climate.melcloud_ac",
    state: "cool",
    attributes: {
      friendly_name: "MELCloud A/C",
      hvac_modes: ["off", "cool", "heat", "dry", "fan_only"],
      fan_modes: ["Auto", "1", "2", "3", "4", "5"],
      fan_mode: "3",
      current_temperature: 74,
      temperature: 72,
      min_temp: 61,
      max_temp: 86,
    },
  },
};

export const entities = {
  "climate.melcloud_ac": { entity_id: "climate.melcloud_ac", device_id: "dev_melcloud" },
};

// Same device, but the fan list has no auto member of any casing. There is
// nothing valid to send, so the card must make no service call at all.
export const noAutoConfig = { entity: "climate.vane_only" };

export const noAutoStates = {
  "climate.vane_only": {
    entity_id: "climate.vane_only",
    state: "cool",
    attributes: {
      friendly_name: "Vane only A/C",
      hvac_modes: ["off", "cool"],
      fan_modes: ["Quiet", "Low", "High"],
      fan_mode: "Low",
      current_temperature: 74,
      temperature: 72,
      min_temp: 61,
      max_temp: 86,
    },
  },
};

export const noAutoEntities = {
  "climate.vane_only": { entity_id: "climate.vane_only", device_id: "dev_vane" },
};
