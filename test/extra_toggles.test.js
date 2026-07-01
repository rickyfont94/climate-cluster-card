// Extra-toggles tests (issue #34). The invariants:
//   - a two-state entity (switch / input_boolean) chip fires the matching turn_on /
//     turn_off on the RIGHT domain, targeting its own entity;
//   - a select chip fires select.select_option with a real member of the entity's own
//     `options` (the next one, wrapping);
//   - a missing / unavailable entity renders a dimmed, inert chip: no service call, no
//     broken DOM, and it never throws;
//   - none of this disturbs the built-in swing / led / sound behavior.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass, makeCard } from "./helpers.js";
import * as extra from "./fixtures/extra_toggles.js";
import * as midea from "./fixtures/midea.js";

// A card driven through the REAL build + paint path (unlike makeCard, which stubs the
// renderer). Used only where we must inspect the rendered chip DOM.
function makeLiveCard(config, hass) {
  const card = document.createElement("climate-cluster-card");
  card.setConfig(config);
  card.hass = hass;   // triggers _build + _render
  card._openPop();    // real _buildPop + _paintPop
  return card;
}

test("switch chip fires switch.turn_on for its own entity (state off -> on)", () => {
  const hass = makeHass(extra.states, { entities: extra.entities });
  const card = makeCard(extra.config, hass);

  card._xTap(0); // switch.bedroom_ac_anti_mildew, currently off

  assert.equal(hass.calls.length, 1, "exactly one service call");
  const c = hass.calls[0];
  assert.equal(c.domain, "switch", "two-state switch must use the switch domain");
  assert.equal(c.service, "turn_on", "an off switch toggles on");
  assert.equal(c.data.entity_id, "switch.bedroom_ac_anti_mildew");
});

test("input_boolean chip fires input_boolean.turn_off on its own domain (state on -> off)", () => {
  const hass = makeHass(extra.states, { entities: extra.entities });
  const card = makeCard(extra.config, hass);

  card._xTap(1); // input_boolean.bedroom_ac_uv_lamp, currently on

  assert.equal(hass.calls.length, 1, "exactly one service call");
  const c = hass.calls[0];
  assert.equal(c.domain, "input_boolean", "an input_boolean must use its own domain, not switch");
  assert.equal(c.service, "turn_off", "an on entity toggles off");
  assert.equal(c.data.entity_id, "input_boolean.bedroom_ac_uv_lamp");
});

test("select chip fires select.select_option with a REAL member of its own options (next, wrapping)", () => {
  const hass = makeHass(extra.states, { entities: extra.entities });
  const card = makeCard(extra.config, hass);

  card._xTap(2); // select.bedroom_ac_wind_mode, current "auto"

  assert.equal(hass.calls.length, 1, "exactly one service call");
  const c = hass.calls[0];
  assert.equal(c.domain, "select");
  assert.equal(c.service, "select_option");
  assert.equal(c.data.entity_id, "select.bedroom_ac_wind_mode");
  assert.ok(
    extra.WIND_OPTIONS.includes(c.data.option),
    `sent option ${JSON.stringify(c.data.option)} must be a member of ${JSON.stringify(extra.WIND_OPTIONS)}`,
  );
  assert.equal(c.data.option, "gentle", "advances to the next option after the current one");
});

test("select wraps from the last option back to the first", () => {
  const st = structuredClone(extra.states);
  st["select.bedroom_ac_wind_mode"].state = "strong"; // last option
  const hass = makeHass(st, { entities: extra.entities });
  const card = makeCard(extra.config, hass);

  card._xTap(2);

  assert.equal(hass.calls.length, 1);
  assert.equal(hass.calls[0].data.option, "auto", "wraps past the end to the first option");
});

test("missing / unavailable entity: dimmed inert chip, no service call, no throw", () => {
  const hass = makeHass(extra.states, { entities: extra.entities });

  // Write path: tapping an unavailable (idx 3) or a missing (idx 4) chip is a no-op.
  const card = makeCard(extra.config, hass);
  assert.doesNotThrow(() => { card._xTap(3); card._xTap(4); });
  assert.equal(hass.calls.length, 0, "an unavailable or missing entity must not call a service");

  // Render path: build the popup for real and inspect the rendered chips.
  let live;
  assert.doesNotThrow(() => { live = makeLiveCard(extra.config, hass); }, "building the popup must not throw");
  const chips = live._refs.sheet.querySelectorAll("button[data-xtoggle]");
  assert.equal(chips.length, 5, "one chip per configured entry (missing entities still get a chip slot)");

  const unavailable = chips[3];
  const missing = chips[4];
  for (const b of [unavailable, missing]) {
    assert.ok(b.classList.contains("disabled"), "an unresolved chip is dimmed");
    assert.equal(b.getAttribute("aria-disabled"), "true");
    assert.equal(b.getAttribute("aria-pressed"), null, "a disabled chip is not a pressed toggle");
    assert.ok(b.querySelector("ha-icon"), "the chip still has its icon element (not broken)");
    assert.ok((b.querySelector(".ct-tg-lb").textContent || "").length > 0, "still shows a readable label");
  }

  // The resolvable chips are NOT disabled, proving the dim is specific to the bad ones.
  assert.equal(chips[0].classList.contains("disabled"), false);
  assert.equal(chips[1].classList.contains("disabled"), false);
  assert.equal(chips[2].classList.contains("disabled"), false);
  // The select chip shows its current option as the label and is neutral (never lit).
  assert.equal(chips[2].querySelector(".ct-tg-lb").textContent, "auto");
  assert.equal(chips[2].classList.contains("on"), false);
  // The input_boolean carries its YAML name + icon override.
  assert.equal(chips[1].querySelector(".ct-tg-lb").textContent, "UV Lamp");
  assert.equal(chips[1].querySelector("ha-icon").getAttribute("icon"), "mdi:weather-sunny");
});

test("no extra_toggles configured = zero chips, no interference (backward compatible)", () => {
  const hass = makeHass(extra.states, { entities: extra.entities });
  const cfg = { entity: "climate.bedroom_ac" }; // no extra_toggles
  const card = makeCard(cfg, hass);
  assert.deepEqual(card._extraToggles, [], "absent -> empty list");

  const live = makeLiveCard(cfg, hass);
  const chips = live._refs.sheet.querySelectorAll("button[data-xtoggle]");
  assert.equal(chips.length, 0, "no config -> no extra chips rendered");
});

test("extra_toggles do not regress built-in switch-backed swing (Midea)", () => {
  // Same device as the swing fixture, but now ALSO carrying an extra toggle. The swing
  // chip must still drive the discovered switch exactly as before, and the extra chip
  // must still work independently.
  const cfg = Object.assign({}, midea.config, {
    extra_toggles: ["switch.midea_ac_swing_vertical"], // any two-state entity on the device
  });
  const hass = makeHass(midea.states, { entities: midea.entities });
  const card = makeCard(cfg, hass);

  card._swingToggle();
  assert.equal(hass.calls.length, 1, "swing still fires exactly one call");
  assert.equal(hass.calls[0].domain, "switch", "swing still targets the switch, not climate");
  assert.equal(hass.calls[0].data.entity_id, "switch.midea_ac_swing_vertical");
  assert.ok(
    !hass.calls.some((x) => x.domain === "climate" && x.service === "set_swing_mode"),
    "extra_toggles must not push swing onto climate.set_swing_mode",
  );

  // The extra chip toggles its own entity independently.
  card._xTap(0);
  assert.equal(hass.calls.length, 2, "the extra chip fires its own call");
  assert.equal(hass.calls[1].data.entity_id, "switch.midea_ac_swing_vertical");
});
