// A Midea style unit as it really reports: preset_modes on the climate entity,
// a lowercase auto in fan_modes, and supported_features 441 (TARGET_TEMPERATURE,
// FAN_MODE, PRESET_MODE, SWING_MODE, TURN_ON, TURN_OFF). No TARGET_TEMPERATURE_RANGE,
// so this is a single-setpoint dial and the steppers apply.
export const config = { entity: "climate.aire_sala" };

export const states = {
  "climate.aire_sala": {
    entity_id: "climate.aire_sala",
    state: "cool",
    attributes: {
      friendly_name: "Aire Sala",
      hvac_modes: ["off", "auto", "cool", "dry", "fan_only"],
      fan_modes: ["silent", "low", "medium", "high", "full", "auto"],
      fan_mode: "auto",
      preset_modes: ["none", "comfort", "eco", "boost", "sleep"],
      preset_mode: "none",
      swing_modes: ["off", "vertical", "horizontal", "both"],
      swing_mode: "off",
      current_temperature: 76,
      temperature: 72,
      min_temp: 61,
      max_temp: 86,
      target_temp_step: 1,
      supported_features: 441,
    },
  },
};

export const entities = {
  "climate.aire_sala": { entity_id: "climate.aire_sala", device_id: "dev_sala" },
};

// A thermostat with no presets at all: the row must not appear.
export const noPresetConfig = { entity: "climate.plain" };
export const noPresetStates = {
  "climate.plain": {
    entity_id: "climate.plain",
    state: "heat",
    attributes: {
      friendly_name: "Plain thermostat",
      hvac_modes: ["off", "heat"],
      current_temperature: 68,
      temperature: 70,
      min_temp: 45,
      max_temp: 90,
      target_temp_step: 1,
    },
  },
};
export const noPresetEntities = {
  "climate.plain": { entity_id: "climate.plain", device_id: "dev_plain" },
};

// A dual-setpoint entity: steppers must stay hidden, because a bare plus and
// minus cannot say which of the two setpoints it would move.
export const heatCoolConfig = { entity: "climate.dual" };
export const heatCoolStates = {
  "climate.dual": {
    entity_id: "climate.dual",
    state: "heat_cool",
    attributes: {
      friendly_name: "Dual thermostat",
      hvac_modes: ["off", "heat_cool"],
      current_temperature: 71,
      temperature: null,
      target_temp_low: 68,
      target_temp_high: 74,
      min_temp: 45,
      max_temp: 90,
      target_temp_step: 1,
    },
  },
};
export const heatCoolEntities = {
  "climate.dual": { entity_id: "climate.dual", device_id: "dev_dual" },
};
