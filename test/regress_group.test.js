// Regressions for the group card, one test per defect that shipped.
//
// Every one of these fails against the code as it was: the geometry sweep wrote the
// house its coldest value at the hottest point of the gauge, the house actions spoke
// to entities that no longer exist, a single house number was out of range for half
// the rooms it was sent to, a tile stepper walked a narrow room past its own ceiling,
// temperature_unit converted nothing, the dirty check could not see a rename or a
// changed range, the open sheet followed a SLOT rather than a room, the confirm stayed
// armed, the default footer printed English to a Spanish reader, and a three-speed fan
// drew medium and high identically.
//
// These drive rendered elements and assert on service payloads, the same as
// zone_controls.test.js. test/swing.test.js owns the group swing resolver; nothing
// here repeats it.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { makeHass } from "./helpers.js";
import { states, entities, ids, makeGroup, openSheet, clickG, click } from "./zone_fixture.js";

// A copy of the shared fixture that a test may mutate freely.
const copy = () => JSON.parse(JSON.stringify(states));

// The one tile button, by room index, pressed the way a finger presses it.
const press = (el, i, act) => {
  const btn = el.shadowRoot.querySelectorAll("[data-zone]")[i].querySelector('[data-act="' + act + '"]');
  assert.ok(btn, "room " + i + " draws a " + act + " button");
  btn.dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  return el;
};

// ------------------------------------------------------- 14. house drag angle ---
// The hero arc runs 250 degrees clockwise through 360 to 470, and the 110..250 wedge
// underneath it is not drawn. It is still part of the hit-testable band, so a finger
// that slides off either cap lands in it. The wrap was at 110, which folded the WHOLE
// wedge onto the cold side of the scale: a drag to the hottest point of the gauge
// resolved to the house's coldest temperature and then wrote it to every room.
//
// happy-dom lays nothing out, so the element is given a box that matches its own
// viewBox one for one. What is read back is then the card's real geometry.
function houseProbe(el) {
  const svg = el._inner.querySelector(".cg-zonecard-body > svg");
  assert.ok(svg, "the hero svg is drawn");
  const vb = svg.viewBox.baseVal;
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: vb.width, height: vb.height,
    right: vb.width, bottom: vb.height });
  // 0 at twelve o'clock, clockwise, which is the convention _houseTempAt reads back
  return (deg, r) => {
    const rad = r == null ? 104 : r;
    const x = rad * Math.sin(deg * Math.PI / 180);
    const y = -rad * Math.cos(deg * Math.PI / 180);
    return el._houseTempAt({ clientX: x + 168 - vb.x, clientY: y + 208 - vb.y });
  };
}

test("house angle: an angle just past the hot cap reads HOT, not the coldest value", () => {
  const el = makeGroup();
  const at = houseProbe(el);
  const { lo, hi } = el._range();

  assert.equal(at(250), lo, "the cold cap itself");
  assert.equal(at(110), hi, "the hot cap itself");
  // 115 and 179 are in the undrawn wedge, on the HOT side of the gap's midpoint
  assert.equal(at(115), hi, "five degrees past the hot cap is still the hot end");
  assert.equal(at(179), hi, "and so is anything up to the middle of the gap");
  // 181 and 245 are the same wedge on the COLD side, which always did resolve cold
  assert.equal(at(181), lo, "past the middle it belongs to the cold end");
  assert.equal(at(245), lo, "right up against the cold cap");
});

test("house angle: the drawn band never goes backwards as it sweeps", () => {
  // The wrap decides which end each dead angle joins; this asserts it left the arc
  // itself alone, so a slow drag still reads as one continuous climb.
  const el = makeGroup();
  const at = houseProbe(el);
  const seen = [];
  for (let deg = 250; deg <= 470; deg += 5) seen.push(at(deg % 360));
  const { lo, hi } = el._range();
  assert.equal(seen[0], lo);
  assert.equal(seen[seen.length - 1], hi);
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i] >= seen[i - 1],
      "angle " + (250 + i * 5) + " read " + seen[i] + " after " + seen[i - 1]);
  }
});

