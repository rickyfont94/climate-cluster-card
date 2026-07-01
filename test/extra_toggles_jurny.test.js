// Extra-toggles regression fixture (issue #34) locking a real user's Tuya Local AC
// shape: three vendor switches (anti-mould, UV sterilization, evaporator cleaning) and
// one "smart wind" select, all added through extra_toggles. This guards that the same
// invariants the synthetic extra_toggles tests assert also hold for the exact entity
// mix a real device advertises:
//   - each switch chip fires the matching turn_on / turn_off on the switch domain,
//     targeting its own entity_id;
//   - the select chip fires select.select_option with a real member of the entity's own
//     options (the next one, wrapping);
//   - both the bare-string and the {entity, name, icon} config forms normalize and work;
//   - the select renders as a neutral cycle chip and the switches render as toggle chips.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass, makeCard } from "./helpers.js";
import * as jurny from "./fixtures/extra_toggles_jurny.js";

// A card driven through the REAL build + paint path (unlike makeCard, which stubs the
// renderer). Used only where we must inspect the rendered chip DOM.
function makeLiveCard(config, hass) {
  const card = document.createElement("climate-cluster-card");
  card.setConfig(config);
  card.hass = hass;   // triggers _build + _render
  card._openPop();    // real _buildPop + _paintPop
  return card;
}

test("bare-string form: all 4 entities normalize in order with no name/icon override", () => {
  const hass = makeHass(jurny.states, { entities: jurny.entities });
  const card = makeCard(jurny.config, hass);

  assert.deepEqual(card._extraToggles, [
    { entity: "switch.salon_anti_mould", name: null, icon: null },
    { entity: "select.salon_smart_wind", name: null, icon: null },
    { entity: "switch.salon_uv_sterilization", name: null, icon: null },
    { entity: "switch.salon_evaporator_cleaning", name: null, icon: null },
  ]);
});

test("object form: {entity, name, icon} normalizes with overrides and same order", () => {
  const hass = makeHass(jurny.states, { entities: jurny.entities });
  const card = makeCard(jurny.configObjects, hass);

  assert.deepEqual(card._extraToggles, [
    { entity: "switch.salon_anti_mould", name: "Anti Mould", icon: "mdi:spray-bottle" },
    { entity: "select.salon_smart_wind", name: "Smart Wind", icon: null },
    { entity: "switch.salon_uv_sterilization", name: null, icon: null },
    { entity: "switch.salon_evaporator_cleaning", name: null, icon: null },
  ]);
});

test("all 4 render as chips: the select is a neutral cycle chip, the 3 switches are toggle chips", () => {
  const hass = makeHass(jurny.states, { entities: jurny.entities });
  const live = makeLiveCard(jurny.config, hass);

  const chips = live._refs.sheet.querySelectorAll("button[data-xtoggle]");
  assert.equal(chips.length, 4, "one chip per configured entry");

  // None of these entities is missing/unavailable, so no chip is dimmed.
  for (const b of chips) {
    assert.equal(b.classList.contains("disabled"), false);
    assert.ok(b.querySelector("ha-icon"), "chip keeps its icon element");
    assert.ok((b.querySelector(".ct-tg-lb").textContent || "").length > 0, "chip shows a readable label");
  }

  // Select chip (idx 1): shows its current option as the label, never lit, and is not a
  // pressed toggle (aria-pressed is removed for a cycle chip).
  const sel = chips[1];
  assert.equal(sel.querySelector(".ct-tg-lb").textContent, "off", "select label is the current option");
  assert.equal(sel.classList.contains("on"), false, "a select chip is never lit");
  assert.equal(sel.getAttribute("aria-pressed"), null, "a cycle chip is not a pressed toggle");

  // Switch chips (idx 0, 2, 3): each is a two-state toggle, so it carries aria-pressed.
  for (const i of [0, 2, 3]) {
    assert.equal(chips[i].getAttribute("aria-pressed") != null, true, `chip ${i} is a pressed toggle`);
  }
  // uv_sterilization is on -> lit; anti_mould and evaporator_cleaning are off -> not lit.
  assert.equal(chips[2].classList.contains("on"), true, "an on switch chip is lit");
  assert.equal(chips[2].getAttribute("aria-pressed"), "true");
  assert.equal(chips[0].classList.contains("on"), false, "an off switch chip is not lit");
  assert.equal(chips[0].getAttribute("aria-pressed"), "false");
});

test("switch chip fires switch.turn_on for its own entity (anti_mould, off -> on)", () => {
  const hass = makeHass(jurny.states, { entities: jurny.entities });
  const card = makeCard(jurny.config, hass);

  card._xTap(0); // switch.salon_anti_mould, currently off

  assert.equal(hass.calls.length, 1, "exactly one service call");
  const c = hass.calls[0];
  assert.equal(c.domain, "switch", "a two-state switch must use the switch domain");
  assert.equal(c.service, "turn_on", "an off switch toggles on");
  assert.equal(c.data.entity_id, "switch.salon_anti_mould");
});

