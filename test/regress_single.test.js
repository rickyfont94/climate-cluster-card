// Regressions for the single dial, one block per defect.
//
// Every test here failed against the shipped 2.3 behavior. They are grouped by the
// thing that was broken rather than by the method that was edited, because most of
// these bugs were only visible from the outside: a service call carrying a value no
// device could land on, a label that stayed English, a cell that showed the value it
// had before the finger touched it.
//
// fan_drag.test.js owns the ring-follows-the-finger contract and swing.test.js owns
// the swing resolver; neither is repeated here.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass } from "./helpers.js";
import * as fx from "./fixtures/presets.js";

// ---------------------------------------------------------------- fixtures ----

// A plain Fahrenheit-native unit with a fan and a swing. Used wherever the unit
// conversion is beside the point.
const fStates = {
  "climate.ac": {
    entity_id: "climate.ac", state: "cool",
    attributes: {
      friendly_name: "AC", hvac_modes: ["off", "cool", "heat"],
      fan_modes: ["low", "medium", "high", "auto"], fan_mode: "low",
      swing_modes: ["off", "vertical"], swing_mode: "off",
      current_temperature: 78, temperature: 75, min_temp: 61, max_temp: 86,
      supported_features: 441,
    },
  },
};
const fEnts = { "climate.ac": { entity_id: "climate.ac", device_id: "d1" } };

function liveCard(extra, states, opts) {
  const card = document.createElement("climate-cluster-card");
  card.setConfig(Object.assign({ entity: "climate.ac" }, extra || {}));
  card.hass = makeHass(states || JSON.parse(JSON.stringify(fStates)),
    Object.assign({ entities: fEnts }, opts || {}));
  return card;
}

// A Celsius-native unit on a half-degree step. Read through a Fahrenheit display
// override, every value on the face is a float (22C is 71.6F) and every value on the
// wire has to come back to one of the device's own half-degree stops.
const cStates = () => ({
  "climate.ac": {
    entity_id: "climate.ac", state: "cool",
    attributes: {
      friendly_name: "AC", hvac_modes: ["off", "cool", "heat"],
      current_temperature: 26, temperature: 22,
      min_temp: 16, max_temp: 30, target_temp_step: 0.5,
      supported_features: 441,
    },
  },
});
const cCard = (extra) => liveCard(Object.assign({ temperature_unit: "F" }, extra || {}),
  cStates(), { unit: "C" });

// A pointerdown the card will accept, with whatever button/pointerType the test needs.
function ringDown(card, ring, over) {
  const el = ring === "fan" ? card._refs.fanGrab : card._refs.drag;
  card._ringPointerDown(Object.assign({
    pointerId: 1, button: 0, clientX: 10, clientY: 10,
    target: el, currentTarget: el,
    preventDefault() {}, stopPropagation() {},
  }, over || {}), ring);
  return card;
}

// The rail is regenerated as an SVG string, so a cell is addressed by its key and
// read back off the rendered <text>, not off the model that produced it.
function railCell(card, key) {
  const i = (card._faceCellKeys || []).indexOf(key);
  if (i < 0) return null;
  return card._refs.faceRail.querySelector('[data-cell="' + i + '"]');
}
function railValue(card, key) {
  const g = railCell(card, key);
  const t = g && g.querySelector("text");
  return t ? t.textContent : null;
}

// ================================================================= fix 3 ======
// Only the primary button drives a control. The rings were the one entry point that
// never checked, so a right-click drag across the band armed the gesture, crossed the
// threshold and wrote a setpoint the user never asked for while the context menu was
// opening on top of it. The centre disc and the steppers already had this rule.

test("button: a right-button press on either ring arms nothing", () => {
  for (const ring of ["temp", "fan"]) {
    const c = ringDown(liveCard(), ring, { button: 2 });
    assert.ok(!c._ringArmed, ring + ": the secondary button is not a control");
    assert.ok(!c._active, ring + ": and no ring was claimed");
  }
});

test("button: a middle-button press on either ring arms nothing", () => {
  for (const ring of ["temp", "fan"]) {
    const c = ringDown(liveCard(), ring, { button: 1 });
    assert.ok(!c._ringArmed, ring + ": the middle button is not a control either");
  }
});