// ------------------------------------------------------- 15. reachable rooms ----
// this._zones is what the CONFIG names, which is not the same as what exists. A
// renamed or deleted entity stayed in the config and was still being addressed, and
// an unavailable room cannot act. Neither produced a visible error, so the card
// looked like it had turned the whole house off while part of it was never told.

test("reach: a house action skips an entity that is not in hass.states at all", () => {
  const el = makeGroup({ entities: ids.concat(["climate.ghost"]) });
  assert.deepEqual(el._reachableIds(), ids, "the ghost is not addressed");
  clickG(el, "alloff");
  click(el, '[data-gact="confirm"]');
  assert.equal(el._hass.calls.length, 1);
  assert.deepEqual(el._hass.calls[0].data.entity_id, ids);
});

test("reach: unavailable and unknown rooms are dropped from every house action", () => {
  const st = copy();
  st["climate.ricky"].state = "unavailable";
  st["climate.elly"].state = "unknown";
  const el = makeGroup({}, makeHass(st, { entities }));
  assert.deepEqual(el._reachableIds(), ["climate.sala"]);

  el._groupAction("preset", "eco");
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_preset_mode",
    data: { entity_id: ["climate.sala"], preset_mode: "eco" } }]);
});

// -------------------------------------------------- 16. per-room house setpoint --
// One number was sent to every eligible room at once. A 64..76 room and a 61..86 room
// have no legal value in common, so a house-level write was out of range for at least
// one of them and the gauge could not produce one that was not.

test("setpoint: a mixed-bounds house gets one call per distinct clamped value", () => {
  const st = copy();
  st["climate.ricky"].attributes.min_temp = 64;
  st["climate.ricky"].attributes.max_temp = 76;
  const el = makeGroup({}, makeHass(st, { entities }));

  el._groupAction("setpoint", "82");
  assert.equal(el._hass.calls.length, 2, "82 is legal for two rooms and impossible for the third");
  for (const c of el._hass.calls) {
    assert.equal(c.service, "set_temperature");
    for (const id of c.data.entity_id) {
      const a = st[id].attributes;
      assert.ok(c.data.temperature >= a.min_temp && c.data.temperature <= a.max_temp,
        id + " was sent " + c.data.temperature + ", outside its own "
          + a.min_temp + ".." + a.max_temp);
    }
  }
  const narrow = el._hass.calls.find((c) => c.data.entity_id.includes("climate.ricky"));
  assert.equal(narrow.data.temperature, 76, "the narrow room gets the closest value it can hold");
  assert.deepEqual(narrow.data.entity_id, ["climate.ricky"]);
});

test("setpoint: a house where every room shares a range still costs exactly one call", () => {
  const el = makeGroup();
  el._groupAction("setpoint", "72");
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_temperature",
    data: { entity_id: ids, temperature: 72 } }], "no per-room fan-out where none is needed");
});

test("setpoint: the value is snapped to each room's OWN step before it is sent", () => {
  const st = copy();
  st["climate.sala"].attributes.target_temp_step = 2;   // holds only even degrees
  const el = makeGroup({}, makeHass(st, { entities }));

  el._groupAction("setpoint", "73");
  const coarse = el._hass.calls.find((c) => c.data.entity_id.includes("climate.sala"));
  assert.equal(coarse.data.temperature, 74, "73 is not a stop this unit has");
  const rest = el._hass.calls.find((c) => c.data.entity_id.includes("climate.elly"));
  assert.equal(rest.data.temperature, 73, "and the rooms that can hold 73 still get 73");
});

// ------------------------------------------------------ 17. tile stepper rails ---
// The steppers clamped to _range(), which is the WIDEST range any room in the house
// advertises. On a house with one narrow unit that walked it up to a temperature it
// can never reach, and painted the tile optimistically on the way, so the number sat
// there being wrong until the entity reported back.

