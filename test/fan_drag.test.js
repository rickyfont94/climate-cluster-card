// The fan ring has to move under the finger.
//
// _paintFanPct and _paintFanNamed are the optimistic paint for a fan drag, and they
// write to fanFill, fanHandle, fanPct and fanName. The new face switches every one of
// those off, so the drag committed the right value and showed nothing at all: the ring
// sat still and jumped to its new place on release. The temp band never had this,
// because _paintTempArc already restrings the face.
//
// The service call was identical before and after, which is why this needs its own
// test: a harness that only records what was written cannot see it.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass } from "./helpers.js";

const states = {
  "climate.ac": {
    entity_id: "climate.ac", state: "cool",
    attributes: {
      friendly_name: "AC", hvac_modes: ["off", "cool"],
      fan_modes: ["auto", "low", "medium", "high"], fan_mode: "low",
      current_temperature: 78, temperature: 75, min_temp: 61, max_temp: 86,
    },
  },
};
const entities = { "climate.ac": { entity_id: "climate.ac", device_id: "d1" } };

function liveCard(extra) {
  const card = document.createElement("climate-cluster-card");
  card.setConfig(Object.assign({ entity: "climate.ac" }, extra || {}));
  card.hass = makeHass(states, { entities });
  return card;
}

test("fan drag: the face's ring is restrung on every move, not on release", () => {
  const card = liveCard();
  const before = card._refs.faceFan.innerHTML;
  assert.ok(before.length, "the ring is drawn at rest");

  card._paintFanNamed(["low", "medium", "high"], "high");
  assert.notEqual(card._refs.faceFan.innerHTML, before,
    "the ring under the finger has to change while the finger is still down");
});

test("fan drag: the rail's FAN cell follows the same move", () => {
  const card = liveCard();
  card._paintFanNamed(["low", "medium", "high"], "high");
  assert.match(card._refs.faceRail.innerHTML, /100%/);
  card._paintFanNamed(["low", "medium", "high"], "low");
  assert.match(card._refs.faceRail.innerHTML, /33%/);
});

test("fan drag: a drag can never land on auto, and settling to auto reads AUTO", () => {
  const card = liveCard();
  // the drag list excludes auto on purpose, so a drag cannot select it
  assert.deepEqual(card._fanNamedModes(), ["low", "medium", "high"]);

  // settling to auto goes down its own path, and that has to reach the face too
  card._paintFanAuto();
  assert.match(card._refs.faceRail.innerHTML, /AUTO/);
  assert.doesNotMatch(card._refs.faceRail.innerHTML, /\d+%/);
});

test("fan drag: the cached ring key is dropped, so the next full render redraws", () => {
  const card = liveCard();
  card._paintFanNamed(["low", "medium", "high"], "high");
  assert.equal(card._faceFanKey, null,
    "what is drawn no longer matches any committed state");
});

test("fan drag: show_fan false still paints nothing", () => {
  const card = liveCard({ show_fan: false });
  card._paintFanNamed(["low", "medium", "high"], "high");
  assert.equal(card._refs.faceFan.innerHTML, "", "the ring stays off");
});

test("temp drag: the face already followed, and still does", () => {
  const card = liveCard();
  const before = card._refs.faceCenter.innerHTML;
  card._paintTempArc(68);
  assert.notEqual(card._refs.faceCenter.innerHTML, before);
  assert.match(card._refs.faceCenter.textContent, /68/);
});

// The snap-back. The marker followed the finger, then jumped back to where it
// started while the finger was still down, and only reappeared at the new position
// on release. _paintFace runs at the END of every render and re-derived the fan from
// the COMMITTED state, so any push from anywhere in the house overwrote the drag.
// Home Assistant pushes state constantly, so this fired within a second every time.

