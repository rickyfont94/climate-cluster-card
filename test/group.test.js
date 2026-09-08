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
// The zone layout is the default from 2.3.0. The grid of mini gauges still ships,
// behind `layout: "classic"`, so the tests that assert its DOM ask for it by name
// rather than being deleted: it is a look a user may have chosen on purpose.
const classicConfig = Object.assign({}, baseConfig, { layout: "classic" });

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
  const el = makeGroup(classicConfig, makeHass(states));
  const zones = el._zones.map((z) => el._live(z));
  const hero = el._heroPick(zones);
  assert.equal(hero.kind, "average");
  // living 72, bedroom 70, guest is off but still reports 68
  assert.equal(Math.round(hero.set), 70);
  assert.equal(hero.running, 2, "guest is off");
});

test("group: tapping a zone focuses it into the hero, tapping again returns", () => {
  const el = makeGroup(classicConfig, makeHass(states));
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
  const el = makeGroup(classicConfig, makeHass(evil));
  const root = el.shadowRoot;

  // Assert on the DOM, not on innerHTML. The HTML serializer does not escape angle
  // brackets inside attribute values, so a title="<img ...>" round-trips through
  // innerHTML looking like a tag while being completely inert. What actually matters
  // is that no element was created and the name landed as TEXT.
  assert.equal(root.querySelectorAll("img").length, 0, "no element was created");
  assert.equal(root.querySelectorAll("script").length, 0);
  const span = root.querySelector(".cg-zone-name");
  assert.equal(span.children.length, 0, "the name is a text node, not parsed markup");
  assert.equal(span.textContent, '<img src=x onerror=alert(1)>"', "shown verbatim as text");
});

test("group: a dead zone shows as unavailable instead of a stale reading", () => {
  const dead = JSON.parse(JSON.stringify(states));
  dead["climate.guest"].state = "unavailable";
  const el = makeGroup(classicConfig, makeHass(dead));
  const z = el._live({ entity: "climate.guest" });
  assert.equal(z.dead, true);
  assert.equal(z.on, false);
});

test("group: renders a hero gauge, one tile per zone, and a working action bar", () => {
  const hass = makeHass(states);
  const el = makeGroup(classicConfig, hass);
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
  const el = makeGroup(classicConfig, makeHass(states));
  const big = el.shadowRoot.querySelector(".cg-hero-big").textContent;
  assert.equal(big, "70", "living 72, bedroom 70, guest 68");
});

test("group: a single-zone card still renders", () => {
  const el = makeGroup({ entities: ["climate.living"], layout: "classic" }, makeHass(states));
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
  const el = makeGroup({ entities: ids, layout: "classic" }, makeHass(many));
  assert.equal(el.shadowRoot.querySelectorAll("[data-zone]").length, 8);
});