test("button: a refused press cannot commit, even driven all the way to a release", () => {
  const c = ringDown(liveCard(), "temp", { button: 2 });
  // The whole gesture, not just the down: a right drag used to paint and then write.
  c._ringPointerMove({ pointerId: 1, clientX: 400, clientY: 60 });
  c._ringPointerUp({ type: "pointerup", pointerId: 1 });
  assert.deepEqual(c._hass.calls, [], "nothing reached the unit");
  assert.ok(c._optimisticTarget == null, "and nothing was painted as if it had");
});

test("button: the primary button still drives both rings", () => {
  assert.equal(ringDown(liveCard(), "temp", { button: 0 })._ringArmed, true);
  assert.equal(ringDown(liveCard(), "fan", { button: 0 })._ringArmed, true);
});

test("button: touch and pen are unaffected, because a primary contact is button 0", () => {
  const touch = ringDown(liveCard(), "temp", { pointerType: "touch", button: 0 });
  assert.equal(touch._ringArmed, true, "a finger still drags the temperature ring");
  const pen = ringDown(liveCard(), "fan", { pointerType: "pen", button: 0 });
  assert.equal(pen._ringArmed, true, "and a pen still drags the fan ring");
  // A synthetic event with no button at all (older engines, and every test above
  // that omits it) is taken at its word rather than dropped.
  const bare = ringDown(liveCard(), "temp", { button: undefined });
  assert.equal(bare._ringArmed, true, "an absent button is not a non-primary button");
});

// ================================================================= fix 4 ======
// An abandoned gesture used to clear EVERY optimistic field. So a fan drag the browser
// cancelled threw away a temperature the card had already SENT and was holding on
// screen: the hero dropped back to the stale live setpoint with no service call to
// explain it, and the mirror case killed a just-committed fan speed. The two rings keep
// separate optimistic state precisely so they can be cleared separately.

test("abandon: a cancelled FAN gesture leaves a committed temperature on the face", () => {
  const c = liveCard();
  c._commitTemp(80);                                  // really sent, and held on screen
  assert.equal(c._optimisticTarget, 80);
  const sent = c._hass.calls.length;

  ringDown(c, "fan");
  c._dragging = true;
  c._fanPendingName = "high";
  c._optimisticFanName = "high";
  c._optimisticFanUntil = Date.now() + 5000;
  c._ringPointerUp({ type: "pointercancel", pointerId: 1 });

  assert.equal(c._optimisticTarget, 80,
    "the temperature was written, so it must keep showing until the unit reports it");
  assert.ok(c._optimisticUntil > 0, "and its hold window survives too");
  assert.equal(c._optimisticFanName, null, "only the abandoned fan gesture is dropped");
  assert.equal(c._hass.calls.length, sent, "a cancel writes nothing of its own");
});

test("abandon: a cancelled TEMP gesture leaves a committed fan speed on the face", () => {
  const c = liveCard();
  c._commitFanName("high");
  assert.equal(c._optimisticFanName, "high");

  ringDown(c, "temp");
  c._dragging = true;
  c._pendingTemp = 68;
  c._optimisticTarget = 68;
  c._optimisticUntil = Date.now() + 5000;
  c._ringPointerUp({ type: "pointercancel", pointerId: 1 });

  assert.equal(c._optimisticFanName, "high", "the fan speed was written and stays");
  assert.ok(c._optimisticFanUntil > 0);
  assert.equal(c._optimisticTarget, null, "only the abandoned temperature gesture is dropped");
});

test("abandon: the heat_cool pair is cleared by a fan abandon no more than the single target", () => {
  const c = liveCard();
  c._optimisticLow = 68;
  c._optimisticHigh = 76;
  c._optimisticHcUntil = Date.now() + 5000;

  ringDown(c, "fan");
  c._dragging = true;
  c._fanPendingName = "medium";
  c._ringPointerUp({ type: "pointercancel", pointerId: 1 });

  assert.equal(c._optimisticLow, 68, "a fan gesture never owned the low setpoint");
  assert.equal(c._optimisticHigh, 76);
});

test("abandon: a gesture dropped before it was classified still clears both", () => {
  // Nothing to attribute it to, so there is no family to spare.
  const c = liveCard();
  c._optimisticTarget = 80;
  c._optimisticUntil = Date.now() + 5000;
  c._optimisticFanName = "high";
  c._optimisticFanUntil = Date.now() + 5000;

  c._active = null;
  c._ringAbandon();

  assert.equal(c._optimisticTarget, null);
  assert.equal(c._optimisticFanName, null);
});