test("fan drag: a state push mid-drag does not snap the marker back", () => {
  const card = liveCard();

  // finger down, dragged to high; the device still reports low
  card._optimisticFanName = "high";
  card._optimisticFanPct = null;
  card._optimisticFanUntil = Date.now() + 5000;
  card._paintFanNamed(["low", "medium", "high"], "high");
  const dragged = card._refs.faceFan.innerHTML;
  assert.match(card._refs.faceRail.innerHTML, /100%/);

  // an unrelated entity changes and Home Assistant pushes the whole state object
  card._sig = null;
  card.hass = makeHass(states, { entities });

  assert.equal(card._refs.faceFan.innerHTML, dragged,
    "the ring must not jump back to the value the device still reports");
  assert.match(card._refs.faceRail.innerHTML, /100%/);
});

test("fan drag: once the hold lapses the face reads the device again", () => {
  const card = liveCard();
  card._optimisticFanName = "high";
  card._optimisticFanUntil = Date.now() - 1;   // expired
  card._sig = null;
  card.hass = makeHass(states, { entities });
  // fan_mode is "low", which is 1 of 3 named modes
  assert.match(card._refs.faceRail.innerHTML, /33%/);
});

test("fan in auto reads AUTO even when a speed entity holds a number underneath", () => {
  const auto = JSON.parse(JSON.stringify(states));
  auto["climate.ac"].attributes.fan_mode = "auto";
  const card = document.createElement("climate-cluster-card");
  card.setConfig({ entity: "climate.ac" });
  card.hass = makeHass(auto, { entities });
  assert.equal(card._facePct(), null, "auto is the absence of a value");
  assert.match(card._refs.faceRail.innerHTML, /AUTO/);
});

// A NUMERIC fan, which is the Midea shape: a climate entity plus a number entity on
// the same device. In auto the driver parks the number OUTSIDE its own range (101 on
// a 1..100 number), and that out-of-range reading is what says "no speed". Keying it
// on the MODE WORD instead left the ring stuck showing auto after a speed had been
// set, because writing a speed moves the number while the mode can keep reporting
// auto: the drag looked like it did nothing.

const numStates = (fanMode, speed) => ({
  "climate.ac": {
    entity_id: "climate.ac", state: "cool",
    attributes: {
      friendly_name: "AC", hvac_modes: ["off", "auto", "cool"],
      fan_modes: ["low", "medium", "high", "auto"], fan_mode: fanMode,
      current_temperature: 78, temperature: 75, min_temp: 61, max_temp: 86,
    },
  },
  "number.ac_fan_speed": {
    entity_id: "number.ac_fan_speed", state: String(speed),
    attributes: { friendly_name: "AC fan speed", min: 1, max: 100, step: 1 },
  },
});
const numEntities = {
  "climate.ac": { entity_id: "climate.ac", device_id: "d1" },
  "number.ac_fan_speed": { entity_id: "number.ac_fan_speed", device_id: "d1" },
};
function numCard(fanMode, speed) {
  const c = document.createElement("climate-cluster-card");
  c.setConfig({ entity: "climate.ac" });
  c.hass = makeHass(numStates(fanMode, speed), { entities: numEntities });
  return c;
}

test("numeric fan: parked out of range is no speed, and reads AUTO", () => {
  const c = numCard("auto", 101);
  assert.equal(c._facePct(), null);
  assert.match(c._refs.faceRail.innerHTML, /AUTO/);
});

test("numeric fan: a REAL speed shows even while the mode still reports auto", () => {
  // the exact case that made the ring look stuck: the number moved, the mode did not
  const c = numCard("auto", 41);
  assert.equal(c._facePct(), 40);
  assert.match(c._refs.faceRail.innerHTML, /40%/);
});

test("numeric fan: switching hvac mode does not strand the ring in auto", () => {
  const c = numCard("auto", 101);
  assert.match(c._refs.faceRail.innerHTML, /AUTO/);

  const live = numStates("auto", 55);
  live["climate.ac"].state = "cool";
  c.hass = makeHass(live, { entities: numEntities });
  assert.match(c._refs.faceRail.innerHTML, /5[45]%/, "the speed that was set has to show");
});

