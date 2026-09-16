// Shared fixture for the zone-layout suites.
//
// Three rooms with different readings and a full set of advertised capabilities, so
// a test can assert on what a room offers as well as on what it draws. Everything
// here is inert: no test lives in this file, and nothing mutates the shared objects
// (the ones that need a variant deep-copy it first).
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
    swing_modes: ["off", "vertical"], swing_mode: "off",
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

function makeEditor(config) {
  const ed = document.createElement("climate-cluster-group-card-editor");
  ed.setConfig(config);
  ed.hass = makeHass(states, { entities });
  return ed;
}
const names = (rows) => rows.flatMap((r) => r.schema ? r.schema.map((x) => x.name) : [r.name]);

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


const offStates = (over) => {
  const st = {};
  for (const id of ids) {
    st[id] = { entity_id: id, state: "off", attributes: Object.assign({
      friendly_name: "Aire " + id.split(".")[1],
      hvac_modes: ["off", "cool", "heat"],
      current_temperature: 76, temperature: 74, min_temp: 61, max_temp: 86,
    }, over || {}) };
  }
  return st;
};
const clickG = (el, act) => {
  const n = el.shadowRoot.querySelector('[data-gact="' + act + '"]');
  assert.ok(n, "no button for " + act);
  n.dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  return el;
};


const doing = (mode, over) => {
  const st = JSON.parse(JSON.stringify(states));
  st["climate.sala"].state = mode;
  Object.assign(st["climate.sala"].attributes, over || {});
  const el = makeGroup({}, makeHass(st, { entities }));
  const tile = el.shadowRoot.querySelectorAll("[data-zone]")[0];
  return tile.textContent;
};


const barIds = (cfg, st) => makeGroup(cfg, st)
  .shadowRoot.querySelectorAll("[data-gact]");

export {
  zone,
  states,
  entities,
  ids,
  makeGroup,
  text,
  html,
  makeEditor,
  names,
  click,
  openSheet,
  offStates,
  clickG,
  doing,
  barIds,
};