test("switch chip fires switch.turn_off for its own entity (uv_sterilization, on -> off)", () => {
  const hass = makeHass(jurny.states, { entities: jurny.entities });
  const card = makeCard(jurny.config, hass);

  card._xTap(2); // switch.salon_uv_sterilization, currently on

  assert.equal(hass.calls.length, 1, "exactly one service call");
  const c = hass.calls[0];
  assert.equal(c.domain, "switch");
  assert.equal(c.service, "turn_off", "an on switch toggles off");
  assert.equal(c.data.entity_id, "switch.salon_uv_sterilization");
});

test("select chip fires select.select_option with a REAL member of its own options (next, wrapping)", () => {
  const hass = makeHass(jurny.states, { entities: jurny.entities });
  const card = makeCard(jurny.config, hass);

  card._xTap(1); // select.salon_smart_wind, current "off"

  assert.equal(hass.calls.length, 1, "exactly one service call");
  const c = hass.calls[0];
  assert.equal(c.domain, "select");
  assert.equal(c.service, "select_option");
  assert.equal(c.data.entity_id, "select.salon_smart_wind");
  assert.ok(
    jurny.SMART_WIND_OPTIONS.includes(c.data.option),
    `sent option ${JSON.stringify(c.data.option)} must be a member of ${JSON.stringify(jurny.SMART_WIND_OPTIONS)}`,
  );
  assert.equal(c.data.option, "gentle", "advances to the next option after the current one");
});

test("select wraps from the last option back to the first", () => {
  const st = structuredClone(jurny.states);
  st["select.salon_smart_wind"].state = "strong"; // last option
  const hass = makeHass(st, { entities: jurny.entities });
  const card = makeCard(jurny.config, hass);

  card._xTap(1);

  assert.equal(hass.calls.length, 1);
  assert.equal(hass.calls[0].data.option, "off", "wraps past the end to the first option");
});

test("object form operates identically: overridden switch still fires switch.turn_on on its own entity", () => {
  const hass = makeHass(jurny.states, { entities: jurny.entities });
  const card = makeCard(jurny.configObjects, hass);

  card._xTap(0); // {entity: switch.salon_anti_mould, name, icon}, currently off

  assert.equal(hass.calls.length, 1, "exactly one service call");
  const c = hass.calls[0];
  assert.equal(c.domain, "switch");
  assert.equal(c.service, "turn_on");
  assert.equal(c.data.entity_id, "switch.salon_anti_mould", "override does not change the target entity");
});

// Regression for the reported bug: a Tuya "smart wind" select that has options but no
// option chosen yet idles at state "unknown". It must NOT render dimmed/inert; it stays a
// live cycle chip whose tap picks the first option. (A truly unavailable select stays inert.)
test("BUG #34: an unknown-state select stays clickable (not dimmed) and shows its name", () => {
  const st = structuredClone(jurny.states);
  st["select.salon_smart_wind"].state = "unknown";
  const hass = makeHass(st, { entities: jurny.entities });
  const live = makeLiveCard(jurny.config, hass);

  const sel = live._refs.sheet.querySelectorAll("button[data-xtoggle]")[1];
  assert.equal(sel.classList.contains("disabled"), false, "a select with options must not be dimmed just because its state is unknown");
  assert.equal(sel.getAttribute("aria-disabled"), "false");
  const label = sel.querySelector(".ct-tg-lb").textContent;
  assert.equal(label, "Salon Smart Wind", "an unchosen select shows its name, not the word 'unknown'");
  assert.notEqual(label.toLowerCase(), "unknown");
});

test("BUG #34: tapping an unknown-state select picks the first real option", () => {
  const st = structuredClone(jurny.states);
  st["select.salon_smart_wind"].state = "unknown";
  const hass = makeHass(st, { entities: jurny.entities });
  const card = makeCard(jurny.config, hass);

  card._xTap(1);

  assert.equal(hass.calls.length, 1, "an unknown-state select must still act on tap");
  const c = hass.calls[0];
  assert.equal(c.domain, "select");
  assert.equal(c.service, "select_option");
  assert.equal(c.data.entity_id, "select.salon_smart_wind");
  assert.equal(c.data.option, jurny.SMART_WIND_OPTIONS[0], "picks the first option when none is currently selected");
});

test("a genuinely unavailable select stays disabled and inert (fires nothing on tap)", () => {
  const st = structuredClone(jurny.states);
  st["select.salon_smart_wind"].state = "unavailable";
  const hass = makeHass(st, { entities: jurny.entities });
  const live = makeLiveCard(jurny.config, hass);
  const sel = live._refs.sheet.querySelectorAll("button[data-xtoggle]")[1];
  assert.equal(sel.classList.contains("disabled"), true, "an unavailable entity must render disabled");

  const card = makeCard(jurny.config, makeHass(st, { entities: jurny.entities }));
  card._xTap(1);
  assert.equal(card._hass.calls.length, 0, "an unavailable select must not fire a service call");
});