// ================================================================= fix 5 ======
// The four capturing touch guards are what stop the dashboard scrolling under a ring
// drag. disconnectedCallback removes all four, and they used to be added only from
// _build, which runs once. A card that was detached and re-attached (a tab switch, a
// Sections relayout, a drag in the editor) came back still writing setpoints but no
// longer holding the page still.

// The touchmove guard's whole job is the preventDefault, so that is the probe.
function guardActive(card) {
  card._ringArmed = true;
  const ev = new Event("touchmove", { bubbles: true, cancelable: true });
  card._svg.dispatchEvent(ev);
  return ev.defaultPrevented;
}

test("touch guards: bound at build, gone on detach, and back on re-attach", () => {
  const c = liveCard();
  assert.equal(guardActive(c), true, "a fresh card blocks the scroll under a drag");

  c.disconnectedCallback();
  assert.equal(guardActive(c), false, "detaching really does tear them down");

  c.connectedCallback();
  assert.equal(guardActive(c), true,
    "re-attaching rebinds them, or a touch drag scrolls the page under the finger");
});

test("touch guards: a second re-attach does not double-bind", () => {
  // Adding the same function reference twice is a DOM no-op, which is what lets
  // _bindSvgTouch run from both _build and connectedCallback with no guard flag.
  const c = liveCard();
  let hits = 0;
  const count = () => { hits++; };
  c._svg.addEventListener("touchmove", count, { capture: true, passive: false });
  c.connectedCallback();
  c.connectedCallback();
  c._svg.dispatchEvent(new Event("touchmove", { bubbles: true, cancelable: true }));
  assert.equal(hits, 1, "one listener, however many times it was bound");
});

// ================================================================= fix 6 ======
// The hero numeral and the ROOM label printed the RAW numbers. Everywhere else on the
// card (the rail, the scale, the aria values) runs through _fmtDisplay, so on a
// Celsius unit read in Fahrenheit the hero said 71.6 and ROOM said 78.8 while the same
// two values were rounded to 72 and 79 three inches away.

test("display: the hero numeral prints the formatted string, not the converted float", () => {
  const c = cCard();                      // 22C target, shown in F
  const hero = c._refs.faceCenter.textContent;
  assert.ok(/72/.test(hero), "22C is 71.6F and the face rounds it: " + hero);
  assert.ok(!/71\.6/.test(hero), "the raw conversion must never reach the glass");
});

test("display: the ROOM label prints the formatted string too", () => {
  const c = cCard();                      // 26C current, shown in F
  const room = c._refs.faceRoom.textContent;
  assert.ok(/79/.test(room), "26C is 78.8F: " + room);
  assert.ok(!/78\.8/.test(room), "same rule for the caption under the numeral");
});

test("display: the numeric set/room fields stay raw, because they are geometry", () => {
  // The band angle, the room pin and the delta all measure with these. Rounding them
  // would move the marker off the value the text says.
  const st = cCard()._faceState();
  assert.ok(Math.abs(st.set - 71.6) < 0.01, "set is the real converted value: " + st.set);
  assert.ok(Math.abs(st.room - 78.8) < 0.01, "and so is room: " + st.room);
  assert.equal(st.setText, "72");
  assert.equal(st.roomText, "79");
});

test("display: a unit needing no conversion is untouched", () => {
  const st = liveCard()._faceState();
  assert.equal(st.setText, "75");
  assert.equal(st.roomText, "78");
});

// ================================================================= fix 7 ======
// The ring snaps to the DISPLAY step. Converting that value back landed it between the
// device's own stops: 72F became 22.222222222222225C on a unit whose target_temp_step
// is 0.5. The device rounded it somewhere of its own choosing, the state that came
// back never equalled what was sent, and the optimistic reconcile could never match it.

const lastCall = (c, service) => c._hass.calls.filter((x) => x.service === service).pop();

test("snap: a committed temperature lands on the entity's own step, in HA units", () => {
  const c = cCard();
  c._commitTemp(72);
  const call = lastCall(c, "set_temperature");
  assert.ok(call, "it still writes");
  assert.equal(call.data.temperature, 22,
    "71.6..72F is 22.22C, and the nearest half-degree stop this unit has is 22");
});