test("tile: plus at the room's own max_temp writes nothing and paints nothing", () => {
  const st = copy();
  st["climate.ricky"].attributes.min_temp = 64;
  st["climate.ricky"].attributes.max_temp = 76;
  st["climate.ricky"].attributes.temperature = 76;   // already on its own ceiling
  const el = makeGroup({}, makeHass(st, { entities }));
  assert.equal(el._range().hi, 86, "the HOUSE still spans to 86, which is the trap");

  press(el, 1, "inc");
  assert.deepEqual(el._hass.calls, [], "no doomed write");
  assert.ok(!el._zoneOpt || el._zoneOpt["climate.ricky"] == null,
    "and no optimistic hold showing a temperature the room can never reach");
});

test("tile: minus at the room's own min_temp is a no-op too", () => {
  const st = copy();
  st["climate.elly"].attributes.min_temp = 68;
  st["climate.elly"].attributes.temperature = 68;
  const el = makeGroup({}, makeHass(st, { entities }));
  assert.equal(el._range().lo, 61, "the house floor is lower, and used to be what was clamped to");

  press(el, 2, "dec");
  assert.deepEqual(el._hass.calls, []);
  assert.ok(!el._zoneOpt || el._zoneOpt["climate.elly"] == null);
});

test("tile: a room short of its own rail still moves", () => {
  // the guard above must not be a blanket refusal, so pair it with the ordinary case
  const st = copy();
  st["climate.ricky"].attributes.min_temp = 64;
  st["climate.ricky"].attributes.max_temp = 76;
  st["climate.ricky"].attributes.temperature = 74;
  const el = makeGroup({}, makeHass(st, { entities }));
  press(el, 1, "inc");
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_temperature",
    data: { entity_id: "climate.ricky", temperature: 75 } }]);
});

test("tile: a heat_cool room moves its BAND, it never invents a single temperature", () => {
  // z.set on a heat_cool room is the midpoint this card computes for the gauge, not a
  // number the room ever reported. Sending it back as `temperature` collapsed a 68 to
  // 74 band onto one value, on an entity that advertises no single setpoint at all.
  const st = copy();
  const sala = st["climate.sala"];
  sala.state = "heat_cool";
  sala.attributes.hvac_modes = ["off", "heat_cool"];
  sala.attributes.temperature = null;
  sala.attributes.target_temp_low = 68;
  sala.attributes.target_temp_high = 74;
  const el = makeGroup({}, makeHass(st, { entities }));

  press(el, 0, "inc");
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_temperature",
    data: { entity_id: "climate.sala", target_temp_low: 69, target_temp_high: 75 } }]);
  assert.ok(!("temperature" in el._hass.calls[0].data), "never a midpoint the room did not set");
});

// ------------------------------------------------------- 18. temperature_unit ----
// The option was offered in this card's editor and reached exactly one line, the
// fallback bounds inside _range. Choosing Fahrenheit on a Celsius house relabelled
// nothing, converted nothing, and wrote nothing differently.

test("unit: an override converts the model, the gauge scale and the payload", () => {
  // the fixture house is Fahrenheit; ask the card to draw it in Celsius
  const el = makeGroup({ temperature_unit: "C" });
  assert.deepEqual(el._range(), { lo: 16, hi: 30 }, "the scale is the rooms' own 61..86 in C");

  const model = el._zoneModel();
  assert.equal(model.zones[2].set, 21, "elly is set to 70F");
  assert.equal(model.zones[2].room, 22, "and reads 71F");

  press(el, 2, "inc");
  assert.equal(el._hass.calls.length, 1);
  const sent = el._hass.calls[0].data.temperature;
  assert.notEqual(sent, 22, "the display number must never leave as though it were native");
  assert.ok(Math.abs(sent - (22 * 9 / 5 + 32)) < 0.01, "22C has to leave as F, got " + sent);
});

test("unit: with no override both converters are the identity, byte for byte", () => {
  const el = makeGroup();
  assert.equal(el._toDisplay(74), 74);
  assert.equal(el._toHa(74), 74);
  assert.equal(el._toDisplay(74.3), 74.3, "no rounding creeps into a house that never set the option");
  assert.equal(el._toHa(74.3), 74.3);
  assert.deepEqual(el._range(), { lo: 61, hi: 86 });

  press(el, 2, "inc");
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_temperature",
    data: { entity_id: "climate.elly", temperature: 71 } }], "exactly what it always sent");
});

