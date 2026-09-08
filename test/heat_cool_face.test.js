// heat_cool keeps the ORIGINAL face.
//
// The handoff geometry draws one setpoint, one pin and one hero number. Pointed at a
// low/high pair it has nothing to say, and what it actually did was fall back to the
// range MINIMUM and paint that as the setpoint: a dual thermostat set to 68-74 read
// "45". The pair vanished with it. So the new face is switched off for this mode and
// the shipped dual-setpoint drawing keeps the state, until the module grows a dual
// setpoint of its own.
//
// The runtime flip is the part worth guarding: a card that renders single-setpoint
// first has already switched the original face off, so entering heat_cool has to put
// it back, and leaving heat_cool has to take it away again.
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

// A state object for the same entity id, so one card can be walked between modes.
function dual(state, attrs) {
  return {
    "climate.dual": {
      entity_id: "climate.dual",
      state,
      attributes: Object.assign({}, fx.heatCoolStates["climate.dual"].attributes, attrs),
    },
  };
}

test("heat_cool: the handoff face is off and the original face is drawn", () => {
  const hass = makeHass(fx.heatCoolStates, { entities: fx.heatCoolEntities });
  const card = liveCard(fx.heatCoolConfig, hass);

  assert.equal(card._faceOn, false);
  assert.equal(card._refs.face.style.display, "none");
  assert.notEqual(card._refs.bigNum.style.display, "none");
  assert.notEqual(card._refs.coldFill.style.display, "none");
});

test("heat_cool: the hero carries BOTH setpoints, not the range minimum", () => {
  const hass = makeHass(fx.heatCoolStates, { entities: fx.heatCoolEntities });
  const card = liveCard(fx.heatCoolConfig, hass);

  const hero = card._refs.bigNum.textContent;
  assert.match(hero, /68/);
  assert.match(hero, /74/);
  // 45 is min_temp. It reaching the hero is the exact regression this guards.
  assert.doesNotMatch(hero, /45/);
});

test("single setpoint -> heat_cool -> single setpoint restores the right face each time", () => {
  const hass = makeHass(dual("cool", { temperature: 72 }), { entities: fx.heatCoolEntities });
  const card = liveCard(fx.heatCoolConfig, hass);

  // single setpoint: the handoff face is on and the original one is switched off
  assert.equal(card._faceOn, true);
  assert.equal(card._refs.face.style.display, "");
  assert.equal(card._refs.bigNum.style.display, "none");

  // into heat_cool: the original face comes back
  card.hass = makeHass(dual("heat_cool", { temperature: null }), { entities: fx.heatCoolEntities });
  assert.equal(card._faceOn, false);
  assert.equal(card._refs.face.style.display, "none");
  assert.notEqual(card._refs.bigNum.style.display, "none");
  assert.notEqual(card._refs.coldFill.style.display, "none");

  // and back out again
  card.hass = makeHass(dual("cool", { temperature: 72 }), { entities: fx.heatCoolEntities });
  assert.equal(card._faceOn, true);
  assert.equal(card._refs.face.style.display, "");
  assert.equal(card._refs.bigNum.style.display, "none");
});
