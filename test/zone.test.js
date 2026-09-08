// The zone layout, which is the group card's default from 2.3.0, and its editor.
//
// Everything here is either a state the handoff module threw on rather than drew, or
// a shipped config key it had no reader for. Both classes of defect are invisible to
// a test that only asks "did it render", so each one asserts on the thing that broke.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass } from "./helpers.js";

const zone = (id, over) => ({
  entity_id: id,
  state: "cool",
  attributes: Object.assign({
    friendly_name: "Aire " + id.split(".")[1].replace(/^./, (c) => c.toUpperCase()),
    hvac_modes: ["off", "auto", "cool", "dry", "fan_only"],
    preset_modes: ["none", "comfort", "eco", "boost", "sleep"], preset_mode: "none",
    fan_modes: ["auto", "low", "medium", "high"], fan_mode: "auto",
    current_temperature: 76, temperature: 74, min_temp: 61, max_temp: 86,
  }, over || {}),
});

const states = {
  "climate.sala": zone("climate.sala"),
  "climate.ricky": zone("climate.ricky", { current_temperature: 78, temperature: 75 }),
  "climate.elly": zone("climate.elly", { current_temperature: 71, temperature: 70 }),
};
const entities = {
  "climate.sala": { entity_id: "climate.sala", device_id: "d1" },
  "climate.ricky": { entity_id: "climate.ricky", device_id: "d2" },
  "climate.elly": { entity_id: "climate.elly", device_id: "d3" },
};
const ids = ["climate.sala", "climate.ricky", "climate.elly"];

function makeGroup(config, hass) {
  const el = document.createElement("climate-cluster-group-card");
  el.setConfig(Object.assign({ entities: ids }, config || {}));
  el.hass = hass || makeHass(states, { entities });
  return el;
}
const text = (el) => el.shadowRoot.querySelector(".cg-inner").textContent;
const html = (el) => el.shadowRoot.querySelector(".cg-inner").innerHTML;

// ---------------------------------------------------------------- it renders ----

test("zone: the zone layout is the default, and it draws a tile per room", () => {
  const el = makeGroup();
  assert.equal(el.shadowRoot.querySelectorAll("[data-zone]").length, 3);
  assert.ok(el.shadowRoot.querySelector(".cg-zonecard"), "the zone card is what rendered");
  assert.equal(el.shadowRoot.querySelector(".cg-zone"), null, "not the classic grid");
});

test("zone: layout classic still draws the shipped grid", () => {
  const el = makeGroup({ layout: "classic" });
  assert.ok(el.shadowRoot.querySelector(".cg-zone"), "classic tiles are back");
  assert.equal(el.shadowRoot.querySelector(".cg-zonecard"), null);
});

// ------------------------------------------------- states the module threw on ----
// Each of these took the WHOLE card down before, not one tile: MODES[z.mode] was
// dereferenced with no guard, and one missing reading put NaN through every number.

test("zone: an unavailable room renders as offline instead of taking the card down", () => {
  const dead = Object.assign({}, states, {
    "climate.ricky": { entity_id: "climate.ricky", state: "unavailable", attributes: {} },
  });
  const el = makeGroup({}, makeHass(dead, { entities }));
  assert.equal(el.shadowRoot.querySelectorAll("[data-zone]").length, 3, "every room still drawn");
  assert.match(text(el), /OFFLINE/);
  assert.ok(!text(el).includes("NaN"), "no NaN reached the screen");
  // the living rooms still average correctly: 76 and 71 with the dead one excluded
  assert.match(text(el), /74/);
});

test("zone: a heat_cool room renders", () => {
  const hc = Object.assign({}, states, {
    "climate.ricky": zone("climate.ricky", {
      hvac_modes: ["off", "heat_cool"], temperature: null,
      target_temp_low: 68, target_temp_high: 76,
    }),
  });
  hc["climate.ricky"].state = "heat_cool";
  const el = makeGroup({}, makeHass(hc, { entities }));
  assert.equal(el.shadowRoot.querySelectorAll("[data-zone]").length, 3);
  assert.ok(!text(el).includes("NaN"));
});

test("zone: every room offline still renders a card", () => {
  const allDead = {};
  for (const id of ids) allDead[id] = { entity_id: id, state: "unavailable", attributes: {} };
  const el = makeGroup({}, makeHass(allDead, { entities }));
  assert.ok(el.shadowRoot.querySelector(".cg-zonecard"));
  assert.ok(!text(el).includes("NaN"));
});

test("zone: a room with no reading shows a dash, not a number it never reported", () => {
  const noTemp = Object.assign({}, states, {
    "climate.elly": zone("climate.elly", { current_temperature: null }),
  });
  const el = makeGroup({}, makeHass(noTemp, { entities }));
  assert.ok(!text(el).includes("NaN"));
  assert.equal(el.shadowRoot.querySelectorAll("[data-zone]").length, 3);
});

test("zone: a name carrying markup lands as text, not as elements", () => {
  const evil = JSON.parse(JSON.stringify(states));
  evil["climate.sala"].attributes.friendly_name = '<img src=x onerror=alert(1)>"';
  const el = makeGroup({}, makeHass(evil, { entities }));
  assert.equal(el.shadowRoot.querySelectorAll("img").length, 0);
  assert.equal(el.shadowRoot.querySelectorAll("script").length, 0);
});

