// Rename feature: mode_names relabels the mode buttons ("presets"), and the visual
// editor exposes a rename text field per mode and per extra-toggle entity. These lock
// (1) the card honoring mode_names, and (2) the editor's seed/round-trip so the GUI
// fields (mn__<mode>, xtn__<entity>) fold into mode_names / extra_toggles[].name and
// never leak into the saved config.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass, makeCard } from "./helpers.js";

const CLIMATE = {
  "climate.ac": {
    entity_id: "climate.ac",
    state: "cool",
    attributes: {
      hvac_modes: ["off", "auto", "cool", "dry", "fan_only"],
      temperature: 72, current_temperature: 74,
    },
  },
  "switch.boost": { entity_id: "switch.boost", state: "off", attributes: { friendly_name: "AC Boost Mode" } },
};

// ---- card: mode_names overrides the mode-button label ----

test("mode_names overrides a mode button label; other modes are unaffected", () => {
  const card = makeCard({ entity: "climate.ac", mode_names: { cool: "Cooling", fan_only: "Fan" } }, makeHass(CLIMATE));
  assert.equal(card._modeName("cool"), "Cooling");
  assert.equal(card._modeName("fan_only"), "Fan");
  assert.notEqual(card._modeName("dry"), "Cooling");
  assert.notEqual(card._modeName("dry"), "Fan");
});

test("a blank mode_names entry is ignored (falls back to the default label)", () => {
  const card = makeCard({ entity: "climate.ac", mode_names: { cool: "   " } }, makeHass(CLIMATE));
  assert.notEqual(card._modeName("cool").trim(), "");
});

// ---- editor: seed + round-trip of the rename fields ----

function makeEditor(config, hass) {
  const ed = document.createElement("climate-cluster-card-editor");
  ed._hass = hass;
  ed._config = config; // prior config = the diff base _valueChanged reads
  return ed;
}

test("editor seeds mn__/xtn__ fields from the real config", () => {
  const ed = makeEditor(
    { entity: "climate.ac", mode_names: { cool: "Cooling" }, extra_toggles: [{ entity: "switch.boost", name: "Boost" }] },
    makeHass(CLIMATE),
  );
  const data = ed._computeFormData(ed._config);
  assert.equal(data["mn__cool"], "Cooling", "seeded from mode_names");
  assert.equal(data["mn__dry"], "", "unset mode label is an empty field");
  assert.equal(data["xtn__switch.boost"], "Boost", "seeded from the toggle's name");
  assert.deepEqual(data.extra_toggles, ["switch.boost"], "the entity picker still sees ids only");
});

test("editing a mode label + a toggle name writes mode_names / extra_toggles[].name and strips editor keys", () => {
  const ed = makeEditor({ entity: "climate.ac", extra_toggles: ["switch.boost"] }, makeHass(CLIMATE));
  let out = null;
  ed.addEventListener("config-changed", (e) => { out = e.detail.config; });

  ed._valueChanged({ stopPropagation() {}, detail: { value: {
    entity: "climate.ac",
    extra_toggles: ["switch.boost"],
    "mn__off": "", "mn__auto": "", "mn__cool": "Cooling", "mn__dry": "", "mn__fan_only": "",
    "xtn__switch.boost": "Boost",
  } } });

  assert.ok(out, "emits config-changed");
  assert.deepEqual(out.mode_names, { cool: "Cooling" }, "only non-empty mode labels persist");
  assert.deepEqual(out.extra_toggles, [{ entity: "switch.boost", name: "Boost" }], "the toggle gains its name");
  assert.ok(!Object.keys(out).some((k) => k.indexOf("mn__") === 0 || k.indexOf("xtn__") === 0), "no editor-only keys leak into the config");
});

test("clearing a toggle-name field removes the name (back to a bare entity id)", () => {
  const ed = makeEditor({ entity: "climate.ac", extra_toggles: [{ entity: "switch.boost", name: "Boost" }] }, makeHass(CLIMATE));
  let out = null;
  ed.addEventListener("config-changed", (e) => { out = e.detail.config; });

  ed._valueChanged({ stopPropagation() {}, detail: { value: {
    entity: "climate.ac",
    extra_toggles: ["switch.boost"],
    "mn__off": "", "mn__auto": "", "mn__cool": "", "mn__dry": "", "mn__fan_only": "",
    "xtn__switch.boost": "",
  } } });

  assert.deepEqual(out.extra_toggles, ["switch.boost"], "an emptied name field drops back to a bare string");
  assert.ok(!("mode_names" in out), "no mode labels set -> no mode_names key");
});

test("a YAML-authored icon survives a GUI name edit", () => {
  const ed = makeEditor({ entity: "climate.ac", extra_toggles: [{ entity: "switch.boost", icon: "mdi:rocket" }] }, makeHass(CLIMATE));
  let out = null;
  ed.addEventListener("config-changed", (e) => { out = e.detail.config; });

  ed._valueChanged({ stopPropagation() {}, detail: { value: {
    entity: "climate.ac",
    extra_toggles: ["switch.boost"],
    "mn__off": "", "mn__auto": "", "mn__cool": "", "mn__dry": "", "mn__fan_only": "",
    "xtn__switch.boost": "Boost",
  } } });

  assert.deepEqual(out.extra_toggles, [{ entity: "switch.boost", name: "Boost", icon: "mdi:rocket" }], "name added, icon preserved");
});
