// Visual-editor tests. The editor is the card's headline promise ("no YAML
// required"), so its shape is worth locking down: how much a first-time user is
// confronted with, and that editor-only display keys never reach the saved config.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass } from "./helpers.js";
import * as fx from "./fixtures/presets.js";

function makeEditor(config, hass) {
  const ed = document.createElement("climate-cluster-card-editor");
  ed.setConfig(config);
  if (hass) ed._hass = hass;
  return ed;
}
// Count every leaf field the schema would render, walking into expandables/grids.
function countFields(schema) {
  let n = 0;
  for (const row of schema) {
    if (row && Array.isArray(row.schema)) n += countFields(row.schema);
    else n += 1;
  }
  return n;
}
function topLevelRows(schema) {
  return schema.length;
}

test("editor: a first-time user sees a handful of rows, not the whole surface", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const ed = makeEditor(fx.config, hass);

  const basic = ed._schema(hass, fx.config);
  assert.equal(topLevelRows(basic), 4,
    "entity, name, Appearance and the advanced switch");

  ed._showAdvanced = true;
  const full = ed._schema(hass, fx.config);
  assert.ok(topLevelRows(full) > topLevelRows(basic),
    "flipping the switch reveals the rest");
  assert.ok(countFields(full) > countFields(basic),
    "and the full surface is still reachable, just not by default");
});

test("editor: every option is still reachable once advanced is on", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const ed = makeEditor(fx.config, hass);
  ed._showAdvanced = true;
  const names = [];
  (function walk(schema) {
    for (const row of schema) {
      if (row && Array.isArray(row.schema)) walk(row.schema);
      else if (row && row.name) names.push(row.name);
    }
  })(ed._schema(hass, fx.config));

  for (const key of ["entity", "name", "appearance", "accent", "modes", "show_presets",
    "show_steppers", "fan_entity", "show_fan", "swing_entity", "extra_toggles",
    "max_height", "tap_action", "hold_action", "double_tap_action"]) {
    assert.ok(names.includes(key), `${key} must still be configurable`);
  }
});

test("editor: the preset section offers a rename field per real preset", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const ed = makeEditor(fx.config, hass);
  ed._showAdvanced = true;
  const names = [];
  (function walk(schema) {
    for (const row of schema) {
      if (row && Array.isArray(row.schema)) walk(row.schema);
      else if (row && row.name) names.push(row.name);
    }
  })(ed._schema(hass, fx.config));

  for (const p of ["none", "comfort", "eco", "boost", "sleep"]) {
    assert.ok(names.includes("pn__" + p), `rename field for ${p}`);
  }
});

test("editor: an entity with no presets gets no rename fields", () => {
  const hass = makeHass(fx.noPresetStates, { entities: fx.noPresetEntities });
  const ed = makeEditor(fx.noPresetConfig, hass);
  ed._showAdvanced = true;
  const names = [];
  (function walk(schema) {
    for (const row of schema) {
      if (row && Array.isArray(row.schema)) walk(row.schema);
      else if (row && row.name) names.push(row.name);
    }
  })(ed._schema(hass, fx.noPresetConfig));

  assert.equal(names.filter((n) => n.indexOf("pn__") === 0).length, 0);
});

test("editor: __advanced is display state and never reaches the saved config", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const ed = makeEditor(fx.config, hass);

  const data = ed._computeFormData(fx.config);
  assert.equal("__advanced" in data, true, "seeded for the form");

  let saved = null;
  ed.addEventListener("config-changed", (e) => { saved = e.detail.config; });
  ed._update = () => {}; // the flip re-renders; stub it out for the test

  // Flipping it must NOT emit a config, it only changes the schema.
  ed._valueChanged({ stopPropagation() {}, detail: { value: Object.assign({}, data, { __advanced: true }) } });
  assert.equal(saved, null, "toggling disclosure is not a config change");
  assert.equal(ed._showAdvanced, true);

  // A real edit while advanced is on must still save, and still carry no flag.
  const next = Object.assign({}, ed._computeFormData(fx.config), { name: "Sala" });
  ed._valueChanged({ stopPropagation() {}, detail: { value: next } });
  assert.ok(saved, "a real edit emits");
  assert.equal("__advanced" in saved, false, "the flag is stripped");
  assert.equal(saved.name, "Sala");
});

test("editor: preset_names round-trips through the pn__ display fields", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const ed = makeEditor(Object.assign({}, fx.config, { preset_names: { eco: "iECO" } }), hass);
  ed._showAdvanced = true;

  const data = ed._computeFormData(ed._config);
  assert.equal(data.pn__eco, "iECO", "seeded from config");

  let saved = null;
  ed.addEventListener("config-changed", (e) => { saved = e.detail.config; });
  ed._valueChanged({ stopPropagation() {}, detail: { value: Object.assign({}, data, { pn__boost: "Turbo" }) } });

  assert.deepEqual(saved.preset_names, { eco: "iECO", boost: "Turbo" });
  assert.equal("pn__eco" in saved, false, "display keys are stripped");
});
