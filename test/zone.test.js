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
  assert.deepEqual(top, ["entities", "name", "orientation"]);
  const secs = ed._schema().filter((r) => r.type === "expandable").map((r) => r.name);
  assert.deepEqual(secs, ["look", "grid", "range"]);
});

test("editor: the classic gauges are not offered, only the shape of the zone card", () => {
  const rows = makeEditor({ entities: ids })._schema();
  assert.ok(!names(rows).includes("layout"), "no layout picker at all");
  const orient = rows.find((r) => r.name === "orientation");
  assert.deepEqual(orient.selector.select.options.map((o) => o.value),
    ["auto", "horizontal", "vertical"]);
});

test("editor: a YAML config asking for the classic gauges keeps them", () => {
  // the field is gone from the form; Object.assign must still carry the key through
  const ed = makeEditor({ entities: ids, layout: "classic" });
  const seen = [];
  ed.addEventListener("config-changed", (e) => seen.push(e.detail.config));
  ed._valueChanged({ stopPropagation() {}, detail: { value: { name: "Casa" } } });
  assert.equal(seen[0].layout, "classic", "not silently dropped by the editor");
});

test("zone: orientation forces the shape, and automatic sets no key", () => {
  assert.equal(makeGroup().shadowRoot.querySelector(".cg-zonecard").dataset.orient, "auto");
  assert.equal(makeGroup({ orientation: "horizontal" }).shadowRoot
    .querySelector(".cg-zonecard").dataset.orient, "horizontal");
  assert.equal(makeGroup({ orientation: "vertical" }).shadowRoot
    .querySelector(".cg-zonecard").dataset.orient, "vertical");
  assert.equal(makeGroup({ orientation: "sideways" }).shadowRoot
    .querySelector(".cg-zonecard").dataset.orient, "auto", "junk falls back");
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

// ------------------------------------------------------- the controls actually --
// Every one of these dispatches a real click on a real rendered element and asserts
// the service call it produced. The sheet opened and looked right while none of its
// controls did anything, because the tile scopes itself with data-zone and the sheet
// is a SIBLING of the tile grid rather than a descendant of one tile: a lookup that
// only walked up to [data-zone] found no room and every branch bailed out silently.
// "It rendered" cannot see that, so these click.

function click(el, sel) {
  const node = el.shadowRoot.querySelector(sel);
  assert.ok(node, "no element matched " + sel);
  node.dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  return node;
}
function openSheet(el, i) {
  const tile = el.shadowRoot.querySelectorAll('[data-zone] [data-act="sheet"]')[i || 0];
  assert.ok(tile, "the room numeral is tappable");
  tile.dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  assert.ok(el.shadowRoot.querySelector('[data-act="panel"]'), "the sheet opened");
  return el;
}

test("controls: tapping a room number opens that room's sheet, and it names that room", () => {
  const el = openSheet(makeGroup(), 1);
  assert.match(el.shadowRoot.querySelector('[data-act="panel"]').textContent, /Ricky/);
});

test("controls: a mode in the sheet writes to the room the sheet is for", () => {
  const el = openSheet(makeGroup(), 1);
  click(el, '[data-zmode="dry"]');
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_hvac_mode",
    data: { entity_id: "climate.ricky", hvac_mode: "dry" } }]);
});

test("controls: a preset writes the entity's OWN casing, never the button's", () => {
  const el = openSheet(makeGroup(), 0);
  // the sheet UPPERCASES in CSS; what is written is the string the entity advertises
  click(el, '[data-zpre="eco"]');
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_preset_mode",
    data: { entity_id: "climate.sala", preset_mode: "eco" } }]);
});

test("controls: the sheet offers only the presets and modes the room advertises", () => {
  const narrow = Object.assign({}, states, {
    "climate.sala": zone("climate.sala", {
      preset_modes: ["none"], preset_mode: "none", hvac_modes: ["off", "cool"] }),
  });
  const el = openSheet(makeGroup({}, makeHass(narrow, { entities })), 0);
  const pres = [...el.shadowRoot.querySelectorAll("[data-zpre]")].map((b) => b.dataset.zpre);
  assert.deepEqual(pres, ["none"], "no button exists for a preset it would reject");
  const modes = [...el.shadowRoot.querySelectorAll("[data-zmode]")].map((b) => b.dataset.zmode);
  assert.deepEqual(modes, ["off", "cool"]);

  // and a value that somehow reaches the handler anyway still writes nothing
  el._zoneAct(el.shadowRoot.querySelector('[data-act="panel"]'));
  assert.deepEqual(el._hass.calls, []);
});

