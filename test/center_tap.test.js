// Tapping the big number opens the mode sheet.
//
// The centre disc is r62, 124 across in face units. The numeral is 104pt and renders
// 117 by 125, so its box is BIGGER than the disc and every corner of the digits falls
// outside it. Measured in a real browser against the shipped build: five of six points
// on "74" landed on the <text> node, which carries no handler and does not let the
// event through, so the biggest thing on the card was dead everywhere except its exact
// middle. Widening the disc is not the fix, it was cut to r62 precisely so it would
// stop swallowing the rail cells and the steppers.
//
// The hit test itself cannot be reproduced here (happy-dom lays nothing out), so what
// these lock is the routing: the numeral is findable, it answers as the centre, and
// both the pointer path and the touch path send it to the same handler as the disc.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass } from "./helpers.js";
import * as fx from "./fixtures/presets.js";

const liveCard = (extra) => {
  const card = document.createElement("climate-cluster-card");
  card.setConfig(Object.assign({}, fx.config, extra || {}));
  card.hass = makeHass(fx.states, { entities: fx.entities });
  return card;
};
const bigOf = (c) => c._refs.faceCenter.querySelector(".ct-face-big");

test("centre tap: the numeral is findable by name, not by counting siblings", () => {
  const c = liveCard();
  const big = bigOf(c);
  assert.ok(big, "the face has to be able to point at its own hero number");
  assert.equal(big.textContent, "72", "and it is the setpoint, not the mode word");
});

test("centre tap: the numeral answers as the centre, the rail does not", () => {
  const c = liveCard();
  assert.ok(c._isCenterTarget(bigOf(c)), "the number is part of the centre target");
  assert.ok(c._isCenterTarget(c._refs.centerHit), "and so is the disc under it");

  const cell = c._refs.faceRail.querySelector("[data-cell]");
  assert.ok(cell, "the fixture draws a rail");
  assert.ok(!c._isCenterTarget(cell), "a rail cell is its own control, not the centre");
  assert.ok(!c._isCenterTarget(null));
});

test("centre tap: a press on the numeral routes to the centre handler", () => {
  const c = liveCard();
  const big = bigOf(c);
  let seen;
  c._centerPointerDown = (e) => { seen = e.target; };

  big.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
  assert.equal(seen, big, "so hold and double-tap behave the same wherever you press");
});

test("centre tap: a press on the rail does NOT route to the centre handler", () => {
  const c = liveCard();
  let seen = null;
  c._centerPointerDown = (e) => { seen = e.target; };

  c._refs.faceRail.querySelector("[data-cell]")
    .dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
  assert.equal(seen, null, "the disc was cut down to stop doing exactly this");
});

test("centre tap: touch takes the numeral too, which is the wall tablet path", () => {
  const c = liveCard();
  const big = bigOf(c);
  c._onSvgTouchStart({ stopPropagation() {}, target: big,
    touches: [{ clientX: 100, clientY: 100 }] });
  assert.ok(c._touchOnCenter, "touchend opens the sheet from this flag");

  c._onSvgTouchStart({ stopPropagation() {}, target: c._refs.faceRail,
    touches: [{ clientX: 100, clientY: 100 }] });
  assert.ok(!c._touchOnCenter, "and everything else still goes its own way");
});

test("centre tap: the hero fit reads the same node", () => {
  // _fitHero used to take querySelectorAll("text")[1], which is one reordering of
  // the centre stack away from shrinking the status word instead of the number
  const c = liveCard();
  const big = bigOf(c);
  big.getBBox = () => ({ x: 0, y: 0, width: 400, height: 100 });
  c._fitHero();
  assert.ok(Number(big.getAttribute("font-size")) < 104,
    "an overwide numeral is the one that gets shrunk");
});
