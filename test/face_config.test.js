// Config keys the card has always honoured have to keep working on the new face.
// Each of these shipped before the face landed, and each was silently ignored by it,
// which is invisible to every other test because they all assert on the OLD nodes.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass } from "./helpers.js";
import * as fx from "./fixtures/presets.js";

function liveCard(config, hass) {
  const card = document.createElement("climate-cluster-card");
  card.setConfig(config);
  card.hass = hass;
  return card;
}
const hass = () => makeHass(fx.states, { entities: fx.entities });

test("show_scale false empties the scale group; the default fills it", () => {
  const on = liveCard(Object.assign({}, fx.config), hass());
  assert.ok(on._refs.faceScale.innerHTML.length > 0);

  const off = liveCard(Object.assign({}, fx.config, { show_scale: false }), hass());
  assert.equal(off._refs.faceScale.innerHTML, "");
});

test("show_current false takes the room reading AND the delta with it", () => {
  const on = liveCard(Object.assign({}, fx.config), hass());
  assert.ok(on._refs.faceRoom.innerHTML.length > 0);

  const off = liveCard(Object.assign({}, fx.config, { show_current: false }), hass());
  assert.equal(off._refs.faceRoom.innerHTML, "");
  assert.equal(off._refs.faceDelta.innerHTML, "");
});

test("AUTO is the card's warm yellow, not the module's mint", () => {
  const st = {
    "climate.auto": {
      entity_id: "climate.auto", state: "auto",
      attributes: { friendly_name: "A", hvac_modes: ["off", "auto"], temperature: 75,
        current_temperature: 78, min_temp: 61, max_temp: 86 },
    },
  };
  const card = liveCard({ entity: "climate.auto" },
    makeHass(st, { entities: { "climate.auto": { entity_id: "climate.auto", device_id: "d" } } }));

  const html = card._refs.faceCenter.innerHTML;
  assert.match(html, /AUTO/);
  // rgb(255,220,90). The module ships #7CE0B0 for this mode and nothing on this
  // card is green.
  assert.match(html, /255\s*,\s*220\s*,\s*90/);
  assert.doesNotMatch(html, /7CE0B0/i);
});

test("a configured mode_colors entry reaches the face", () => {
  const card = liveCard(Object.assign({}, fx.config, { mode_colors: { cool: "#c77dff" } }), hass());
  assert.match(card._refs.faceCenter.innerHTML, /#c77dff/i);
});

test("an unset mode keeps the module's own ink, not the card palette", () => {
  const card = liveCard(Object.assign({}, fx.config), hass());
  // #5CD6FF is the module's cool. #27d3ff is the card's. Seeding every mode from
  // the card palette would repaint dry from amber to teal, which is a redesign.
  assert.match(card._refs.faceCenter.innerHTML, /5CD6FF/i);
});

// The humidity line is the fourth line of the ORIGINAL centre stack, and it sat at
// y 216 with the old numeral starting at 244. The new numeral is 104 tall on a 272
// baseline, so 216 lands inside the digits: a unit reporting humidity drew "RH 54%"
// straight across its own setpoint. It shipped that way because no fixture in this
// suite reported current_humidity, so nothing rendered the collision.
const withRh = (over) => {
  const st = JSON.parse(JSON.stringify(fx.states));
  Object.assign(st["climate.aire_sala"].attributes, { current_humidity: 54 }, over || {});
  return makeHass(st, { entities: fx.entities });
};

test("humidity: the RH line clears the new numeral and the status line", () => {
  const card = liveCard(Object.assign({}, fx.config), withRh());
  const rh = card._refs.rhCap;
  assert.notEqual(rh.style.display, "none", "the entity reports it, so it is drawn");
  const y = Number(rh.getAttribute("y"));
  assert.ok(y > 272, "below the numeral's baseline, not through the digits: " + y);
  assert.ok(y < 297, "and above the status line: " + y);
});

test("humidity: heat_cool keeps the original face, so RH goes back where it was", () => {
  // starts on the new face, where the line above has just proved it moves
  const card = liveCard(Object.assign({}, fx.config), withRh());
  assert.equal(Number(card._refs.rhCap.getAttribute("y")), 288);

  const st = JSON.parse(JSON.stringify(fx.states));
  st["climate.aire_sala"].state = "heat_cool";
  Object.assign(st["climate.aire_sala"].attributes, {
    current_humidity: 54, target_temp_low: 68, target_temp_high: 76, temperature: null,
  });
  card.hass = makeHass(st, { entities: fx.entities });
  assert.equal(Number(card._refs.rhCap.getAttribute("y")), 216,
    "the original stack has its own room for it");
});