// -------------------------------------------- shipped keys the module dropped ----

test("zone: the counter still says how many of how many", () => {
  const el = makeGroup();
  // three rooms, all cool: the total is the reading that shows one has fallen out
  assert.match(text(el), /3\s*\/\s*3/);
});

test("zone: group_actions false removes the button bar", () => {
  assert.ok(makeGroup().shadowRoot.querySelector("[data-gact]"), "the bar is there by default");
  assert.equal(makeGroup({ group_actions: false }).shadowRoot.querySelector("[data-gact]"), null);
});

test("zone: zone_rows still lays the rooms out in the number of rows asked for", () => {
  const el = makeGroup({ zone_rows: 3 });          // 3 rooms over 3 rows is 1 column
  const grid = el.shadowRoot.querySelector(".cg-zonecard-tiles");
  assert.match(grid.getAttribute("style") || "", /repeat\(1,/);

  const loose = makeGroup().shadowRoot.querySelector(".cg-zonecard-tiles");
  assert.match(loose.getAttribute("style") || "", /auto-fit/,
    "unset leaves the rooms free to wrap on their own");
});

test("zone: the shared name prefix comes off the tiles", () => {
  // the tiles uppercase in CSS, so the text node keeps the original casing
  const t = text(makeGroup());
  assert.match(t, /Sala/);
  assert.ok(!/Aire[ -]Sala/i.test(t), "the prefix every room shares is dropped");
});

test("zone: an auto fan reads AUTO, not a percentage the unit never reported", () => {
  assert.match(text(makeGroup()), /AUTO/);
  const fast = Object.assign({}, states, {
    "climate.sala": zone("climate.sala", { fan_mode: "high" }),
  });
  assert.match(text(makeGroup({}, makeHass(fast, { entities }))), /100%/);
});

test("zone: AUTO is the card's yellow and DRY its teal, and nothing is green", () => {
  const auto = Object.assign({}, states, { "climate.sala": zone("climate.sala") });
  auto["climate.sala"].state = "auto";
  const h = html(makeGroup({}, makeHass(auto, { entities })));
  assert.match(h, /255\s*,\s*220\s*,\s*90/, "the card's warm yellow");
  assert.doesNotMatch(h, /7CE0B0/i, "not the module's mint");
});

// ------------------------------------------------------------------- editor ----

test("zone: the group card offers a visual editor at all", () => {
  const El = customElements.get("climate-cluster-group-card");
  assert.equal(typeof El.getConfigElement, "function",
    "without this Home Assistant shows 'Visual editor not supported'");
  const ed = El.getConfigElement();
  assert.ok(ed, "and it resolves to a real element");
});

test("zone: the stub config is a working card, not an empty one", () => {
  const El = customElements.get("climate-cluster-group-card");
  const stub = El.getStubConfig(makeHass(states, { entities }));
  assert.ok(Array.isArray(stub.entities) && stub.entities.length, "it comes with rooms");
  assert.doesNotThrow(() => makeGroup(stub));
});

function makeEditor(config) {
  const ed = document.createElement("climate-cluster-group-card-editor");
  ed.setConfig(config);
  ed.hass = makeHass(states, { entities });
  return ed;
}
const names = (rows) => rows.flatMap((r) => r.schema ? r.schema.map((x) => x.name) : [r.name]);

test("editor: the everyday fields are at the top, the rest folded away", () => {
  const ed = makeEditor({ entities: ids });
  const top = ed._schema().filter((r) => r.type !== "expandable").map((r) => r.name);
  assert.deepEqual(top, ["entities", "name", "layout"]);
  const secs = ed._schema().filter((r) => r.type === "expandable").map((r) => r.name);
  assert.deepEqual(secs, ["look", "grid", "range"]);
});

test("editor: hero and tap_zone are only offered on the layout that draws them", () => {
  assert.ok(!names(makeEditor({ entities: ids })._schema()).includes("hero"),
    "the zone layout has no hero picker, so it must not offer one");
  const classic = names(makeEditor({ entities: ids, layout: "classic" })._schema());
  assert.ok(classic.includes("hero"));
  assert.ok(classic.includes("tap_zone"));
});

test("editor: a per-room name survives a trip through the entity picker", () => {
  // The picker speaks plain ids. Round-tripping through it must not throw away the
  // { entity, name } objects, which is the whole per-room rename feature.
  const ed = makeEditor({ entities: ["climate.sala", { entity: "climate.ricky", name: "Cuarto" }] });
  const merged = ed._mergeEntities(["climate.sala", "climate.ricky", "climate.elly"]);
  assert.deepEqual(merged[1], { entity: "climate.ricky", name: "Cuarto" });
  assert.equal(merged[0], "climate.sala");
  assert.equal(merged[2], "climate.elly");
});

test("editor: dropping a room does not resurrect it", () => {
  const ed = makeEditor({ entities: ["climate.sala", { entity: "climate.ricky", name: "Cuarto" }] });
  assert.deepEqual(ed._mergeEntities(["climate.sala"]), ["climate.sala"]);
});