// ------------------------------------------------------------- 19. signature -----
// The tiles read the name, the room's own bounds and each capability list, and none
// of them were in the dirty check. A rename, a changed min/max and a fan_modes list
// that grew a stop were all computed correctly and then never painted, until some
// unrelated temperature push happened along and revealed all three at once.

test("signature: a rename, a changed range and a changed capability list all repaint", () => {
  const base = makeGroup()._sig;
  const bumped = (mut) => {
    const st = copy();
    mut(st["climate.sala"].attributes);
    return makeGroup({}, makeHass(st, { entities }))._sig;
  };
  const cases = {
    friendly_name: (a) => { a.friendly_name = "Sala Grande"; },
    min_temp: (a) => { a.min_temp = 55; },
    max_temp: (a) => { a.max_temp = 90; },
    fan_modes: (a) => { a.fan_modes = ["auto", "low"]; },
    hvac_modes: (a) => { a.hvac_modes = ["off", "cool"]; },
    preset_modes: (a) => { a.preset_modes = ["none", "eco"]; },
  };
  for (const k of Object.keys(cases)) {
    assert.notEqual(bumped(cases[k]), base, k + " changed and the card would not have repainted");
  }
});

// -------------------------------------------------------- 20. the open sheet -----
// The sheet was remembered as an index into the zone array, so re-ordering
// config.entities, or removing a room above the open one, silently re-pointed the
// panel at whoever inherited the slot: the title changed under the reader and the
// next tap inside it wrote to a different room.

test("sheet: it follows its ROOM across a re-order of config.entities", () => {
  const el = openSheet(makeGroup(), 1);                     // Ricky, at slot 1
  assert.match(el.shadowRoot.querySelector(".ct-poptitle").textContent, /Ricky/);

  el.setConfig({ entities: ["climate.ricky", "climate.sala", "climate.elly"] });
  assert.match(el.shadowRoot.querySelector(".ct-poptitle").textContent, /Ricky/,
    "slot 1 is now Sala, and Sala is exactly what used to appear here");

  click(el, '[data-zmode="dry"]');
  assert.equal(el._hass.calls[0].data.entity_id, "climate.ricky",
    "and a tap inside it still reaches the room whose name is on it");
});

test("sheet: a room that leaves the config closes its own sheet, it is not handed on", () => {
  const el = openSheet(makeGroup(), 1);
  el.setConfig({ entities: ["climate.sala", "climate.elly"] });
  assert.equal(el.shadowRoot.querySelector('[data-act="panel"]'), null, "the sheet is gone");
  assert.equal(el._zui.sheetId, null, "and nothing is left pointing at a room that is not here");
});

// --------------------------------------------------- 21. reaching the sheet ------
// The numeral was a bare div, and it is the only way into the room sheet, which is
// the only place this card offers that room's modes, presets and hardware. The
// steppers either side of it were already buttons, which is what made it stand out.

test("sheet: the opener is a real button that names its room", () => {
  const el = makeGroup();
  const openers = [...el.shadowRoot.querySelectorAll('[data-zone] [data-act="sheet"]')];
  assert.equal(openers.length, ids.length, "one per room");
  for (const b of openers) {
    assert.equal(b.tagName, "BUTTON", "a div here is unreachable without a pointer");
    assert.equal(b.getAttribute("type"), "button", "or it submits an enclosing form");
    assert.ok((b.getAttribute("aria-label") || "").length,
      "the visible text is a bare numeral, so the room name has to be on the label");
  }
  assert.match(openers[1].getAttribute("aria-label"), /Ricky/);
});

test("sheet: Escape closes it, the way every other dialog on the dashboard does", () => {
  const el = openSheet(makeGroup(), 0);
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(el.shadowRoot.querySelector('[data-act="panel"]'), null);
  assert.deepEqual(el._hass.calls, [], "closing is not an action");
});

// ------------------------------------------------------ 22. the All off arm ------
// It used to stay armed for the life of the card: nothing cleared it except turning
// the house off, so a reader who thought better of it had no way back and the next
// tap on that spot was destructive.