test("snap: a committed temperature is clamped to the entity's own bounds", () => {
  const c = cCard();
  c._commitTemp(95);                       // 35C, past the unit's own 30C ceiling
  assert.equal(lastCall(c, "set_temperature").data.temperature, 30);

  c._commitTemp(50);                       // 10C, below its 16C floor
  assert.equal(lastCall(c, "set_temperature").data.temperature, 16);
});

test("snap: the heat_cool pair is snapped and clamped the same way", () => {
  const st = cStates();
  st["climate.ac"].state = "heat_cool";
  st["climate.ac"].attributes.hvac_modes = ["off", "heat_cool"];
  st["climate.ac"].attributes.temperature = null;
  st["climate.ac"].attributes.target_temp_low = 18;
  st["climate.ac"].attributes.target_temp_high = 24;
  const c = liveCard({ temperature_unit: "F" }, st, { unit: "C" });

  c._commitHeatCool(65, 78);
  const call = lastCall(c, "set_temperature");
  assert.equal(call.data.target_temp_low, 18.5, "65F is 18.33C -> the 18.5 stop");
  assert.equal(call.data.target_temp_high, 25.5, "78F is 25.56C -> the 25.5 stop");
  assert.equal("temperature" in call.data, false, "a dual-setpoint unit takes the pair");
});

test("snap: an entity with no step of its own is left alone but still clamped", () => {
  const st = cStates();
  delete st["climate.ac"].attributes.target_temp_step;
  const c = liveCard({ temperature_unit: "F" }, st, { unit: "C" });
  c._commitTemp(95);
  assert.equal(lastCall(c, "set_temperature").data.temperature, 30,
    "no step to snap to, but min_temp/max_temp still bound the payload");
});

// ================================================================= fix 8 ======
// The mode row was built once, from whatever the entity advertised when the sheet was
// FIRST opened, and afterwards only restyled. A unit that dropped a mode kept a
// clickable button writing a value it no longer supports, and a sheet opened while the
// unit was offline froze the built-in seven-mode fallback and then offered heat_cool
// to a unit that never advertised it.

const modeButtons = (c) =>
  [...c._refs.sheet.querySelectorAll("button[data-mode]")].map((b) => b.dataset.mode);

test("modes: the sheet drops a button when the entity drops the mode", () => {
  const c = liveCard();
  c._buildPop();
  assert.deepEqual(modeButtons(c), ["off", "cool", "heat"]);

  const st = JSON.parse(JSON.stringify(fStates));
  st["climate.ac"].attributes.hvac_modes = ["off", "cool"];
  c.hass = makeHass(st, { entities: fEnts });
  c._paintPop();

  assert.deepEqual(modeButtons(c), ["off", "cool"],
    "a button that writes a mode the unit no longer takes is worse than no button");
});

test("modes: a sheet built while the unit was offline picks up its real list later", () => {
  const c = liveCard();
  c.hass = makeHass({ "climate.ac": { entity_id: "climate.ac", state: "unavailable",
    attributes: {} } }, { entities: fEnts });
  c._buildPop();
  assert.ok(modeButtons(c).includes("heat_cool"),
    "offline, the built-in fallback is all there is to offer");

  c.hass = makeHass(JSON.parse(JSON.stringify(fStates)), { entities: fEnts });
  c._paintPop();
  assert.deepEqual(modeButtons(c), ["off", "cool", "heat"],
    "and the fallback must not outlive the unit coming back");
});

test("modes: a configured modes list still wins over the entity's own", () => {
  const c = liveCard({ modes: ["off", "cool"] });
  c._buildPop();
  c._paintPop();
  assert.deepEqual(modeButtons(c), ["off", "cool"]);
});

test("modes: _selectMode refuses a mode the entity does not advertise", () => {
  const c = liveCard();
  c._selectMode("dry");                       // not in hvac_modes
  assert.deepEqual(c._hass.calls, [], "never write a mode the unit did not publish");

  c._selectMode("heat");
  assert.ok(c._hass.calls.some((x) => x.service === "set_hvac_mode" && x.data.hvac_mode === "heat"),
    "a real member still goes through");
});

test("modes: an entity advertising no list at all is left alone, not locked out", () => {
  // No list is nothing to check against. Locking these out would break every
  // minimal integration that never fills hvac_modes in.
  const st = JSON.parse(JSON.stringify(fStates));
  delete st["climate.ac"].attributes.hvac_modes;
  const c = liveCard({}, st);
  c._selectMode("dry");
  assert.ok(c._hass.calls.some((x) => x.service === "set_hvac_mode" && x.data.hvac_mode === "dry"));
});

