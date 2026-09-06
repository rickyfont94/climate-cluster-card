// Humidity readout and the second swing axis. Both must stay invisible on an
// entity that cannot do them, and the horizontal write must obey the same
// member-of-the-advertised-list rule as every other write path in the card.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass, makeCard } from "./helpers.js";
import * as fx from "./fixtures/presets.js";

const hStates = {
  "climate.daikin": {
    entity_id: "climate.daikin",
    state: "cool",
    attributes: {
      friendly_name: "Daikin",
      hvac_modes: ["off", "cool", "heat"],
      swing_modes: ["Off", "Vertical"],
      swing_mode: "Off",
      swing_horizontal_modes: ["Off", "Horizontal", "Swing"],
      swing_horizontal_mode: "Off",
      current_temperature: 75,
      current_humidity: 48,
      temperature: 72,
      min_temp: 61,
      max_temp: 86,
    },
  },
};
const hEntities = { "climate.daikin": { entity_id: "climate.daikin", device_id: "dev_daikin" } };
const hConfig = { entity: "climate.daikin" };

test("humidity: an entity reporting current_humidity resolves the readout", () => {
  const card = makeCard(hConfig, makeHass(hStates, { entities: hEntities }));
  assert.equal(card._st(hConfig.entity).attributes.current_humidity, 48);
});

test("humidity: an entity without current_humidity leaves the stack alone", () => {
  const card = makeCard(fx.config, makeHass(fx.states, { entities: fx.entities }));
  assert.equal(card._st(fx.config.entity).attributes.current_humidity, undefined);
});

test("horizontal swing: resolves from swing_horizontal_modes", () => {
  const card = makeCard(hConfig, makeHass(hStates, { entities: hEntities }));
  assert.equal(card._swingHMode().kind, "climate");
  assert.equal(card._swingHResolved(), true);
  assert.deepEqual(card._swingHModesList(), ["Off", "Horizontal", "Swing"]);
});

test("horizontal swing: absent on an entity with only a vertical axis", () => {
  const card = makeCard(fx.config, makeHass(fx.states, { entities: fx.entities }));
  assert.equal(card._swingHMode().kind, null);
  assert.equal(card._swingHResolved(), false, "no second chip for a single-axis unit");
});

test("horizontal swing: writes a real member with the entity's own casing", () => {
  const hass = makeHass(hStates, { entities: hEntities });
  const card = makeCard(hConfig, hass);
  const modes = card._swingHModesList();

  card._swingHToggle();

  assert.equal(hass.calls.length, 1);
  const c = hass.calls[0];
  assert.equal(c.domain, "climate");
  assert.equal(c.service, "set_swing_horizontal_mode");
  const sent = c.data.swing_horizontal_mode;
  assert.ok(modes.includes(sent), `${JSON.stringify(sent)} must be a member of ${JSON.stringify(modes)}`);
  assert.notEqual(sent, "off", "never the lowercase literal, this list spells it Off");
});

test("horizontal swing: show_swing_h false hides it even when the axis exists", () => {
  const card = makeCard(Object.assign({}, hConfig, { show_swing_h: false }),
    makeHass(hStates, { entities: hEntities }));
  assert.equal(card._swingHResolved(), false);
});

test("heat_cool: shift plus arrow moves the LOW handle, plain arrow moves the HIGH one", () => {
  const hass = makeHass(fx.heatCoolStates, { entities: fx.heatCoolEntities });
  const card = makeCard(fx.heatCoolConfig, hass);
  card._paintHeatCool = () => {};

  // plain: high 74 goes to 75, low untouched
  card._tempKeyDown({ key: "ArrowUp", shiftKey: false, preventDefault() {} }, null);
  assert.equal(hass.calls.length, 1);
  assert.equal(hass.calls[0].data.target_temp_low, 68);
  assert.equal(hass.calls[0].data.target_temp_high, 75);

  // shift: low 68 goes to 69, high untouched
  const hass2 = makeHass(fx.heatCoolStates, { entities: fx.heatCoolEntities });
  const card2 = makeCard(fx.heatCoolConfig, hass2);
  card2._paintHeatCool = () => {};
  card2._tempKeyDown({ key: "ArrowUp", shiftKey: true, preventDefault() {} }, null);
  assert.equal(hass2.calls.length, 1);
  assert.equal(hass2.calls[0].data.target_temp_low, 69);
  assert.equal(hass2.calls[0].data.target_temp_high, 74);
});

test("heat_cool: the low handle can never be driven past the high one", () => {
  const hass = makeHass(fx.heatCoolStates, { entities: fx.heatCoolEntities });
  const card = makeCard(fx.heatCoolConfig, hass);
  card._paintHeatCool = () => {};

  card._tempKeyDown({ key: "End", shiftKey: true, preventDefault() {} }, null);

  assert.equal(hass.calls.length, 1);
  const { target_temp_low: lo, target_temp_high: hi } = hass.calls[0].data;
  assert.ok(lo < hi, `low ${lo} must stay below high ${hi}`);
});