test("arm: tapping any other house button disarms the All off confirm", () => {
  const el = makeGroup();
  clickG(el, "alloff");
  assert.ok(el.shadowRoot.querySelector('[data-gact="confirm"]'), "armed");

  clickG(el, "sync");
  assert.equal(el.shadowRoot.querySelector('[data-gact="confirm"]'), null, "disarmed");
  assert.ok(el.shadowRoot.querySelector('[data-gact="alloff"]'), "and visibly back to All off");
  assert.equal(el._hass.calls.filter((c) => c.service === "turn_off").length, 0,
    "the house was never turned off");
});

test("arm: the confirm times out on its own and the button repaints", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const el = makeGroup();
    clickG(el, "alloff");
    assert.ok(el.shadowRoot.querySelector('[data-gact="confirm"]'));

    mock.timers.tick(5001);   // OPT_HOLD_MS, the same hold the rest of the card uses
    assert.equal(el.shadowRoot.querySelector('[data-gact="confirm"]'), null);
    assert.ok(el.shadowRoot.querySelector('[data-gact="alloff"]'),
      "the timer has to repaint, or the armed face stays on screen after it expired");
    assert.deepEqual(el._hass.calls, [], "a timeout is not a confirmation");
  } finally {
    mock.timers.reset();
  }
});

// ---------------------------------------------------- 23. footer in Spanish ------
// groupActions lives inside the pasted zone module, which is geometry and carries its
// labels as English prose. The classic layout builds its own footer and translates;
// the DEFAULT one did not, so it printed "All off" and "Sync all" to a Spanish reader
// while everything around them had switched.

test("footer: the default zone layout footer is localized", () => {
  const es = makeGroup({}, makeHass(states, { entities, language: "es" }));
  const label = (act) => es.shadowRoot.querySelector('[data-gact="' + act + '"]').textContent;
  assert.equal(label("alloff"), "Apagar todo");
  assert.equal(label("sync"), "Igualar todo");

  clickG(es, "alloff");
  assert.equal(label("confirm"), "Toca para confirmar", "the armed face too");

  const dark = copy();
  for (const id of ids) dark[id].state = "off";
  const off = makeGroup({}, makeHass(dark, { entities, language: "es" }));
  assert.equal(off.shadowRoot.querySelector('[data-gact="allon"]').textContent, "Encender todo");
});

test("footer: English is unchanged, so the relabel did not swap the table in", () => {
  const en = makeGroup();
  assert.equal(en.shadowRoot.querySelector('[data-gact="alloff"]').textContent, "All off");
  assert.equal(en.shadowRoot.querySelector('[data-gact="sync"]').textContent, "Sync all");
});

// --------------------------------------------------------- 24. the fan rungs -----
// A three-speed fan reports its stops as (i+1)/n, so medium is exactly 67 percent,
// which fell into the top bucket. Medium and high drew the same three rungs, on the
// one fan layout where three rungs and three speeds ought to line up perfectly.

const rungs = (el, i) => {
  const tile = el.shadowRoot.querySelectorAll("[data-zone]")[i];
  const bars = [...tile.querySelectorAll('span[style*="width:2.5px"]')];
  assert.equal(bars.length, 3, "three rungs are drawn");
  return bars.filter((b) => b.getAttribute("style").includes("#c3cbd4")).length;
};

test("fan: 67 percent lights two rungs and 100 percent lights three", () => {
  const st = copy();
  st["climate.sala"].attributes.fan_mode = "medium";   // 2 of 3 stops, so 67
  st["climate.ricky"].attributes.fan_mode = "high";    // 3 of 3, so 100
  st["climate.elly"].attributes.fan_mode = "low";      // 1 of 3, so 33
  const el = makeGroup({}, makeHass(st, { entities }));

  assert.equal(el._zoneFanPct(st["climate.sala"].attributes), 67, "medium really is the boundary");
  assert.equal(rungs(el, 0), 2, "medium and high must not draw the same picture");
  assert.equal(rungs(el, 1), 3);
  assert.equal(rungs(el, 2), 1);
});

test("fan: auto lights nothing, it is the absence of a speed", () => {
  const el = makeGroup();   // the fixture is fan_mode auto throughout
  assert.equal(rungs(el, 0), 0);
});

