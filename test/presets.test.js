// Preset and stepper write-path tests. Same invariant as swing and fan: the value
// written must be a member of what the entity advertises, and a control the entity
// cannot support must not be offered.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass, makeCard } from "./helpers.js";
import * as fx from "./fixtures/presets.js";

test("presets: the row resolves from the entity's own preset_modes", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const card = makeCard(fx.config, hass);

  assert.deepEqual(card._presetModes(), ["none", "comfort", "eco", "boost", "sleep"]);
  assert.equal(card._presetsResolved(), true);
});

test("presets: an entity with no preset_modes gets no row", () => {
  const hass = makeHass(fx.noPresetStates, { entities: fx.noPresetEntities });
  const card = makeCard(fx.noPresetConfig, hass);

  assert.deepEqual(card._presetModes(), []);
  assert.equal(card._presetsResolved(), false);
});

test("presets: selecting one writes exactly that member", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const card = makeCard(fx.config, hass);

  card._setPreset("eco");

  assert.equal(hass.calls.length, 1);
  const c = hass.calls[0];
  assert.equal(c.domain, "climate");
  assert.equal(c.service, "set_preset_mode");
  assert.equal(c.data.preset_mode, "eco");
  assert.ok(card._presetModes().includes(c.data.preset_mode));
});

test("presets: a value outside preset_modes is refused, no service call", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const card = makeCard(fx.config, hass);

  card._setPreset("turbo"); // not a member

  assert.equal(hass.calls.length, 0);
});

test("presets: the tapped chip lights immediately, before the state round-trips", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const card = makeCard(fx.config, hass);

  assert.equal(card._presetActive(), "none"); // live state
  card._setPreset("boost");
  assert.equal(card._presetActive(), "boost", "optimistic value shows at once");
});

test("presets: a rejected call drops the optimistic chip instead of leaving it lit", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  hass.callService = () => { hass.calls.push({ failed: true }); return Promise.reject(new Error("nope")); };
  const card = makeCard(fx.config, hass);

  card._setPreset("sleep");
  assert.equal(card._presetActive(), "sleep");
  card._revertPreset();
  assert.equal(card._presetActive(), "none", "falls back to live state");
});

test("presets: preset_names renames a chip without touching the written value", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const card = makeCard(Object.assign({}, fx.config, { preset_names: { eco: "iECO" } }), hass);

  assert.equal(card._presetName("eco"), "iECO");
  assert.equal(card._presetName("boost"), "Boost", "unnamed presets keep a readable default");

  card._setPreset("eco");
  assert.equal(hass.calls[0].data.preset_mode, "eco", "the raw member is written, not the label");
});

test("steppers: shown on a single-setpoint dial, hidden on heat_cool", () => {
  const single = makeCard(fx.config, makeHass(fx.states, { entities: fx.entities }));
  assert.equal(single._steppersResolved(), true);

  const dual = makeCard(fx.heatCoolConfig, makeHass(fx.heatCoolStates, { entities: fx.heatCoolEntities }));
  assert.equal(dual._isHeatCool(), true);
  assert.equal(dual._steppersResolved(), false, "a bare plus cannot say which setpoint it moves");
});

test("steppers: show_steppers false hides them even on a single-setpoint dial", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const card = makeCard(Object.assign({}, fx.config, { show_steppers: false }), hass);
  assert.equal(card._steppersResolved(), false);
});

test("steppers: one tick moves one step and paints, without writing yet", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const card = makeCard(fx.config, hass);
  card._paintTempArc = () => {};

  card._stepOnce(1);

  assert.equal(card._optimisticTarget, 73, "72 plus a 1 degree step");
  assert.equal(hass.calls.length, 0, "the write is debounced, not immediate");
});

test("steppers: a burst of ticks coalesces into ONE write at the final value", async () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const card = makeCard(fx.config, hass);
  card._paintTempArc = () => {};

  for (let i = 0; i < 5; i++) card._stepOnce(1);
  assert.equal(card._optimisticTarget, 77, "72 plus five steps");
  assert.equal(hass.calls.length, 0, "still nothing written mid-burst");

  await new Promise((r) => setTimeout(r, 600)); // past STEP_COMMIT_MS

  assert.equal(hass.calls.length, 1, "exactly one set_temperature for the whole burst");
  assert.equal(hass.calls[0].service, "set_temperature");
  assert.equal(hass.calls[0].data.temperature, 77);
});

test("steppers: cannot be driven past the entity's own min or max", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const card = makeCard(fx.config, hass);
  card._paintTempArc = () => {};

  for (let i = 0; i < 40; i++) card._stepOnce(1);
  assert.equal(card._optimisticTarget, 86, "clamped to max_temp");

  for (let i = 0; i < 60; i++) card._stepOnce(-1);
  assert.equal(card._optimisticTarget, 61, "clamped to min_temp");
});