test("turn_on: sent only when supported_features advertises CLIMATE_TURN_ON", () => {
  const off = (feat) => {
    const st = JSON.parse(JSON.stringify(fStates));
    st["climate.ac"].state = "off";
    if (feat == null) delete st["climate.ac"].attributes.supported_features;
    else st["climate.ac"].attributes.supported_features = feat;
    const c = liveCard({}, st);
    c._selectMode("cool");
    return c._hass.calls.map((x) => x.service);
  };

  assert.deepEqual(off(441), ["turn_on", "set_hvac_mode"],
    "441 carries bit 128, so the unit really does take a turn_on");
  assert.deepEqual(off(1), ["set_hvac_mode"],
    "without bit 128 the extra call was noise HA logged and nothing more");
  // No supported_features at all: nothing says the unit refuses one, and
  // set_hvac_mode alone leaves some units off, so the call is still sent.
  assert.deepEqual(off(null), ["turn_on", "set_hvac_mode"],
    "an absent feature mask is unknown, not a refusal");
});

test("turn_on: a unit that is already running never gets one", () => {
  const c = liveCard();                       // state "cool"
  c._selectMode("heat");
  assert.deepEqual(c._hass.calls.map((x) => x.service), ["set_hvac_mode"]);
});

// ================================================================= fix 9 ======
// The rail was the one part of the card that stayed in English. Its captions and its
// ON/OFF values were written as literals while LOCALE carried every one of them, so a
// Spanish dashboard read AHORA, OSCILAR and VENT. everywhere except the row of buttons
// under the dial.

const cellBy = (c, key) => c._faceCellsAvailable().find((x) => x.key === key);

test("rail: the captions come from the locale table", () => {
  const en = cellBy(liveCard(), "swing");
  assert.equal(en.caption, "SWING");
  const es = cellBy(liveCard({}, null, { language: "es" }), "swing");
  assert.equal(es.caption, "OSCILAR", "the caption is a table lookup, not a literal");

  // FAN uses hint_fan, the 27-unit pill form, not the prose form the announcements need
  assert.equal(cellBy(liveCard(), "fan").caption, "FAN");
  assert.equal(cellBy(liveCard({}, null, { language: "es" }), "fan").caption, "VENT.");
});

test("rail: the ON/OFF values come from the locale table too", () => {
  assert.equal(cellBy(liveCard(), "swing").value, "OFF");
  assert.equal(cellBy(liveCard({}, null, { language: "es" }), "swing").value, "APAGADO");
});

test("rail: AUTO on the fan cell is localized, not a literal", () => {
  const st = JSON.parse(JSON.stringify(fStates));
  st["climate.ac"].attributes.fan_mode = "auto";
  assert.equal(cellBy(liveCard({}, st), "fan").value, "AUTO");
  assert.equal(cellBy(liveCard({}, st, { language: "es" }), "fan").value, "AUTO");
});

test("rail: a cell cannot change width as it toggles, in either language", () => {
  // rail() sizes each cell from the widest string it is handed. Sizing from the
  // CURRENT value meant the swing pill grew by two characters the moment it turned
  // on in Spanish, shoving every cell beside it sideways.
  for (const lang of ["en", "es"]) {
    const on = JSON.parse(JSON.stringify(fStates));
    on["climate.ac"].attributes.swing_mode = "vertical";
    const offCell = cellBy(liveCard({}, null, { language: lang }), "swing");
    const onCell = cellBy(liveCard({}, on, { language: lang }), "swing");

    assert.notEqual(offCell.value, onCell.value, lang + ": the two states really differ");
    assert.equal(offCell.widest, onCell.widest, lang + ": but the cell is sized once");
    assert.ok(offCell.widest.length >= offCell.value.length
      && onCell.widest.length >= onCell.value.length,
      lang + ": and sized from the longer of the two, " + offCell.widest);
  }
  assert.equal(cellBy(liveCard({}, null, { language: "es" }), "swing").widest, "ENCENDIDO",
    "encendido is longer than apagado, so it sets the width");
});

// ================================================================ fix 10 ======
// A select has no on state, so `state === "on"` was false at every position and the
// rail cell read OFF for a wind mode sitting on Turbo. The popup chip for the same
// entity had always shown the live option.