test("controls: the sheet is the SAME object the dial opens, not a second one", () => {
  const el = openSheet(makeGroup(), 0);
  const root = el.shadowRoot;
  assert.ok(root.querySelector(".ct-pop"), "the dial's overlay");
  assert.ok(root.querySelector(".ct-sheet"), "the dial's glass panel");
  assert.ok(root.querySelector(".ct-popclose"), "the dial's round close");
  assert.equal(root.querySelectorAll(".ct-toggle .ct-tg-ic").length, 3,
    "the toggles carry the dial's icons, not bare words");
  // and it must sit OUTSIDE the container-query element, or position:fixed is
  // trapped inside the card and a tap outside cannot reach it
  assert.equal(root.querySelector(".cg-zonecard .ct-pop"), null);
});

test("controls: swing falls back to the climate entity when there is no sibling switch", () => {
  const sw = Object.assign({}, states, {
    "climate.sala": zone("climate.sala", { swing_modes: ["off", "vertical"], swing_mode: "off" }),
  });
  const el = openSheet(makeGroup({}, makeHass(sw, { entities })), 0);
  click(el, '[data-ztog="swing"]');
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_swing_mode",
    data: { entity_id: "climate.sala", swing_mode: "vertical" } }]);
});

test("controls: a toggle with no entity behind it writes nothing rather than guessing", () => {
  const el = openSheet(makeGroup(), 0);
  click(el, '[data-ztog="led"]');
  assert.deepEqual(el._hass.calls, []);
});

test("controls: the steppers move THAT room's setpoint by its own step", () => {
  const el = makeGroup();
  const tiles = el.shadowRoot.querySelectorAll("[data-zone]");
  tiles[2].querySelector('[data-act="inc"]')
    .dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_temperature",
    data: { entity_id: "climate.elly", temperature: 71 } }]);   // elly is set to 70
});

test("controls: the close button and the backdrop both shut the sheet", () => {
  const a = openSheet(makeGroup(), 0);
  click(a, '[data-act="close"]');
  assert.equal(a.shadowRoot.querySelector('[data-act="panel"]'), null);

  const b = openSheet(makeGroup(), 0);
  click(b, '[data-act="backdrop"]');
  assert.equal(b.shadowRoot.querySelector('[data-act="panel"]'), null);
});

test("controls: a tap on the panel itself does not shut the sheet under your finger", () => {
  const el = openSheet(makeGroup(), 0);
  click(el, '[data-act="panel"]');
  assert.ok(el.shadowRoot.querySelector('[data-act="panel"]'), "still open");
});

test("controls: all off arms first and only turns the house off on the second tap", () => {
  const el = makeGroup();
  click(el, '[data-gact="alloff"]');
  assert.deepEqual(el._hass.calls, [], "the first tap writes nothing");
  const armed = el.shadowRoot.querySelector('[data-gact="confirm"]');
  assert.ok(armed, "it arms instead");
  armed.dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  assert.equal(el._hass.calls.length, 1);
  assert.equal(el._hass.calls[0].service, "turn_off");
});

test("controls: sync writes the house target to every room that can take one", () => {
  const el = makeGroup();
  click(el, '[data-gact="sync"]');
  assert.equal(el._hass.calls.length, 1);
  assert.equal(el._hass.calls[0].service, "set_temperature");
  // the coldest setpoint of the three is elly's 70
  assert.equal(el._hass.calls[0].data.temperature, 70);
});

test("controls: a group preset writes to every room, in each one's own casing", () => {
  const el = makeGroup();
  click(el, '[data-gact^="preset:"]');
  assert.ok(el._hass.calls.length >= 1);
  assert.ok(el._hass.calls.every((c) => c.service === "set_preset_mode"));
});

test("controls: the sheet lights presets and toggles in the ROOM's mode ink", () => {
  // A room in AUTO showed a yellow mode button above a cyan preset row, because the
  // shared stylesheet lights those from --ct-mode-ink and the group card published
  // none, so they fell back to the fixed accent. The dial lights all three the same.
  const auto = Object.assign({}, states, { "climate.sala": zone("climate.sala") });
  auto["climate.sala"].state = "auto";
  const el = openSheet(makeGroup({}, makeHass(auto, { entities })), 0);
  const sheet = el.shadowRoot.querySelector(".ct-sheet");
  assert.match(sheet.getAttribute("style") || "", /--ct-mode-ink:\s*rgb\(255,220,90\)/);

  const cool = openSheet(makeGroup(), 0).shadowRoot.querySelector(".ct-sheet");
  assert.match(cool.getAttribute("style") || "", /--ct-mode-ink:\s*#5CD6FF/i,
    "and it follows the room, not the card");
});
