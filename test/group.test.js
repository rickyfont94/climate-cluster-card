// Group card tests. The two things worth locking down are that it never writes a
// value some zone would reject, and that its dirty check actually stops it
// rebuilding on unrelated state changes, since a group card watches many entities.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass } from "./helpers.js";

const states = {
  "climate.living": {
    entity_id: "climate.living", state: "cool",
    attributes: {
      friendly_name: "Living", hvac_modes: ["off", "cool"],
      preset_modes: ["none", "eco", "boost"], preset_mode: "none",
      current_temperature: 76, temperature: 72, min_temp: 61, max_temp: 86,
    },
  },
  "climate.bedroom": {
    entity_id: "climate.bedroom", state: "cool",
    attributes: {
      friendly_name: "Bedroom", hvac_modes: ["off", "cool"],
      preset_modes: ["none", "eco", "sleep"], preset_mode: "none",
      current_temperature: 71, temperature: 70, min_temp: 61, max_temp: 86,
    },
  },
  "climate.guest": {
    entity_id: "climate.guest", state: "off",
    attributes: {
      friendly_name: "Guest", hvac_modes: ["off", "cool"],
      current_temperature: 73, temperature: 68, min_temp: 61, max_temp: 86,
    },
  },
  "climate.dual": {
    entity_id: "climate.dual", state: "heat_cool",
    attributes: {
      friendly_name: "Dual", hvac_modes: ["off", "heat_cool"],
      current_temperature: 70, temperature: null,
      target_temp_low: 68, target_temp_high: 74, min_temp: 45, max_temp: 90,
    },
  },
  "light.unrelated": { entity_id: "light.unrelated", state: "on", attributes: {} },
};

function makeGroup(config, hass) {
  const el = document.createElement("climate-cluster-group-card");
  el.setConfig(config);
  if (hass) el.hass = hass;
  return el;
}
const baseConfig = { type: "custom:climate-cluster-group-card", entities: ["climate.living", "climate.bedroom", "climate.guest"] };

test("group: refuses a config with no climate entities", () => {
  assert.throws(() => makeGroup({ entities: [] }), /at least one climate entity/);
  assert.throws(() => makeGroup({ entities: ["light.kitchen"] }), /at least one climate entity/);
});

test("group: accepts bare ids and objects, and ignores non-climate entries", () => {
  const el = makeGroup({ entities: ["climate.living", { entity: "climate.bedroom", name: "Cuarto" }, "light.x"] },
    makeHass(states));
  assert.equal(el._zones.length, 2);
  assert.equal(el._zones[1].name, "Cuarto");
});

test("group: the hero average uses only zones that report a setpoint", () => {
  const el = makeGroup(baseConfig, makeHass(states));
  const zones = el._zones.map((z) => el._live(z));
  const hero = el._heroPick(zones);
  assert.equal(hero.kind, "average");
  // living 72, bedroom 70, guest is off but still reports 68
  assert.equal(Math.round(hero.set), 70);
  assert.equal(hero.running, 2, "guest is off");
});

test("group: tapping a zone focuses it into the hero, tapping again returns", () => {
  const el = makeGroup(baseConfig, makeHass(states));
  el._focus = "climate.bedroom";
  const zones = el._zones.map((z) => el._live(z));
  const hero = el._heroPick(zones);
  assert.equal(hero.kind, "zone");
  assert.equal(hero.z.id, "climate.bedroom");
});

test("group: only presets EVERY zone supports are offered", () => {
  const el = makeGroup({ entities: ["climate.living", "climate.bedroom"] }, makeHass(states));
  assert.deepEqual(el._sharedPresets(), ["eco"], "boost and sleep are not shared, none is dropped");

  const withOff = makeGroup(baseConfig, makeHass(states));
  assert.deepEqual(withOff._sharedPresets(), [], "guest advertises no presets at all");
});

test("group: all-off targets every zone in one call", () => {
  const hass = makeHass(states);
  const el = makeGroup(baseConfig, hass);
  el._groupAction("off");
  assert.equal(hass.calls.length, 1);
  assert.equal(hass.calls[0].service, "turn_off");
  assert.deepEqual(hass.calls[0].data.entity_id,
    ["climate.living", "climate.bedroom", "climate.guest"]);
});

test("group: sync skips a heat_cool zone rather than guessing which setpoint to move", () => {
  const hass = makeHass(states);
  const el = makeGroup({ entities: ["climate.living", "climate.dual", "climate.guest"] }, hass);
  el._groupAction("setpoint", "74");
  assert.equal(hass.calls.length, 1);
  const ids = hass.calls[0].data.entity_id;
  assert.ok(ids.includes("climate.living"));
  assert.ok(!ids.includes("climate.dual"), "dual setpoint zone is skipped");
  assert.ok(!ids.includes("climate.guest"), "an off zone is skipped");
  assert.equal(hass.calls[0].data.temperature, 74);
});