const windStates = (cur) => {
  const st = JSON.parse(JSON.stringify(fStates));
  st["select.wind"] = { entity_id: "select.wind", state: cur,
    attributes: { friendly_name: "Wind Mode", options: ["Auto", "Turbo", "Silencio"] } };
  return st;
};
const windCard = (cur) =>
  liveCard({ extra_toggles: ["select.wind"] }, windStates(cur || "Turbo"));

test("extra select: the rail shows the live option, not a flat OFF", () => {
  assert.equal(railValue(windCard("Turbo"), "extra:0"), "TURBO");
  assert.equal(railValue(windCard("Auto"), "extra:0"), "AUTO");
});

test("extra select: the cell is sized from the longest option, so cycling cannot resize it", () => {
  const cell = windCard("Auto")._faceCellsAvailable().find((c) => c.key === "extra:0");
  assert.equal(cell.widest, "Silencio", "the longest option this select can ever show");
  assert.equal(cell.lit, false, "a position is not an on state, so the cell is not lit");
});

test("extra select: a select with no option chosen yet still reads as off, not blank", () => {
  // Tuya wind selects boot at "unknown" with their options already published.
  assert.equal(railValue(windCard("unknown"), "extra:0"), "UNKNOWN");
});

test("extra switch: a plain switch is unchanged, it still reads ON/OFF", () => {
  const st = JSON.parse(JSON.stringify(fStates));
  st["switch.ion"] = { entity_id: "switch.ion", state: "on",
    attributes: { friendly_name: "Ionizer" } };
  assert.equal(railValue(liveCard({ extra_toggles: ["switch.ion"] }, st), "extra:0"), "ON");
});

// ================================================================ fix 11 ======
// The optimistic model flipped immediately and the popup chip for the same feature
// followed it, but the rail cell that was actually TAPPED kept showing the pre-tap
// value for the whole five-second hold. The one control the finger touched was the one
// that looked like it had ignored it.

function tapCell(card, key) {
  const g = railCell(card, key);
  assert.ok(g, "no rail cell for " + key);
  g.dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  return card;
}

test("tap: a swing cell repaints itself instead of showing the pre-tap value", () => {
  const c = liveCard();
  assert.equal(railValue(c, "swing"), "OFF");
  tapCell(c, "swing");
  assert.equal(railValue(c, "swing"), "ON",
    "the cell under the finger has to move, or the tap reads as ignored");
});

test("tap: an extra toggle cell repaints itself too", () => {
  const st = JSON.parse(JSON.stringify(fStates));
  st["switch.ion"] = { entity_id: "switch.ion", state: "off",
    attributes: { friendly_name: "Ionizer" } };
  const c = liveCard({ extra_toggles: ["switch.ion"] }, st);
  assert.equal(railValue(c, "extra:0"), "OFF");

  tapCell(c, "extra:0");
  assert.equal(railValue(c, "extra:0"), "ON");
  assert.ok(c._hass.calls.some((x) => x.domain === "switch" && x.service === "turn_on"),
    "and the repaint is optimistic, not a substitute for the write");
});

test("tap: a select extra still cycles to the next option", () => {
  const c = windCard("Auto");
  tapCell(c, "extra:0");
  const call = c._hass.calls.find((x) => x.service === "select_option");
  assert.ok(call, "a select tap writes an option");
  assert.equal(call.data.option, "Turbo");
});

test("tap: the FAN cell still goes to the clover path, not to a toggle", () => {
  const c = liveCard();
  tapCell(c, "fan");
  assert.ok(c._hass.calls.some((x) => x.service === "set_fan_mode"),
    "FAN is the auto tap, and it must not be swallowed by the toggle branch");
});

// ================================================================ fix 12 ======
// Two controls that have a default and were not seeded, so they opened on ha-form's
// blank row: the fan ring radios showed nothing selected on a fresh card, and the unit
// dropdown was empty although the card resolves it to "auto" when unset. Seeding them
// must not start WRITING a key the YAML never had.