test("numeric fan: a missing speed entity is no speed, not a crash", () => {
  const only = { "climate.ac": numStates("auto", 50)["climate.ac"] };
  const c = document.createElement("climate-cluster-card");
  c.setConfig({ entity: "climate.ac" });
  c.hass = makeHass(only, { entities: { "climate.ac": { entity_id: "climate.ac", device_id: "d1" } } });
  assert.doesNotThrow(() => c._facePct());
});

// The full matrix, measured against the real unit's behaviour: it refuses every fan
// command while its HVAC mode is auto, and in cool it accepts them and keeps
// fan_mode and the speed entity in step. In auto the speed entity parks OUT of its
// own range (101 / 102 on a 1..100 number), which is the only honest signal that no
// speed is set.
const M = (hvac, fan, speed) => {
  const st = {
    "climate.ac": { entity_id: "climate.ac", state: hvac, attributes: {
      friendly_name: "AC", hvac_modes: ["off", "auto", "cool", "fan_only"],
      fan_modes: ["silent", "low", "medium", "high", "full", "auto"], fan_mode: fan,
      current_temperature: 78, temperature: 75, min_temp: 61, max_temp: 86 } },
  };
  if (speed !== undefined) {
    st["number.ac_fan_speed"] = { entity_id: "number.ac_fan_speed", state: String(speed),
      attributes: { friendly_name: "AC fan speed", min: 1, max: 100, step: 1 } };
  }
  return st;
};
const mEnts = { "climate.ac": { entity_id: "climate.ac", device_id: "d1" },
  "number.ac_fan_speed": { entity_id: "number.ac_fan_speed", device_id: "d1" } };
function mCard(hvac, fan, speed, cfg) {
  const c = document.createElement("climate-cluster-card");
  c.setConfig(Object.assign({ entity: "climate.ac" }, cfg || {}));
  c.hass = makeHass(M(hvac, fan, speed), { entities: mEnts });
  return c;
}
// the handle is the last rotate() in the ring markup; 250 is empty, 470 is full
const ringEnd = (c) => {
  const m = [...c._refs.faceFan.innerHTML.matchAll(/rotate\(([-0-9.]+)\)/g)].pop();
  return m ? Math.round(Number(m[1])) : null;
};
const railText = (c) => (c._refs.faceRail.textContent.match(/(AUTO|\d+%)/) || ["-"])[0];

test("fan ring: ALWAYS drawn, in every mode that can carry a fan", () => {
  for (const hvac of ["cool", "fan_only", "auto", "dry", "heat"]) {
    const c = mCard(hvac, "auto", 102);
    assert.ok(c._refs.faceFan.innerHTML.length > 200,
      hvac + ": the ring is the control you grab, it cannot be missing");
    assert.match(c._refs.faceFan.innerHTML, /stroke-width/,
      hvac + ": with no speed set it is still a drawn ring, not an empty group");
    assert.equal(railText(c), "AUTO", hvac + ": and the WORD carries the distinction");
  }
});

test("fan ring: a set speed draws to that speed, not to full", () => {
  assert.equal(ringEnd(mCard("cool", "high", 80)), 426);
  assert.equal(railText(mCard("cool", "high", 80)), "80%");
  assert.equal(ringEnd(mCard("cool", "low", 20)), 292);
});

test("fan ring: no speed entity at all falls back to the named position", () => {
  assert.equal(railText(mCard("cool", "high", undefined)), "80%");
  assert.equal(railText(mCard("cool", "auto", undefined)), "AUTO");
});

test("fan: the spinning glyph is off by default and comes back on request", () => {
  const off = mCard("cool", "high", 80);
  assert.equal(off._refs.clover.style.display, "none");
  const on = mCard("cool", "high", 80, { fan_clover: true });
  assert.notEqual(on._refs.clover.style.display, "none");
});

