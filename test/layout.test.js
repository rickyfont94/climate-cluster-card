// Geometry guards for the dial face. The arc is a 220 degree band from 250 degrees
// at radius 200 about 300/284, so its two lower tips sit at y = 352.4. Anything
// painted below that line reads as falling out of the instrument, which is exactly
// what the fan cluster and the chip captions were doing.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass, makeCard } from "./helpers.js";
import * as fx from "./fixtures/presets.js";

const ARC_TIP_Y = 352.4;

// Every element that lives on the lower shelf, with the extra depth its own glyphs
// add below the anchor point (half a box for shapes, a descender for text).
function lowerShelf(card) {
  const svg = card._refs;
  const out = [];
  const push = (name, el, extra) => {
    if (!el) return;
    const t = el.getAttribute("transform");
    const y = t ? parseFloat(t.split(",")[1]) : parseFloat(el.getAttribute("y"));
    if (Number.isFinite(y)) out.push({ name, bottom: y + extra });
  };
  push("clover", svg.clover, 16);              // glyph radius
  push("fanPct", svg.fanPct, 6);               // 22px text descender
  push("fanName", svg.fanName, 4);             // 12px text descender
  push("swingChip", svg.swingChip, 22);        // half the 44 tall chip
  push("swingHChip", svg.swingHChip, 22);
  push("swingCap", svg.swingCap, 4);
  push("swingHCap", svg.swingHCap, 4);
  return out;
}

test("layout: nothing on the lower shelf falls below the arc tips", () => {
  const card = makeCard(fx.config, makeHass(fx.states, { entities: fx.entities }));
  card._build();
  const offenders = lowerShelf(card).filter((e) => e.bottom > ARC_TIP_Y);
  assert.deepEqual(offenders, [],
    "these paint below y=" + ARC_TIP_Y + ": " + JSON.stringify(offenders));
});

test("layout: the setpoint numeral clears the chip row", () => {
  const card = makeCard(fx.config, makeHass(fx.states, { entities: fx.entities }));
  card._build();
  const bigY = parseFloat(card._refs.bigNum.getAttribute("y"));
  const bigFont = parseFloat(card._refs.bigNum.getAttribute("font-size"));
  const bigBottom = bigY + bigFont / 2; // dominant-baseline is central
  const chipY = parseFloat(card._refs.swingChip.getAttribute("transform").split(",")[1]);
  const chipTop = chipY - 22;
  assert.ok(bigBottom <= chipTop,
    `numeral reaches ${bigBottom} but the chip row starts at ${chipTop}`);
});

test("layout: the fan cluster sits inboard of the numeral, never overlapping it", () => {
  const card = makeCard(fx.config, makeHass(fx.states, { entities: fx.entities }));
  card._build();
  const cloverX = parseFloat(card._refs.clover.getAttribute("transform").split("(")[1]);
  const bigFont = parseFloat(card._refs.bigNum.getAttribute("font-size"));
  // a two digit numeral is roughly 1.1 glyph widths per digit at this face
  const halfNum = bigFont * 0.55;
  assert.ok(cloverX + 16 < 300 - halfNum,
    `clover right edge ${cloverX + 16} runs into the numeral starting at ${300 - halfNum}`);
});