function makeEditor(config, hass) {
  const ed = document.createElement("climate-cluster-card-editor");
  ed.setConfig(config);
  if (hass) ed._hass = hass;
  return ed;
}
function savedFrom(ed, value) {
  let saved = null;
  ed.addEventListener("config-changed", (e) => { saved = e.detail.config; });
  ed._valueChanged({ stopPropagation() {}, detail: { value } });
  return saved;
}
const bareEditor = () => makeEditor({ entity: "climate.aire_sala" },
  makeHass(fx.states, { entities: fx.entities }));

test("editor: fan_style and temperature_unit are seeded so neither control opens blank", () => {
  const data = bareEditor()._computeFormData({ entity: "climate.aire_sala" });
  assert.equal(data.fan_style, "breeze", "the 2.3 default, so a radio is selected");
  assert.equal(data.temperature_unit, "auto", "the resolved default, so the select reads Auto");
});

test("editor: both seeds are pruned back out, so an untouched card saves neither key", () => {
  const ed = bareEditor();
  const saved = savedFrom(ed, ed._computeFormData({ entity: "climate.aire_sala" }));
  assert.ok(saved, "an edit still emits");
  assert.equal("fan_style" in saved, false, "breeze is the default and says nothing");
  assert.equal("temperature_unit" in saved, false, "so does auto, even hand-authored");
});

test("editor: a real choice on either control still saves", () => {
  const ed = bareEditor();
  const data = ed._computeFormData({ entity: "climate.aire_sala" });
  const saved = savedFrom(ed, Object.assign({}, data, { fan_style: "silk", temperature_unit: "C" }));
  assert.equal(saved.fan_style, "silk");
  assert.equal(saved.temperature_unit, "C");
});

test("editor: an existing fan_style is seeded from the config, not overwritten by the default", () => {
  const cfg = { entity: "climate.aire_sala", fan_style: "original" };
  assert.equal(bareEditor()._computeFormData(cfg).fan_style, "original");
});

// ================================================================ fix 13 ======
// The form is seeded from the appearance it was BUILT with and pruned against the
// appearance it was SAVED with, and picking a different variant moves those two apart
// inside a single emit. The seeded dark tint came back while the prune was looking for
// the light one, so choosing the light glass wrote the DARK base into the YAML and
// really did paint a dark indigo slab, and the mirror case painted a near-white one.

test("editor: picking the light glass from a bare config saves no tint and no opacity", () => {
  const ed = bareEditor();
  const data = ed._computeFormData({ entity: "climate.aire_sala" });
  // the seed the form was built with: theme, which reads the DARK base
  assert.deepEqual(data.glass_color, [20, 24, 46]);
  assert.equal(data.glass_opacity, 0.66);

  const saved = savedFrom(ed, Object.assign({}, data, { appearance: "glass-light" }));
  assert.equal(saved.appearance, "glass-light");
  assert.equal("glass_color" in saved, false,
    "an untouched swatch must not write the other variant's tint");
  assert.equal("glass_opacity" in saved, false);
});

test("editor: picking the dark glass from a bare config saves neither either", () => {
  const ed = bareEditor();
  const data = ed._computeFormData({ entity: "climate.aire_sala" });
  const saved = savedFrom(ed, Object.assign({}, data, { appearance: "glass-dark" }));
  assert.equal(saved.appearance, "glass-dark");
  assert.equal("glass_color" in saved, false);
  assert.equal("glass_opacity" in saved, false);
});

test("editor: the light base is equally untouched when it is the one that came back", () => {
  // The mirror case: a card already on the light variant, switched to dark.
  const ed = makeEditor({ entity: "climate.aire_sala", appearance: "glass-light" },
    makeHass(fx.states, { entities: fx.entities }));
  const data = ed._computeFormData(ed._config);
  assert.deepEqual(data.glass_color, [244, 247, 253], "seeded from the light base");
  assert.equal(data.glass_opacity, 0.6);

  const saved = savedFrom(ed, Object.assign({}, data, { appearance: "glass-dark" }));
  assert.equal("glass_color" in saved, false);
  assert.equal("glass_opacity" in saved, false);
});

test("editor: a tint the user really picked is still saved", () => {
  const ed = bareEditor();
  const data = ed._computeFormData({ entity: "climate.aire_sala" });
  const saved = savedFrom(ed, Object.assign({}, data,
    { appearance: "glass-dark", glass_color: [10, 90, 200], glass_opacity: 0.4 }));
  assert.deepEqual(saved.glass_color, [10, 90, 200], "neither base, so it is a choice");
  assert.equal(saved.glass_opacity, 0.4);
});
