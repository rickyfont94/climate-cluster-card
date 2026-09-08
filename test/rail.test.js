// The dial's bottom row, and the fan ring that sits above it.
//
// `rail` is its OWN key on purpose: show_fan / show_swing / show_led / show_sound are
// dual-surface, they gate the popup chips as well as this row, so folding them into an
// ordering key would have destroyed popup config for anyone already using them. Half
// of what follows exists to prove that separation still holds.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass } from "./helpers.js";

// one unit that really advertises a fan and a swing, so "hide the fan" has something
// to hide and "skip what it does not have" has something to skip
const railStates = {
  "climate.rail": {
    entity_id: "climate.rail", state: "cool",
    attributes: {
      friendly_name: "Rail", hvac_modes: ["off", "cool"],
      fan_modes: ["low", "high", "auto"], fan_mode: "high",
      swing_modes: ["off", "vertical"], swing_mode: "off",
      current_temperature: 76, temperature: 72, min_temp: 61, max_temp: 86,
    },
  },
};
const railEnts = { "climate.rail": { entity_id: "climate.rail", device_id: "dr" } };
function railCard(extra) {
  const el = document.createElement("climate-cluster-card");
  el.setConfig(Object.assign({ type: "custom:climate-cluster-card", entity: "climate.rail" },
    extra || {}));
  el.hass = makeHass(railStates, { entities: railEnts });
  return el;
}
const railKeys = (extra) => railCard(extra)._faceCells().map((c) => c.key);

// ------------------------------------------------------------------ the ring ----

test("card: show_fan false hides the ring AND its rail cell, not just the button", () => {
  // The label promised it controlled the fan ring while it only removed the button.
  const on = railCard();
  assert.ok(on.shadowRoot.querySelector(".ct-face-fan").innerHTML.length,
    "the fixture really does draw a ring when left alone");

  const el = railCard({ show_fan: false });
  assert.equal(el.shadowRoot.querySelector(".ct-face-fan").innerHTML, "", "no ring drawn");
  assert.ok(!/FAN/.test(el.shadowRoot.querySelector(".ct-face-rail").textContent || ""),
    "no FAN cell either");
});

test("card: silk is the default ring, and the shipped arc is still reachable", () => {
  assert.equal(railCard()._fanStyle, "silk", "unset means silk from 2.3.0");
  assert.equal(railCard({ fan_style: "nonsense" })._fanStyle, "silk",
    "an unknown value falls back to the default");
  assert.equal(railCard({ fan_style: "silk" })._fanStyle, "silk");
  assert.equal(railCard({ fan_style: "breeze" })._fanStyle, "breeze");
  assert.equal(railCard({ fan_style: "original" })._fanStyle, "original",
    "the plain arc every installed card draws today is still reachable by name");
});

// ------------------------------------------------------------------ the rail ----

test("rail: unset gives every button the unit actually has", () => {
  const keys = railKeys();
  assert.deepEqual(keys, railCard()._faceCellsAvailable().map((c) => c.key));
  assert.ok(keys.length >= 2, "this fixture has a fan and a swing: " + keys.join(","));
});

test("rail: the order asked for is the order drawn", () => {
  const all = railKeys();
  const reversed = all.slice().reverse();
  assert.deepEqual(railKeys({ rail: reversed }), reversed, "reversing the list reverses the row");
  assert.deepEqual(railKeys({ rail: [all[0]] }), [all[0]], "and asking for one gives one");
});

test("rail: a button for something this unit does not have is skipped, not drawn dead", () => {
  const keys = railKeys({ rail: ["fan", "nonsense", "extra:2", "sound"] });
  assert.deepEqual(keys, ["fan"], "only the one it really has: " + keys.join(","));
});

test("rail: a repeated name is drawn once", () => {
  assert.deepEqual(railKeys({ rail: ["fan", "fan", "swing"] }), ["fan", "swing"]);
});

test("rail: it does NOT touch the popup chips, which share those keys", () => {
  const plain = railCard();
  const railed = railCard({ rail: ["swing"] });
  assert.deepEqual(railed._faceCells().map((c) => c.key), ["swing"], "the row is just swing");

  // everything the POPUP resolves from is identical: rail moves the row and nothing
  // else, which is the whole reason it is a separate key
  assert.equal(railed._haveFan(), plain._haveFan(), "the ring is untouched");
  for (const k of ["swing", "led", "sound"]) {
    assert.equal(railed._featureResolved(k), plain._featureResolved(k),
      k + " resolves the same, so its popup chip is untouched");
  }
});

// ------------------------------------------------ extra toggles on the rail ----
// The caption fell straight to the entity id when no name was configured, and a
// Midea switch's object id is the device serial. Five of these cards on one
// dashboard read 30786325, 15063309, 15063309, 15063309, 15063309: four identical
// and all meaningless, with the friendly name sitting right there unread.

const xCard = (toggles, over) => {
  const st = JSON.parse(JSON.stringify(railStates));
  Object.assign(st, over || {});
  const el = document.createElement("climate-cluster-card");
  el.setConfig({ type: "custom:climate-cluster-card", entity: "climate.rail",
    name: "Aire-Sala", extra_toggles: toggles });
  st["climate.rail"].attributes.friendly_name = "Aire-Sala";
  el.hass = makeHass(st, { entities: railEnts });
  return el;
};
const xCap = (el) => (el._faceCellsAvailable().find((c) => c.key === "extra:0") || {}).caption;

const boostSw = {
  "switch.30786325859366_boost_mode": {
    entity_id: "switch.30786325859366_boost_mode", state: "on",
    attributes: { friendly_name: "Aire-Sala Boost Mode" } },
};

test("extra: the caption is the friendly name, not the device serial", () => {
  const el = xCard(["switch.30786325859366_boost_mode"], boostSw);
  assert.equal(xCap(el), "BOOST",
    "the unit's own name comes off the front and Mode comes off the back");
});

test("extra: a configured name is used exactly as written", () => {
  const el = xCard([{ entity: "switch.30786325859366_boost_mode", name: "Turbo" }], boostSw);
  assert.equal(xCap(el), "TURBO");
});

test("extra: a name too long for the cell keeps the word that identifies it", () => {
  // these read "<unit> <feature> Mode", so the LAST word is the one that says what
  // the toggle does; a blind left slice called Aire-Master Boost "AIRE-MAS"
  const sw = { "switch.x_boost": { entity_id: "switch.x_boost", state: "off",
    attributes: { friendly_name: "Aire-Master Boost Mode" } } };
  assert.equal(xCap(xCard(["switch.x_boost"], sw)), "BOOST");

  const m = { "switch.x_mildew": { entity_id: "switch.x_mildew", state: "off",
    attributes: { friendly_name: "Anti Mildew" } } };
  assert.equal(xCap(xCard(["switch.x_mildew"], m)), "MILDEW");
});

test("extra: a short name is left alone", () => {
  const sw = { "switch.x_ion": { entity_id: "switch.x_ion", state: "off",
    attributes: { friendly_name: "Ionizer" } } };
  assert.equal(xCap(xCard(["switch.x_ion"], sw)), "IONIZER");
});

test("extra: a switch with no friendly name at all still says something", () => {
  const sw = { "switch.plain": { entity_id: "switch.plain", state: "off", attributes: {} } };
  const cap = xCap(xCard(["switch.plain"], sw));
  assert.ok(cap && cap.length, "never blank: " + JSON.stringify(cap));
});
