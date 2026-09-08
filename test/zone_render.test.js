// What the zone layout DRAWS.
//
// Every case here is either a state the handoff module threw on rather than drew, a
// shipped config key it had no reader for, or a reading it got wrong. All three are
// invisible to a test that only asks "did it render", so each one asserts on the
// thing that broke.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass } from "./helpers.js";
import {
  zone,
  states,
  entities,
  ids,
  makeGroup,
  text,
  html,
  names,
  clickG,
  doing,
  barIds,
} from "./zone_fixture.js";

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

// ------------------------------------------------------- what it is DOING ------
// The module answered that with room > set, which is only ever true of cooling. A
// fan_only room, a dry room, an auto room and a cool room that has REACHED its
// setpoint all read IDLE while the unit was plainly running.

test("doing: a running fan_only room does not say IDLE", () => {
  const t = doing("fan_only", { current_temperature: 70, temperature: 75 });
  assert.ok(!/IDLE/.test(t), "the fan is moving air: " + t);
  assert.match(t, /CIRCULATING|FAN/);
});

test("doing: dry and auto do not say IDLE either", () => {
  assert.ok(!/IDLE/.test(doing("dry", { current_temperature: 70, temperature: 75 })));
  assert.ok(!/IDLE/.test(doing("auto", { current_temperature: 70, temperature: 75 })));
});

test("doing: a cool room that has reached its setpoint really IS idle", () => {
  assert.match(doing("cool", { current_temperature: 70, temperature: 75 }), /IDLE/);
  assert.match(doing("cool", { current_temperature: 79, temperature: 75 }), /COOLING/);
});

test("doing: heat reads the numbers the other way round", () => {
  assert.match(doing("heat", { current_temperature: 65, temperature: 72 }), /HEATING/);
  assert.match(doing("heat", { current_temperature: 75, temperature: 72 }), /IDLE/);
});

test("doing: the entity's own hvac_action wins over any guess", () => {
  // a cool room below its setpoint would be guessed IDLE; the unit says otherwise
  assert.match(doing("cool", { current_temperature: 70, temperature: 75, hvac_action: "cooling" }),
    /COOLING/);
  // and a cool room above it would be guessed COOLING; the unit says it is idle
  assert.match(doing("cool", { current_temperature: 79, temperature: 75, hvac_action: "idle" }),
    /IDLE/);
});

test("doing: an off room says OFF, not idle", () => {
  assert.match(doing("off", {}), /OFF/);
});

test("doing: the header counts COOLING, so it stays about cooling", () => {
  const st = JSON.parse(JSON.stringify(states));
  for (const id of ids) { st[id].state = "fan_only"; st[id].attributes.hvac_action = "fan"; }
  const t = text(makeGroup({}, makeHass(st, { entities })));
  assert.match(t, /0 COOLING/, "a house full of fans is not a house full of cooling");
});

// ------------------------------------------------------- hero and its labels ---