test("group: a bad sync argument writes nothing", () => {
  const hass = makeHass(states);
  const el = makeGroup(baseConfig, hass);
  el._groupAction("setpoint", "not-a-number");
  assert.equal(hass.calls.length, 0);
});

test("group: an unrelated entity changing does not repaint the card", () => {
  const hass = makeHass(states);
  const el = makeGroup(baseConfig, hass);
  const first = el._sig;
  assert.ok(first, "a signature was taken on the first paint");

  const next = makeHass(Object.assign({}, states, {
    "light.unrelated": { entity_id: "light.unrelated", state: "off", attributes: {} },
  }));
  el.hass = next;
  assert.equal(el._sig, first, "signature unchanged, so no rebuild");
});

test("group: a watched zone changing DOES repaint", () => {
  const hass = makeHass(states);
  const el = makeGroup(baseConfig, hass);
  const first = el._sig;

  const bumped = JSON.parse(JSON.stringify(states));
  bumped["climate.living"].attributes.temperature = 75;
  el.hass = makeHass(bumped);
  assert.notEqual(el._sig, first, "a zone setpoint change must repaint");
});

test("group: an entity name carrying markup cannot break out of the card", () => {
  const evil = JSON.parse(JSON.stringify(states));
  evil["climate.living"].attributes.friendly_name = '<img src=x onerror=alert(1)>"';
  const el = makeGroup(baseConfig, makeHass(evil));
  const html = el.shadowRoot.querySelector("ha-card").innerHTML;
  assert.ok(!html.includes("<img src=x"), "the tag must be escaped, not rendered");
  assert.ok(html.includes("&lt;img"), "escaped form is present");
  assert.equal(el.shadowRoot.querySelectorAll("img").length, 0);
});

test("group: a dead zone shows as unavailable instead of a stale reading", () => {
  const dead = JSON.parse(JSON.stringify(states));
  dead["climate.guest"].state = "unavailable";
  const el = makeGroup(baseConfig, makeHass(dead));
  const z = el._live({ entity: "climate.guest" });
  assert.equal(z.dead, true);
  assert.equal(z.on, false);
});

test("group: renders a hero gauge, one tile per zone, and a working action bar", () => {
  const hass = makeHass(states);
  const el = makeGroup(baseConfig, hass);
  const root = el.shadowRoot;

  assert.equal(root.querySelectorAll("[data-zone]").length, 3, "one tile per zone");
  assert.ok(root.querySelector(".cg-hero-svg"), "hero gauge is drawn");
  assert.equal(root.querySelectorAll(".cg-zone-svg").length, 3, "each zone gets its own gauge");

  // the hero arc must be a real path inside the viewBox, not an empty or NaN one
  const paths = [...root.querySelectorAll(".cg-hero-svg path")].map((p) => p.getAttribute("d"));
  assert.ok(paths.length > 0);
  assert.ok(paths.every((d) => d && d.indexOf("NaN") === -1), "no NaN geometry");

  const acts = [...root.querySelectorAll("[data-act]")].map((b) => b.dataset.act);
  assert.ok(acts.includes("off"), "all-off is offered");
  assert.ok(acts.includes("setpoint"), "sync is offered when a hero setpoint exists");
});

test("group: the hero big number reads the average, not a raw entity value", () => {
  const el = makeGroup(baseConfig, makeHass(states));
  const big = el.shadowRoot.querySelector(".cg-hero-big").textContent;
  assert.equal(big, "70", "living 72, bedroom 70, guest 68");
});

test("group: a single-zone card still renders", () => {
  const el = makeGroup({ entities: ["climate.living"] }, makeHass(states));
  assert.equal(el.shadowRoot.querySelectorAll("[data-zone]").length, 1);
  assert.ok(el.shadowRoot.querySelector(".cg-hero-svg"));
});

test("group: eight zones all render, nothing is silently dropped", () => {
  const many = JSON.parse(JSON.stringify(states));
  const ids = [];
  for (let i = 0; i < 8; i++) {
    const id = "climate.z" + i;
    ids.push(id);
    many[id] = { entity_id: id, state: "cool",
      attributes: { friendly_name: "Zone " + i, current_temperature: 70 + i, temperature: 70,
        min_temp: 61, max_temp: 86 } };
  }
  const el = makeGroup({ entities: ids }, makeHass(many));
  assert.equal(el.shadowRoot.querySelectorAll("[data-zone]").length, 8);
});
