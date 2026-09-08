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
function fieldNames(rows, out) {
  out = out || [];
  rows.forEach((r) => { if (r.name) out.push(r.name); if (r.schema) fieldNames(r.schema, out); });
  return out;
}
function findField(rows, name) {
  for (const r of rows) {
    if (r.name === name) return r;
    if (r.schema) { const hit = findField(r.schema, name); if (hit) return hit; }
  }
  return null;
}

function topLevelRows(schema) {
  return schema.length;
}

test("editor: a first-time user sees a handful of rows, not the whole surface", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const ed = makeEditor(fx.config, hass);

  const basic = ed._schema(hass, fx.config);
  // Was 4. The Fan section is the fifth, ABOVE the advanced switch, because the ring
  // style is the control a person is most likely to want and hiding it behind a
  // curtain hides the whole decision. It sits in the Fan section rather than loose at
  // the top, so there is one place that owns fan settings. The guard moves, not goes.
  assert.equal(topLevelRows(basic), 5,
    "entity, name, Fan, Appearance and the advanced switch");
  assert.ok(fieldNames(basic).includes("fan_style"),
    "the fan ring choice is reachable without opening advanced");

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

test("editor: fan_style offers the shipped ring plus the two animations", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const ed = makeEditor(fx.config, hass);
  const row = findField(ed._schema(hass, fx.config), "fan_style");
  assert.ok(row, "fan_style is present without opening advanced");
  const sel = row.selector.select;
  // mode list renders radios. A dropdown hides two of the three choices behind a
  // click, and the owner's complaint was specifically about dropdowns.
  assert.equal(sel.mode, "list");
  // silk leads because it is the default from 2.3.0, so the list reads as a default
  // and its alternatives. NOT "dash": the handoff has a dashed style, but the
  // released card draws a smooth gradient ring, so dash is a config alias only.
  assert.deepEqual(sel.options.map((o) => o.value), ["silk", "breeze", "original"]);
  assert.ok(sel.options.some((o) => /original/i.test(o.label)),
    "the ring every installed card draws today is still offered by name");
});

test("editor: the original spinning fan glyph is offered, off by default", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const ed = makeEditor(fx.config, hass);
  const row = findField(ed._schema(hass, fx.config), "fan_clover");
  assert.ok(row, "reachable without opening advanced, beside the ring choice");
  assert.ok(row.selector.boolean, "a plain on/off, not a dropdown");
});

test("editor: the retired clover animation keys are gone from the GUI but still read", () => {
  const hass = makeHass(fx.states, { entities: fx.entities });
  const ed = makeEditor(fx.config, hass);
  ed._showAdvanced = true;
  const names = [];
  (function walk(rows) {
    rows.forEach((r) => { if (r.name) names.push(r.name); if (r.schema) walk(r.schema); });
  })(ed._schema(hass, fx.config));
  // Both drive the spinning clover, which the dial face does not draw, so the
  // controls did nothing. Reading them must still work for existing YAML.
  assert.ok(!names.includes("fan_animation"), "no control for a dead key");
  assert.ok(!names.includes("fan_animation_speed"), "no control for a dead key");
});