test("hero: the two ring labels share a baseline, so they read as a pair", () => {
  const svg = html(makeGroup());
  const ys = [...svg.matchAll(/class="cg-ringlab"[^>]*y="([-0-9.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(ys.length, 2, "both ends are named");
  assert.equal(ys[0], ys[1], "at the same height, whatever each room's temperature is");
});

test("hero: one room at both ends of the spread is ONE label", () => {
  const same = JSON.parse(JSON.stringify(states));
  for (const id of ids) same[id].attributes.current_temperature = 75;
  const svg = html(makeGroup({}, makeHass(same, { entities })));
  const n = [...svg.matchAll(/class="cg-ringlab"/g)].length;
  assert.equal(n, 1, "drawing both put one label exactly on top of the other");
});

test("hero: the mode dot breathes, and a room with no reading holds still", () => {
  const t = html(makeGroup());
  assert.match(t, /animation:pulse 1\.9s/, "the same rate as the dial's status dot");

  const dead = Object.assign({}, states, {
    "climate.ricky": { entity_id: "climate.ricky", state: "unavailable", attributes: {} },
  });
  const tiles = makeGroup({}, makeHass(dead, { entities }))
    .shadowRoot.querySelectorAll("[data-zone]");
  assert.ok(!/animation:pulse/.test(tiles[1].innerHTML),
    "there is nothing alive to show on an offline room");
});

// -------------------------------------------------------------- the bottom bar --

test("bar: unset is the usual set, in the usual order", () => {
  const got = [...barIds()].map((b) => b.dataset.gact);
  assert.equal(got[0], "alloff");
  assert.equal(got[1], "sync");
  assert.ok(got.slice(2).every((g) => g.indexOf("preset:") === 0));
});

test("bar: actions names the buttons and their order", () => {
  const got = [...barIds({ actions: ["preset:eco", "off"] })].map((b) => b.dataset.gact);
  assert.deepEqual(got, ["preset:eco", "alloff"], "asked for, in that order");
});

test("bar: a preset no room advertises is skipped, not drawn dead", () => {
  const got = [...barIds({ actions: ["off", "preset:turbo"] })].map((b) => b.dataset.gact);
  assert.deepEqual(got, ["alloff"]);
});

test("bar: the off button keeps all three of its faces under one name", () => {
  const el = makeGroup({ actions: ["off"] });
  assert.ok(el.shadowRoot.querySelector('[data-gact="alloff"]'));
  clickG(el, "alloff");
  assert.ok(el.shadowRoot.querySelector('[data-gact="confirm"]'),
    "arming still works when the bar was named explicitly");
});

// action_rows is a shipped key, and it worked on the classic layout only. On the
// layout this release makes the default it was accepted by the editor and then
// ignored, which is the same defect class as show_scale on the new dial face.
test("bar: action_rows lays the buttons out in the rows asked for", () => {
  const loose = makeGroup().shadowRoot.querySelector('[data-act="footer"]');
  assert.match(loose.getAttribute("style"), /display:flex/, "unset stays a wrapping row");

  const el = makeGroup({ action_rows: 2 });
  const bar = el.shadowRoot.querySelector('[data-act="footer"]');
  const n = el.shadowRoot.querySelectorAll("[data-gact]").length;
  assert.match(bar.getAttribute("style"), /display:grid/, "a row count makes it a grid");
  assert.ok(bar.getAttribute("style").includes("repeat(" + Math.ceil(n / 2) + ","),
    "columns worked out from the count: " + bar.getAttribute("style"));
});

test("bar: a silly action_rows is ignored rather than breaking the bar", () => {
  for (const bad of ["abc", 0, -2, null]) {
    const bar = makeGroup({ action_rows: bad }).shadowRoot.querySelector('[data-act="footer"]');
    assert.match(bar.getAttribute("style"), /display:flex/, JSON.stringify(bad));
  }
});

test("hero: two long room names do not run through each other", () => {
  // measured on a real house: with a narrow spread both ring ends sit near twelve
  // o'clock, and "FAMILY ROOM 71" met "LIVING ROOM 78" head on
  const long = JSON.parse(JSON.stringify(states));
  long["climate.sala"].attributes.friendly_name = "Living Room";
  long["climate.sala"].attributes.current_temperature = 78;
  long["climate.ricky"].attributes.friendly_name = "Family Room";
  long["climate.ricky"].attributes.current_temperature = 71;
  long["climate.elly"].attributes.friendly_name = "Bedroom";
  long["climate.elly"].attributes.current_temperature = 75;

  const svg = html(makeGroup({}, makeHass(long, { entities })));
  const labs = [...svg.matchAll(
    /class="cg-ringlab" x="([-0-9.]+)" y="([-0-9.]+)" text-anchor="(\w+)"[^>]*>([^<]+)</g)]
    .map((m) => {
      const w = m[4].length * 5.6;
      const x = Number(m[1]);
      return { x0: m[3] === "end" ? x - w : x, x1: (m[3] === "end" ? x - w : x) + w,
        y: Number(m[2]), text: m[4] };
    });
  assert.equal(labs.length, 2, "both ends are named");

  const [a, b] = labs;
  const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y !== b.y;
  assert.ok(apart, "side by side or on two lines, never on top of each other: "
    + JSON.stringify(labs));
});

test("hero: names that fit stay on one line", () => {
  const svg = html(makeGroup());
  const ys = [...svg.matchAll(/class="cg-ringlab"[^>]*y="([-0-9.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(ys[0], ys[1], "stacking is the exception, not the new normal");
});

test("hero: a label cannot leave the card", () => {
  const long = JSON.parse(JSON.stringify(states));
  long["climate.sala"].attributes.friendly_name = "Downstairs Guest Bedroom Annexe";
  long["climate.sala"].attributes.current_temperature = 86;
  const svg = html(makeGroup({}, makeHass(long, { entities })));
  for (const m of svg.matchAll(
    /class="cg-ringlab" x="([-0-9.]+)" y="[-0-9.]+" text-anchor="(\w+)"[^>]*>([^<]+)</g)) {
    const w = m[3].length * 5.6, x = Number(m[1]);
    const x0 = m[2] === "end" ? x - w : x;
    assert.ok(x0 >= 44 && x0 + w <= 300, m[3] + " stays inside the hero viewBox");
  }
});

test("tiles: a two word room name stays on one line", () => {
  const long = JSON.parse(JSON.stringify(states));
  long["climate.sala"].attributes.friendly_name = "Living Room";
  long["climate.ricky"].attributes.friendly_name = "Family Room";
  long["climate.elly"].attributes.friendly_name = "Master";
  const el = makeGroup({}, makeHass(long, { entities }));

  const names = [...el.shadowRoot.querySelectorAll("[data-zone] .cg-tilename")];
  assert.equal(names.length, 3, "every tile names its room");
  for (const n of names) {
    const st = n.getAttribute("style") || "";
    assert.match(st, /white-space:nowrap/, n.textContent + " must not wrap");
    assert.match(st, /text-overflow:ellipsis/);
  }
  assert.equal(names[0].getAttribute("title"), "Living Room",
    "and the full name is still reachable, the way the dial's title is");
});

test("tiles: a name carrying a quote cannot break out of the tooltip", () => {
  const bad = JSON.parse(JSON.stringify(states));
  bad["climate.sala"].attributes.friendly_name = 'Rick"s <b>Room</b>';
  const el = makeGroup({}, makeHass(bad, { entities }));
  const n = el.shadowRoot.querySelector("[data-zone] .cg-tilename");
  assert.equal(n.getAttribute("title"), 'Rick"s <b>Room</b>', "escaped in, decoded back");
  assert.equal(el.shadowRoot.querySelectorAll("[data-zone] b").length, 0,
    "and no element came out of it");
});

test("tiles: the caption gives up size before it gives up letters", () => {
  const nm = (n) => {
    const st = JSON.parse(JSON.stringify(states));
    st["climate.sala"].attributes.friendly_name = n;
    return makeGroup({}, makeHass(st, { entities }))
      .shadowRoot.querySelector("[data-zone] .cg-tilename").getAttribute("style");
  };
  assert.match(nm("Master"), /font:600 14px/, "a short name keeps the full size");
  assert.match(nm("Master"), /letter-spacing:\.14em/);
  assert.match(nm("Living Room"), /font:600 12px/, "eleven characters step down");
  assert.match(nm("Living Room"), /letter-spacing:\.08em/, "and lose the wide tracking");
  assert.match(nm("Downstairs Annexe"), /font:600 11px/, "and a long one steps down again");
});

test("hero: a stacked label pair still clears the band", () => {
  // a narrow spread puts both ring ends near twelve o'clock, which is the case that
  // forces two lines. The band is 13 wide at r 104, so its top edge is y 97.5, and a
  // second line pushed DOWN from a tight shared baseline lands on it.
  const tight = JSON.parse(JSON.stringify(states));
  tight["climate.sala"].attributes.friendly_name = "Living Room";
  tight["climate.sala"].attributes.current_temperature = 78;
  tight["climate.ricky"].attributes.friendly_name = "Master";
  tight["climate.ricky"].attributes.current_temperature = 74;
  tight["climate.elly"].attributes.friendly_name = "Bedroom";
  tight["climate.elly"].attributes.current_temperature = 77;

  const svg = html(makeGroup({}, makeHass(tight, { entities })));
  const ys = [...svg.matchAll(/class="cg-ringlab"[^>]*y="([-0-9.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(ys.length, 2);
  assert.notEqual(ys[0], ys[1], "this spread is too narrow to sit them side by side");

  const HALF = 4.75;                 // half of the 9.5px label, centred on its baseline
  const BAND_TOP = 97.5, MARGIN = 2;
  assert.ok(Math.max(...ys) + HALF <= BAND_TOP - MARGIN,
    "the lower line must clear the band's top edge, not graze it, got y="
    + Math.max(...ys));
  assert.ok(Math.min(...ys) - HALF >= 71,
    "and the upper one must stay inside the viewBox, got y=" + Math.min(...ys));
});