test("fan marker: no value means no marker, in every ring style", () => {
  // The marker marks a value. On this hardware hvac auto refuses fan commands, so a
  // marker parked at the far end there points at a speed the unit will not accept.
  for (const style of ["silk", "breeze", "original"]) {
    const unset = mCard("auto", "auto", 102, { fan_style: style });
    assert.ok(unset._refs.faceFan.innerHTML.length > 200, style + ": the ring is still drawn");
    assert.equal(ringEnd(unset), null, style + ": and carries no marker");

    const set = mCard("cool", "high", 80, { fan_style: style });
    assert.equal(ringEnd(set), 426, style + ": a real speed still gets its marker");
  }
});

test("fan glyph: seated against the status word, whatever its length", () => {
  // CIRCULATING is half again as wide as IDLE, so a glyph at a fixed x sat clear of
  // one and straight through the other.
  const x = (c) => {
    const t = /translate\(([-0-9.]+)/.exec(c._refs.clover.getAttribute("transform") || "");
    return t ? Math.round(parseFloat(t[1])) : null;
  };
  const short = mCard("cool", "high", 80, { fan_clover: true });
  const long = mCard("fan_only", "high", 80, { fan_clover: true });
  assert.ok(x(short) !== null && x(long) !== null, "both are placed");
  assert.ok(x(long) <= x(short), "a longer status word pushes the glyph further left");
});

// ------------------------------------------------------------ refused commands --
// Measured on the hardware: in hvac auto the unit refuses set_fan_mode AND a write to
// the speed entity, and Home Assistant reports both as successful. Nothing rejects,
// so the failure path never runs, and the card showed the refused value confidently
// for the whole 5 second hold before snapping back with no explanation. It announced
// it to a screen reader too. A gesture the unit will refuse is not accepted now.

const down = (c, ring) => {
  const el = ring === "fan" ? c._refs.fanGrab : c._refs.drag;
  const e = { pointerId: 1, clientX: 10, clientY: 10, target: el, currentTarget: el,
    preventDefault() {}, stopPropagation() {} };
  c._ringPointerDown(e, ring);
  return c;
};

test("refused: a fan drag is not accepted at all when the unit will not take one", () => {
  const refuse = mCard("auto", "auto", 102);          // hvac auto, speed entity parked
  assert.equal(refuse._fanSettable(), false);
  down(refuse, "fan");
  assert.ok(!refuse._ringArmed, "the gesture never arms, so nothing is faked");

  const ok = mCard("cool", "auto", 102);              // cool: the unit does take one
  assert.equal(ok._fanSettable(), true);
  down(ok, "fan");
  assert.ok(ok._ringArmed, "and a settable fan still drags");
});

test("refused: the temp ring is untouched by the fan gate", () => {
  const c = mCard("auto", "auto", 102);
  down(c, "temp");
  assert.ok(c._ringArmed, "temperature is still settable in hvac auto");
});

test("refused: a unit reporting a real speed in hvac auto is still settable", () => {
  // the gate comes from the DEVICE, not from a vendor rule: report a speed and it
  // is taken at its word
  assert.equal(mCard("auto", "high", 60)._fanSettable(), true);
});

test("refused: the FAN rail cell and the clover use the same gate as the ring", () => {
  const c = mCard("auto", "auto", 102);
  c._fanCloverTap();
  assert.deepEqual(c._hass.calls, [], "no command for a control that cannot act");
});

test("keys: an arrow from a parked speed does not jump the fan to full", () => {
  // the speed entity parks at 101 on a 1..100 number, and seeding a nudge from it
  // made one ArrowUp compute 106 and clamp to max
  const c = mCard("cool", "auto", 101);
  const e = { key: "ArrowUp", preventDefault() {}, stopPropagation() {} };
  c._fanKeyDown(e, c._st("climate.ac"));
  const wrote = c._hass.calls.find((x) => x.service === "set_value");
  assert.ok(wrote, "it still writes something");
  assert.ok(wrote.data.value <= 20, "from the bottom, not from the park value: " + wrote.data.value);
});

test("no fan at all: no ring, no FAN cell, and the band is inert", () => {
  const bare = {
    "climate.ac": { entity_id: "climate.ac", state: "cool", attributes: {
      friendly_name: "AC", hvac_modes: ["off", "cool"],
      current_temperature: 78, temperature: 75, min_temp: 61, max_temp: 86 } },
  };
  const c = document.createElement("climate-cluster-card");
  c.setConfig({ entity: "climate.ac" });
  c.hass = makeHass(bare, { entities: { "climate.ac": { entity_id: "climate.ac", device_id: "d" } } });

  assert.equal(c._haveFan(), false);
  assert.equal(c._refs.faceFan.innerHTML, "", "nothing is drawn");
  assert.ok(!/FAN/.test(c._refs.faceRail.textContent), "and no dead cell offering it");
  down(c, "fan");
  assert.ok(!c._ringArmed, "the grab band does not claim the gesture either");
});

test("show_fan false also makes the drag band inert, not just invisible", () => {
  const c = mCard("cool", "high", 80, { show_fan: false });
  assert.equal(c._haveFan(), false);
  down(c, "fan");
  assert.ok(!c._ringArmed, "a hidden ring must not commit an invisible change");
});

test("a unit that dies keeps no live reading on the face", () => {
  const c = mCard("cool", "high", 80);
  assert.ok(c._refs.faceFan.innerHTML.length > 100, "alive: the face is drawn");

  c.hass = makeHass({ "climate.ac": { entity_id: "climate.ac", state: "unavailable",
    attributes: {} } }, { entities: mEnts });
  assert.equal(c._refs.face.style.display, "none",
    "the handoff face is not repainted on this path, so it must not stay on screen");
  assert.notEqual(c._refs.bigNum.style.display, "none", "the original dead face is back");
});

// ------------------------------------------------------ one gesture, one finger --
// The move and up listeners live on WINDOW, so they hear every pointer on the page.
// Nothing checked which one, and nothing checked whether the event was a release or
// a CANCEL, so three real gestures wrote a value the user never chose: a second
// finger lifting anywhere committed while the first was still down, a scroll that
// stole the touch committed whatever the finger was last over, and a unit that went
// unavailable mid-drag was written to anyway.

const downAt = (c, ring, id) => {
  const el = ring === "fan" ? c._refs.fanGrab : c._refs.drag;
  c._ringPointerDown({ pointerId: id, clientX: 10, clientY: 10, target: el,
    currentTarget: el, preventDefault() {}, stopPropagation() {} }, ring);
  return c;
};
// a drag that has crossed the threshold and is sitting on "high", without needing
// geometry happy-dom cannot give us
const heldAt = (c, name) => {
  c._dragging = true;
  c._fanPendingName = name;
  c._optimisticFanName = name;
  c._optimisticFanUntil = Date.now() + 5000;
  c._paintFanNamed(c._fanNamedModes(), name);
  return c;
};
const lift = (c, id, type) => c._ringPointerUp({ type: type || "pointerup", pointerId: id });

test("fingers: a second finger lifting does not end the drag or commit it", () => {
  const c = heldAt(downAt(liveCard(), "fan", 1), "high");

  lift(c, 2);
  assert.ok(c._ringArmed, "the drag belongs to finger 1 and is still running");
  assert.deepEqual(c._hass.calls, [], "and nothing was written");

  lift(c, 1);
  assert.ok(!c._ringArmed, "the finger that started it does end it");
  assert.equal(c._hass.calls.length, 1, "and that release commits");
  assert.equal(c._hass.calls[0].data.fan_mode, "high");
});

test("fingers: a second finger moving never reaches the drag", () => {
  // happy-dom hands back a zero-size rect, so the value a move computes is null
  // either way. What has to be asserted is that the stray pointer is turned away
  // BEFORE the drag runs, which is the thing the guard actually does.
  const c = heldAt(downAt(liveCard(), "fan", 1), "high");
  let applied = 0;
  c._applyRingDrag = () => { applied++; };

  c._ringPointerMove({ pointerId: 2, clientX: 900, clientY: 900 });
  assert.equal(applied, 0, "a stray pointer cannot drag the ring");

  c._ringPointerMove({ pointerId: 1, clientX: 900, clientY: 900 });
  assert.equal(applied, 1, "the finger that started it still does");
});

test("fingers: a second pointerdown does not restart the gesture on the other ring", () => {
  const c = heldAt(downAt(liveCard(), "fan", 1), "high");
  downAt(c, "temp", 2);
  assert.equal(c._active, "fan", "the first gesture still owns the rings");
  assert.equal(c._ringPointerId, 1);
  assert.equal(c._fanPendingName, "high", "and its pending value survived");
});

test("fingers: a cancel abandons the drag, it does not commit it", () => {
  const c = heldAt(downAt(liveCard(), "fan", 1), "high");
  assert.match(c._refs.faceRail.innerHTML, /100%/, "the face is showing the drag");

  lift(c, 1, "pointercancel");
  assert.deepEqual(c._hass.calls, [], "a cancel is the browser taking the gesture away");
  assert.ok(!c._ringArmed);
  assert.equal(c._optimisticFanName, null,
    "and the optimistic paint goes with it, or it sits there for the whole hold");
  assert.match(c._refs.faceRail.innerHTML, /33%/, "the face is back on what the unit reports");
});

test("fingers: a temp cancel does not write a setpoint either", () => {
  const c = downAt(liveCard(), "temp", 1);
  c._dragging = true;
  c._pendingTemp = 68;
  c._optimisticTarget = 68;
  c._optimisticUntil = Date.now() + 5000;

  lift(c, 1, "pointercancel");
  assert.deepEqual(c._hass.calls, []);
  assert.equal(c._optimisticTarget, null);
});

test("fingers: a unit that dies mid-drag is not written to on release", () => {
  const c = heldAt(downAt(liveCard(), "fan", 1), "high");
  c.hass = makeHass({ "climate.ac": { entity_id: "climate.ac", state: "unavailable",
    attributes: {} } }, { entities });

  lift(c, 1);
  assert.deepEqual(c._hass.calls, [], "there is nothing there to take it");
  assert.ok(!c._ringArmed);
});

test("fingers: a move after the unit dies abandons rather than painting on", () => {
  const c = heldAt(downAt(liveCard(), "fan", 1), "high");
  c.hass = makeHass({ "climate.ac": { entity_id: "climate.ac", state: "unavailable",
    attributes: {} } }, { entities });

  c._ringPointerMove({ pointerId: 1, clientX: 200, clientY: 40 });
  assert.ok(!c._ringArmed, "the gesture is dropped at the first move after the death");
  assert.deepEqual(c._hass.calls, []);
});

test("fingers: a plain drag still commits exactly once", () => {
  const c = heldAt(downAt(liveCard(), "fan", 1), "medium");
  lift(c, 1);
  assert.equal(c._hass.calls.length, 1);
  assert.equal(c._hass.calls[0].data.fan_mode, "medium");
  lift(c, 1);
  assert.equal(c._hass.calls.length, 1, "a second up on a finished drag writes nothing");
});

test("fingers: a temp drag still commits on release", () => {
  // the commit block was rewritten to read the gesture BEFORE the teardown clears
  // it, so the ordinary path needs an assertion of its own
  const c = downAt(liveCard(), "temp", 1);
  c._dragging = true;
  c._pendingTemp = 71;

  lift(c, 1);
  assert.equal(c._hass.calls.length, 1);
  assert.equal(c._hass.calls[0].service, "set_temperature");
  assert.equal(c._hass.calls[0].data.temperature, 71);
  assert.equal(c._active, null, "and the gesture is torn down after the write");
});