// -------------------------------------------------- 25 and 26. the CSS floors ----
// happy-dom does no layout, so these guard the declarations that prevent failures a
// render caught and no functional assertion could: a 300px card inside a 1440px
// window never stacked, and a sheet taller than the phone had its close control and
// its backdrop both off screen with nothing between it and the document scrolling.

test("css: the card measures ITSELF, not the window, for the classic breakpoint", () => {
  const css = makeGroup({ layout: "classic" }).shadowRoot.querySelector("style").textContent;
  assert.match(css, /\.cg-inner\{[^}]*container-type:inline-size/,
    "a viewport media query cannot see a narrow card in a wide window");
  assert.match(css, /@container \(max-width:520px\)\{ \.cg-body\{ grid-template-columns:1fr; \} \}/);
  assert.ok(css.includes("@supports not (container-type: inline-size)"),
    "browsers without container queries keep the old viewport rule as a floor");
  assert.match(css, /\.cg-body\{[^}]*grid-template-columns:minmax\(0,250px\) minmax\(0,1fr\)/,
    "a floor on the hero is a floor the room strip pays for");
});

test("css: the zone tile grid yields to a track narrower than one tile", () => {
  const tiles = makeGroup().shadowRoot.querySelector(".cg-zonecard-tiles");
  assert.match(tiles.getAttribute("style"),
    /grid-template-columns:repeat\(auto-fit,minmax\(min\(126px,100%\),1fr\)\)/,
    "a flat 126px minimum lays a 126px column inside a 94px track, and the raise button "
      + "ends up outside the card");
});

test("css: a sheet taller than the viewport scrolls itself and stays reachable", () => {
  const css = makeGroup().shadowRoot.querySelector("style").textContent;
  const pop = css.slice(css.indexOf(".ct-pop{"), css.indexOf(".ct-pop.open{"));
  assert.match(pop, /align-items:safe center/,
    "plain centring pushes the close control off the top edge");
  assert.match(pop, /padding:12px/);

  const sheet = css.slice(css.indexOf(".ct-sheet{"), css.indexOf(".ct-pop.open .ct-sheet{"));
  assert.match(sheet, /max-height:calc\(100dvh - 24px\)/);
  assert.match(sheet, /overflow-y:auto/);
  assert.match(sheet, /overscroll-behavior:contain/, "or the gesture scrolls the dashboard behind it");
});

// ---------------------------------------------------------- the off room's number --
// An off bedroom still remembers the setpoint it was left at, and the house target is
// the coldest setpoint in the house. Those two together meant one Sync tap sent the
// bedroom's overnight number to every unit that was actually running. The filter two
// lines up already says the rule out loud: "An offline room cannot set the house's
// coldest end any more than an off one can." The code read `real` and not `pool`.
test("regress: an OFF room does not set the house target, and Sync does not write its number", () => {
  const st = copy();
  st["climate.sala"].attributes.temperature = 75;
  st["climate.ricky"].attributes.temperature = 78;
  st["climate.elly"].state = "off";
  st["climate.elly"].attributes.temperature = 65;
  const el = makeGroup(null, makeHass(st, { entities }));

  clickG(el, "sync");
  const sync = el._hass.calls.filter((c) => c.service === "set_temperature");
  assert.ok(sync.length, "sync writes a setpoint");
  for (const c of sync) {
    assert.notEqual(c.data.temperature, 65, "the off room's 65 must never reach a running unit");
    assert.equal(c.data.temperature, 75, "the coldest RUNNING room is the house target");
  }
  const sent = sync.flatMap((c) => [].concat(c.data.entity_id));
  assert.ok(!sent.includes("climate.elly"), "and the off room is not written to at all");
});

test("regress: with every room off, the house target still falls back to a real number", () => {
  const st = copy();
  for (const id of ids) st[id].state = "off";
  st["climate.elly"].attributes.temperature = 65;
  const el = makeGroup(null, makeHass(st, { entities }));
  // No live rooms at all is a real state and has to render a coherent number rather
  // than a NaN, so the fallback to every non-dead room is deliberate.
  assert.match(el.shadowRoot.querySelector(".cg-inner").textContent, /65/);
});