test("group: zone_rows lays the tiles out in the requested number of rows", () => {
  const el = makeGroup(Object.assign({}, classicConfig, { zone_rows: 3 }), makeHass(states));
  const zones = el.shadowRoot.querySelector(".cg-zones");
  // 3 zones over 3 rows is 1 column
  assert.match(zones.getAttribute("style") || "", /repeat\(1,/);

  const two = makeGroup(Object.assign({}, classicConfig, { zone_rows: 2 }), makeHass(states));
  // 3 zones over 2 rows is 2 columns
  assert.match(two.shadowRoot.querySelector(".cg-zones").getAttribute("style") || "", /repeat\(2,/);

  const one = makeGroup(Object.assign({}, classicConfig, { zone_rows: 1 }), makeHass(states));
  assert.match(one.shadowRoot.querySelector(".cg-zones").getAttribute("style") || "", /repeat\(3,/);
});

test("group: zone_rows unset leaves the responsive grid alone", () => {
  const el = makeGroup(classicConfig, makeHass(states));
  const style = el.shadowRoot.querySelector(".cg-zones").getAttribute("style");
  assert.ok(!style || !style.includes("repeat("), "no inline column override");
});

test("group: a silly zone_rows value is ignored rather than breaking the grid", () => {
  for (const bad of [0, -2, "abc", null]) {
    const el = makeGroup(Object.assign({}, classicConfig, { zone_rows: bad }), makeHass(states));
    const style = el.shadowRoot.querySelector(".cg-zones").getAttribute("style");
    assert.ok(!style || !style.includes("repeat("), `zone_rows ${JSON.stringify(bad)} must fall back`);
  }
});

test("group: more rows than zones does not produce an empty column count", () => {
  const el = makeGroup(Object.assign({}, classicConfig, { zone_rows: 99 }), makeHass(states));
  assert.match(el.shadowRoot.querySelector(".cg-zones").getAttribute("style") || "", /repeat\(1,/);
});

test("group: action_rows lays the group buttons out in rows too", () => {
  const el = makeGroup(Object.assign({}, classicConfig, { action_rows: 1 }), makeHass(states));
  const bar = el.shadowRoot.querySelector(".cg-actions");
  assert.ok(bar.classList.contains("cg-actions-grid"));
  const n = el.shadowRoot.querySelectorAll(".cg-act").length;
  assert.match(bar.getAttribute("style") || "", new RegExp("repeat\\(" + n + ","));
});

test("group: no appearance set leaves the card on the plain theme, slab hidden", () => {
  const el = makeGroup(baseConfig, makeHass(states));
  const card = el.shadowRoot.querySelector("ha-card");
  assert.equal(card.getAttribute("data-appearance"), null);
  assert.ok(el.shadowRoot.querySelector(".cg-frost"), "the slab element still exists");
  assert.equal(card.style.getPropertyValue("--cg-accent"), "");
});

test("group: glass appearance is applied to the ha-card, same contract as the dial", () => {
  for (const [cfg, want] of [["glass", "glass-dark"], ["glass-dark", "glass-dark"], ["glass-light", "glass-light"]]) {
    const el = makeGroup(Object.assign({}, baseConfig, { appearance: cfg }), makeHass(states));
    assert.equal(el.shadowRoot.querySelector("ha-card").getAttribute("data-appearance"), want);
  }
});

test("group: an unknown appearance falls back to the theme, it does not break the card", () => {
  const el = makeGroup(Object.assign({}, classicConfig, { appearance: "chrome" }), makeHass(states));
  assert.equal(el.shadowRoot.querySelector("ha-card").getAttribute("data-appearance"), null);
  assert.equal(el.shadowRoot.querySelectorAll("[data-zone]").length, 3, "still renders");
});

test("group: glass tint and opacity land as custom properties", () => {
  const el = makeGroup(Object.assign({}, baseConfig,
    { appearance: "glass-dark", glass_color: "#0E1A24", glass_opacity: 0.5 }), makeHass(states));
  const card = el.shadowRoot.querySelector("ha-card");
  assert.equal(card.style.getPropertyValue("--ct-glass-rgb"), "14,26,36");
  assert.equal(card.style.getPropertyValue("--ct-glass-alpha"), "0.5");
});

test("group: a bad glass opacity is dropped rather than written through", () => {
  for (const bad of [2, -1, "half", null]) {
    const el = makeGroup(Object.assign({}, baseConfig, { appearance: "glass-dark", glass_opacity: bad }), makeHass(states));
    assert.equal(el.shadowRoot.querySelector("ha-card").style.getPropertyValue("--ct-glass-alpha"), "",
      `glass_opacity ${JSON.stringify(bad)} must fall back to the variant default`);
  }
});

test("group: accent drives the count badge and the preset buttons", () => {
  const el = makeGroup(Object.assign({}, baseConfig, { accent: "#4ADD5F" }), makeHass(states));
  assert.equal(el.shadowRoot.querySelector("ha-card").style.getPropertyValue("--cg-accent"), "#4ADD5F");
});

test("group: the frosted slab never swallows the content", () => {
  // The slab is an absolutely positioned sibling of the content, and a positioned
  // element paints above static blocks. If the content ever loses its own wrapper
  // the whole card goes blank behind the glass, which no functional test would see.
  const el = makeGroup(Object.assign({}, classicConfig, { appearance: "glass-dark" }), makeHass(states));
  const card = el.shadowRoot.querySelector("ha-card");
  const frost = card.querySelector(".cg-frost");
  const inner = card.querySelector(".cg-inner");
  assert.ok(frost && inner, "both children exist");
  assert.ok(inner.querySelector(".cg-title"), "the content lives inside the wrapper");
  assert.equal(frost.querySelector(".cg-title"), null, "and not inside the slab");
  assert.ok(Array.prototype.indexOf.call(card.children, frost)
    < Array.prototype.indexOf.call(card.children, inner), "slab is painted first");
});

test("group: a repaint keeps the slab, it is not wiped by the content rewrite", () => {
  const el = makeGroup(Object.assign({}, baseConfig, { appearance: "glass-dark" }), makeHass(states));
  const frost = el.shadowRoot.querySelector(".cg-frost");
  const bumped = JSON.parse(JSON.stringify(states));
  bumped["climate.living"].attributes.temperature = 75;
  el.hass = makeHass(bumped);
  assert.equal(el.shadowRoot.querySelector(".cg-frost"), frost, "same node survived the repaint");
});

test("group: an appearance-only config change is not swallowed by the dirty check", () => {
  const hass = makeHass(states);
  const el = makeGroup(baseConfig, hass);
  assert.equal(el.shadowRoot.querySelector("ha-card").getAttribute("data-appearance"), null);
  el.setConfig(Object.assign({}, baseConfig, { appearance: "glass-dark", accent: "#35D46E" }));
  const card = el.shadowRoot.querySelector("ha-card");
  assert.equal(card.getAttribute("data-appearance"), "glass-dark");
  assert.equal(card.style.getPropertyValue("--cg-accent"), "#35D46E");
});

test("group: an action button that cannot fit its track truncates instead of spilling", () => {
  // action_rows can force four buttons into one narrow track. Without overflow
  // handling the labels paint outside their own buttons and over each other, which
  // a render caught and no functional assertion would. happy-dom does no layout, so
  // this guards the declaration that prevents it.
  const el = makeGroup(Object.assign({}, baseConfig, { action_rows: 1 }), makeHass(states));
  const css = el.shadowRoot.querySelector("style").textContent;
  const rule = css.slice(css.indexOf(".cg-act{"), css.indexOf(".cg-act:hover"));
  assert.match(rule, /overflow:hidden/);
  assert.match(rule, /text-overflow:ellipsis/);
});

test("group: pinned zone rows make the tiles fill the column height", () => {
  const el = makeGroup(Object.assign({}, classicConfig, { zone_rows: 1 }), makeHass(states));
  assert.ok(el.shadowRoot.querySelector(".cg-zones").classList.contains("cg-zones-fill"));

  const loose = makeGroup(classicConfig, makeHass(states));
  assert.ok(!loose.shadowRoot.querySelector(".cg-zones").classList.contains("cg-zones-fill"),
    "the responsive grid is left alone");

  const silly = makeGroup(Object.assign({}, classicConfig, { zone_rows: "abc" }), makeHass(states));
  assert.ok(!silly.shadowRoot.querySelector(".cg-zones").classList.contains("cg-zones-fill"),
    "a rejected row count must not switch the fill mode on either");
});

test("card: show_fan false hides the ring AND its rail cell, not just the button", () => {
  // The label promised it controlled the fan ring while it only removed the button.
  const el = document.createElement("climate-cluster-card");
  el.setConfig({ type: "custom:climate-cluster-card", entity: "climate.living", show_fan: false });
  el.hass = makeHass(states);
  const fan = el.shadowRoot.querySelector(".ct-face-fan");
  const rail = el.shadowRoot.querySelector(".ct-face-rail");
  assert.equal(fan.innerHTML, "", "no ring drawn");
  assert.ok(!/FAN/.test(rail.textContent || ""), "no FAN cell either");
});

test("card: silk is the default ring, and the shipped arc is still reachable", () => {
  const mk = (style) => {
    const el = document.createElement("climate-cluster-card");
    const cfg = { type: "custom:climate-cluster-card", entity: "climate.living" };
    if (style) cfg.fan_style = style;
    el.setConfig(cfg);
    el.hass = makeHass(states);
    return el;
  };
  assert.equal(mk()._fanStyle, "silk", "unset means silk from 2.3.0");
  assert.equal(mk("nonsense")._fanStyle, "silk", "an unknown value falls back to the default");
  assert.equal(mk("silk")._fanStyle, "silk");
  assert.equal(mk("breeze")._fanStyle, "breeze");
  assert.equal(mk("original")._fanStyle, "original",
    "the plain arc every installed card draws today is still reachable by name");
});

// The rail. `rail` is its OWN key on purpose: show_fan / show_swing / show_led are
// dual-surface, they gate the popup chips as well as this row, so folding them into an
// ordering key would have destroyed popup config for anyone already using them.
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
  el.setConfig(Object.assign({ entity: "climate.rail" }, extra || {}));
  el.hass = makeHass(railStates, { entities: railEnts });
  return el;
}
const railKeys = (extra) => railCard(extra)._faceCells().map((c) => c.key);

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
