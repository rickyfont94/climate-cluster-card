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

test("layout: the swing chips stay clear of the numbered tick ring", () => {
  // Numerals sit on a ring of radius 160 about 300/284 and are roughly 10 units
  // tall, so anything reaching past ~150 from the centre can land on top of one.
  // The horizontal chip used to sit at x=432, reaching 163, and the 85 numeral
  // rendered inside it.
  const card = makeCard(fx.config, makeHass(fx.states, { entities: fx.entities }));
  card._build();
  const NUMERAL_RING_INNER = 150;
  for (const [name, ref] of [["swing", card._refs.swingChip], ["swingH", card._refs.swingHChip]]) {
    if (!ref) continue;
    const t = ref.getAttribute("transform");
    const [x, y] = t.replace(/[^0-9.,-]/g, "").split(",").map(Number);
    const reach = Math.hypot(x - 300, y - 284) + 28; // half the 56 wide chip
    assert.ok(reach < NUMERAL_RING_INNER,
      `${name} chip reaches ${Math.round(reach)}, numerals start at ${NUMERAL_RING_INNER}`);
  }
});

test("layout: the two swing captions do not run into each other", () => {
  // "SWING" at 352 and "SWING H" at 414 overlapped at the full caption size and
  // rendered as one run-on string. Both shrink while two axes are on show.
  const st = JSON.parse(JSON.stringify(fx.states));
  st[fx.config.entity].attributes.swing_horizontal_modes = ["off", "left", "right"];
  st[fx.config.entity].attributes.swing_horizontal_mode = "off";
  const card = makeCard(fx.config, makeHass(st, { entities: fx.entities }));
  card._build();
  card._render();

  const v = card._refs.swingCap, h = card._refs.swingHCap;
  const bothShown = h && h.style.display !== "none";
  if (!bothShown) return; // single axis, nothing to collide

  const fs = parseFloat(h.getAttribute("font-size"));
  const ls = parseFloat(h.getAttribute("letter-spacing"));
  const widthOf = (el) => {
    const n = (el.textContent || "").length;
    return n * fs * 0.62 + Math.max(0, n - 1) * ls; // this face is narrow
  };
  const vx = parseFloat(v.getAttribute("x")), hx = parseFloat(h.getAttribute("x"));
  const vRight = vx + widthOf(v) / 2;
  const hLeft = hx - widthOf(h) / 2;
  assert.ok(vRight < hLeft,
    `"${v.textContent}" ends at ${vRight.toFixed(0)} but "${h.textContent}" starts at ${hLeft.toFixed(0)}`);
});
