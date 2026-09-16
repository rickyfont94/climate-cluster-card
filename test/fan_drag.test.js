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

/* The animated fan styles draw their flow in an HTML overlay the compositor rotates,
   one <svg class="ct-fanband"> per band, clipped to the reading by a CSS polygon on the
   .ct-fanflow wrapper. These read that structure. */
function bands(card) {
  return [...card._refs.fanLayer.querySelectorAll("svg.ct-fanband")];
}
function fanWindow(card) {
  const flow = card._refs.fanLayer.querySelector(".ct-fanflow");
  return flow ? (flow.style.getPropertyValue("clip-path") || flow.getAttribute("style") || "") : "";
}

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

/* The invariant is that a full render puts the ring back on the COMMITTED reading,
   whatever the drag left on screen. It used to be reached by dropping the cache key so
   the next render restrung the whole ring. The animated styles no longer restring on a
   reading at all, because that was killing 21 SMIL timelines every time the unit
   reported a new speed, so the same invariant is now reached by moving the clip window.
   Assert the invariant, not the mechanism: the window has to come back. */
test("fan drag: a full render puts the ring back on the committed reading", () => {
  const card = liveCard();
  const win = () => fanWindow(card);
  const atRest = win();
  assert.ok(atRest.startsWith("polygon("), "the flow is clipped to the reading");

  card._paintFanNamed(["low", "medium", "high"], "high");
  assert.notEqual(win(), atRest, "the window follows the finger");

  card._paintFace();
  assert.equal(win(), atRest, "and a render off committed state puts it back");
});

test("fan drag: original has no overlay, so it still drops the key and restrings", () => {
  const card = liveCard({ fan_style: "original" });
  assert.equal(card._refs.fanLayer.innerHTML, "",
    "original is the untouched pre-2.3.0 arc, with nothing in the overlay");
  assert.equal(card._refs.fanLayer.classList.contains("on"), false);
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
/* "The ring is drawn" is style-aware now. original draws its whole arc in the face
   SVG. silk and breeze draw only the track and the marker there, and their flow is the
   rotating bands in the overlay, so for those the overlay has to be on and populated. */
const ringDrawn = (c) => /stroke-width/.test(c._refs.faceFan.innerHTML) &&
  (c._refs.fanLayer.classList.contains("on")
    ? bands(c).length >= 3
    : c._refs.faceFan.innerHTML.length > 200);

test("fan ring: ALWAYS drawn, in every mode that can carry a fan", () => {
  for (const hvac of ["cool", "fan_only", "auto", "dry", "heat"]) {
    const c = mCard(hvac, "auto", 102);
    assert.ok(ringDrawn(c),
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
    assert.ok(ringDrawn(unset), style + ": the ring is still drawn");
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

// ------------------------------------------------- named fan: one convention ----
// The card held two ideas of where a named stop sits on the ring. The settled
// reading, and the "33%" the rail prints under FAN, put stop i at (i+1)/n. The PICK
// put it at i/(n-1). They agree only on the top stop, so the marker jumped forward
// the instant the finger lifted: the finger chose by one rule, the ring drew by the
// other.

// _eventToFrac is the geometry and happy-dom cannot lay anything out, so it is
// stubbed; what these drive is the mapping on top of it.
const pickAt = (c, f, n) => { c._eventToFrac = () => f; return c._eventToFanIndex({}, n); };
const drawnFrac = (c, names, name) => {
  c._paintFanNamed(names, name);
  return Number(/(\d+)%/.exec(c._refs.faceRail.innerHTML)[1]) / 100;
};

test("named fan: the stop under the finger is the stop the ring draws there", () => {
  const c = liveCard();
  const names = c._fanNamedModes();
  assert.deepEqual(names, ["low", "medium", "high"]);

  for (let i = 0; i < names.length; i++) {
    const f = drawnFrac(c, names, names[i]);
    assert.equal(pickAt(c, f, names.length), i,
      names[i] + " is drawn at " + Math.round(f * 100) + "%, so a finger there must pick it");
  }
});

test("named fan: the ends of the arc are the lowest and the highest speed", () => {
  const c = liveCard();
  assert.equal(pickAt(c, 0, 3), 0, "the start of the arc is the slowest stop");
  assert.equal(pickAt(c, 1, 3), 2, "and the end is the fastest");
});

test("named fan: the boundary sits midway between two drawn stops", () => {
  const c = liveCard();
  // low is drawn at 33 and medium at 67, so 50 is the changeover
  assert.equal(pickAt(c, 0.49, 3), 0, "just under is still low");
  assert.equal(pickAt(c, 0.51, 3), 1, "just over is medium");
  // medium 67, high 100 -> 83.5
  assert.equal(pickAt(c, 0.82, 3), 1);
  assert.equal(pickAt(c, 0.85, 3), 2);
});

test("named fan: the slowest speed still draws a ring, it is not empty", () => {
  const c = liveCard();
  assert.ok(drawnFrac(c, c._fanNamedModes(), "low") > 0,
    "a running fan on its lowest setting is not a fan that is off");
});

test("named fan: a two-stop and a one-stop unit round-trip too", () => {
  const c = liveCard();
  for (const n of [1, 2, 4, 6]) {
    for (let i = 0; i < n; i++) {
      const f = c._fanNamedFrac(i, n);
      assert.equal(c._fanFracToIndex(f, n), i, "n=" + n + " stop " + i);
    }
  }
});

test("named fan: a numeric value picks the name nearest it, by the same rule", () => {
  // the auto-pull turns a speed number into a fan_mode; it has to land on the same
  // stop a finger at that position would
  const c = mCard("cool", "auto", 50);
  const names = c._fanNamedModes();            // silent low medium high full
  const r = c._fanNumRange();
  for (let i = 0; i < names.length; i++) {
    const f = c._fanNamedFrac(i, names.length);
    const v = r.min + f * (r.max - r.min);
    assert.equal(c._nearestFanMode(v), names[i],
      names[i] + " is drawn at " + Math.round(f * 100) + "%, so " + Math.round(v) + " is that mode");
  }
});

// -------------------------------------------------- free value vs named stops ---
// Measured on the hardware: all five units expose number.<id>_fan_speed declaring
// min 1, max 100, step 1, so the ring really is a free 1..100 there and must not be
// quantised to the five names underneath. A unit with ONLY named modes is the
// opposite case: set_fan_mode takes a name, so showing 47% and sending "medium"
// would be the card claiming a value the unit cannot hold.

test("free drag: a 1..100 speed entity gives a free value, not a bucket", () => {
  const c = mCard("cool", "auto", 40);          // number.ac_fan_speed, min 1 max 100
  assert.ok(c._fanUsesNumber(), "this unit is driven by the number, not by the names");
  assert.deepEqual(c._fanNumRange(), { min: 1, max: 100, step: 1 });

  // sample the arc finely: every integer from 1 to 100 has to be reachable, which
  // is what "free" means here. Five named modes would give five values.
  const seen = new Set();
  for (let i = 0; i <= 1000; i++) seen.add(c._snapFanValue(i / 1000));
  assert.equal(seen.size, 100, "one hundred distinct speeds, not five buckets");
  assert.equal(Math.min(...seen), 1);
  assert.equal(Math.max(...seen), 100);
  assert.equal(c._snapFanValue(0), 1);
  assert.equal(c._snapFanValue(0.47), 48);      // 1 + .47*99
  assert.equal(c._snapFanValue(1), 100);
});

test("free drag: the parked value does not narrow the range it can be dragged to", () => {
  // the unit parks the number OUT of its own range (101, 102) to mean "no speed set";
  // that is a reading, not a new maximum
  const c = mCard("cool", "auto", 102);
  assert.deepEqual(c._fanNumRange(), { min: 1, max: 100, step: 1 });
  assert.equal(c._snapFanValue(1), 100, "a drag to the end is still 100, not 102");
});

test("free drag: a unit with only names snaps to its names, it does not fake a percent", () => {
  const c = liveCard();                          // fan_modes only, no number entity
  assert.ok(!c._fanUsesNumber());
  const names = c._fanNamedModes();
  for (const f of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const i = pickAt(c, f, names.length);
    assert.ok(names[i], f + " lands on a mode this unit really has: " + names[i]);
  }
});

/* The bug this locks: the fan ring was keyed on the READING, so every speed report
   from the unit rebuilt it. Measured on the live house, one Midea reports a new fan
   speed every 6.9 seconds against a 2.6 second silk cycle, and a probe in headless
   Chrome showed 0 of 21 SMIL timelines surviving a single tick from 70 to 71. Every
   puff snapped back into phase twice a minute. The user's words were "a bit jumpy and
   not constant smooth flow".

   Node identity is the whole assertion. A ring that merely LOOKS right after a state
   push can still have been destroyed and recreated, and that is exactly what the eye
   was catching. */
function pushFan(card, mode) {
  const next = JSON.parse(JSON.stringify(states));
  next["climate.ac"].attributes.fan_mode = mode;
  card.hass = makeHass(next, { entities });
}

for (const style of ["silk", "breeze"]) {
  test(`${style}: a new fan reading moves the window and keeps every animation alive`, () => {
    const card = liveCard({ fan_style: style });
    const before = bands(card);
    assert.ok(before.length >= 3, `${style} draws rotating bands to protect`);
    assert.ok(card._refs.fanLayer.classList.contains("on"), "and the overlay is shown");
    const winBefore = fanWindow(card);

    pushFan(card, "high");

    const after = bands(card);
    assert.equal(after.length, before.length, "same number of bands");
    for (let i = 0; i < before.length; i++) {
      assert.equal(after[i], before[i],
        "the SAME node object, not an equal-looking replacement");
    }
    assert.notEqual(fanWindow(card), winBefore,
      "but the clip window really did move to the new reading");
  });
}

test("silk draws the flow across the whole ring, not up to the reading", () => {
  const low = liveCard({ fan_style: "silk" });
  const high = liveCard({ fan_style: "silk" });
  pushFan(high, "high");
  const count = (c) => bands(c).map((b) => b.querySelectorAll("path").length);
  assert.deepEqual(count(high), count(low),
    "the puff count cannot depend on the reading, or the ring rebuilds when it changes");
  assert.deepEqual(count(low), [12, 16, 8], "a full circle on each band");
});

/* fanSilk never reads its mode argument: the puffs are a fixed gradient and their
   opacity comes from whether a speed is set. Keying the ring on the mode therefore
   threw away 21 running timelines to redraw identical pixels. It is not a rare event:
   _faceMode maps unavailable to "off", and one of this house's units went unavailable
   34 times in a day. breeze does colour its ribbons by mode, so it must still rebuild. */
test("silk keeps its flow across a mode change, breeze redraws because it must", () => {
  const bymode = (style, mode) => {
    const card = liveCard({ fan_style: style });
    const nodes = () => bands(card);
    const before = nodes();
    const next = JSON.parse(JSON.stringify(states));
    next["climate.ac"].attributes.hvac_modes = ["off", "cool", "dry"];
    next["climate.ac"].state = mode;
    card.hass = makeHass(next, { entities });
    return { before, after: nodes() };
  };

  const silk = bymode("silk", "dry");
  assert.ok(silk.before.length >= 3);
  assert.equal(silk.after[0], silk.before[0], "silk draws no mode ink, so it survives");

  const breeze = bymode("breeze", "dry");
  assert.ok(breeze.before.length >= 3);
  assert.notEqual(breeze.after[0], breeze.before[0],
    "breeze strokes its ribbons in the mode ink, so it has to redraw");
});

/* The flow is a lattice the compositor rotates, so the property that makes it
   seamless is that the lattice closes on itself: the puff count on each band is a
   whole number of pitches around the circle AND a whole number of length cycles, so
   any rotation lands on an identical ring. Puffs must also stay shorter than the pitch,
   or neighbours touch and the grouped blur and alpha stop matching per-puff ones. */
test("silk: each band is a lattice that closes on itself, so rotation is seamless", () => {
  const card = liveCard({ fan_style: "silk" });
  const bs = bands(card);
  const counts = bs.map((b) => b.querySelectorAll("path").length);
  assert.deepEqual(counts, [12, 16, 8]);
  for (const c of counts) assert.equal(c % 4, 0, "a whole number of length cycles");
  const pitches = [30, 22.5, 45], segs = [22, 15, 28];
  pitches.forEach((pitch, i) => assert.ok(segs[i] * 1.28 < pitch,
    "band " + i + ": longest puff " + (segs[i] * 1.28) + " must clear pitch " + pitch));
  // every band carries its own period, and they differ, which is the parallax
  const durs = bs.map((b) => (b.getAttribute("style") || "").match(/animation-duration:([\d.]+)s/)[1]);
  assert.equal(new Set(durs).size, 3, "three distinct periods: " + durs.join(", "));
});

/* Same bug class as the fan ring, three inches away. The status dot breathes on a 1.9s
   CSS animation inside the faceCenter string, and _paintFaceMoving rewrote that string
   on every render. set hass renders on EVERY state change anywhere in Home Assistant,
   so on a busy instance the dot restarted well inside 1.9s and never finished a breath. */
test("the status dot survives a state change that does not touch this card", () => {
  const card = liveCard();
  const dot = () => card._refs.faceCenter.querySelector("[style*='animation']");
  const before = dot();
  assert.ok(before, "the status cluster carries an animated node");

  // a push that changes nothing this card draws, which is the common case in a house
  const next = JSON.parse(JSON.stringify(states));
  next["sensor.unrelated"] = { entity_id: "sensor.unrelated", state: "1", attributes: {} };
  card.hass = makeHass(next, { entities });
  assert.equal(dot(), before, "the SAME node, so its 1.9s breath is uninterrupted");

  // and a push that DOES change it must still redraw
  const moved = JSON.parse(JSON.stringify(states));
  moved["climate.ac"].attributes.temperature = 71;
  card.hass = makeHass(moved, { entities });
  assert.notEqual(dot(), before, "a real change still repaints the cluster");
});

/* The stylesheet's reduced-motion rule uses display:none on <animate>, which does
   nothing: display does not apply to SVG animation elements, so the timeline runs
   anyway. silk is the only style in the file that uses <animate>, so it was exactly the
   one the escape hatch missed. The decision moved into _faceState, where the style is
   picked, because that is the only place SMIL can actually be prevented. */
test("prefers-reduced-motion drops silk to the static ring", () => {
  const real = globalThis.window.matchMedia;
  globalThis.window.matchMedia = (q) => ({
    matches: /prefers-reduced-motion/.test(q), media: q,
    addEventListener() {}, removeEventListener() {},
  });
  try {
    const card = liveCard({ fan_style: "silk" });
    assert.equal(bands(card).length, 0,
      "no rotating band may exist for a reader who asked for less motion");
    assert.equal(card._refs.fanLayer.classList.contains("on"), false,
      "and it really is the original ring, which has no overlay");
  } finally {
    globalThis.window.matchMedia = real;
  }
});

test("with no matchMedia at all, the configured style still wins", () => {
  const real = globalThis.window.matchMedia;
  delete globalThis.window.matchMedia;
  try {
    const card = liveCard({ fan_style: "silk" });
    assert.ok(bands(card).length > 0,
      "a missing media query means no preference expressed, never reduce");
  } finally {
    globalThis.window.matchMedia = real;
  }
});

/* The cost guard. Measured on five idle cards in headless Chrome, SMIL "d" morphing
   in the face held the renderer at 30 percent of a core and the raster process at 90;
   a stroke-dashoffset animation, 16 and 92; the static face, 3 and 12. Any per-frame
   change to SVG geometry repaints the whole layer, so the animated styles must put
   NOTHING that moves inside the face SVG. Their motion is a CSS transform on the
   overlay bands, which the compositor carries without a repaint: 2.5 and 14. */
for (const style of ["silk", "breeze"]) {
  test(`${style}: nothing in the face SVG animates, the overlay carries the motion`, () => {
    const card = liveCard({ fan_style: style });
    const face = card._refs.faceFan.innerHTML;
    assert.doesNotMatch(face, /<animate/, "no SMIL in the face");
    assert.doesNotMatch(face, /animation\s*:/, "no CSS animation on face geometry either");
    for (const b of bands(card)) {
      assert.match(b.getAttribute("style") || "", /animation-duration:\d/, "each band spins");
      assert.equal(b.querySelectorAll("animate").length, 0, "and spins as a whole, not by morphing");
    }
  });
}

/* Measured in the live dashboard: _siblings ran about 65 times per render and walked
   the whole entity registry fifteen times per call. On 2,489 registry entries that was
   110 ms per render per card, twice a second, and every animation on the page froze for
   it. It reads only the registry and the config, and the frontend keeps the same
   entities object across state pushes, so the answer is cached on those references. */
test("_siblings is computed once per registry, not once per call", () => {
  const card = liveCard();
  const a = card._siblings();
  assert.equal(card._siblings(), a, "same registry, same config: the same object back");

  // a state push: new hass, SAME entities object, as the frontend does
  const h2 = makeHass(JSON.parse(JSON.stringify(states)), { entities });
  h2.entities = card._hass.entities;
  card.hass = h2;
  assert.equal(card._siblings(), a, "a state push must not rescan the registry");

  // a registry change: a new entities object
  card.hass = makeHass(states, { entities: { ...entities } });
  assert.notEqual(card._siblings(), a, "a new registry object is walked again");
  assert.deepEqual(card._siblings(), a, "and finds the same siblings");

  // a new config is a new answer too
  card.setConfig({ entity: "climate.ac", fan_style: "silk" });
  assert.notEqual(card._siblings(), a);
});

/* The other half of that same promise, and the half that was missing.

   Keeping the bands alive across a speed change is right, but the READING is what
   sets how fast they turn: silkLayer and breezeLayer bake the period into each band's
   inline animation-duration from fanPeriod(fanPct) at build time. Because the cache
   key deliberately excludes the numeric reading, nothing rewrote those durations, so
   a card that mounted at 60 percent kept turning at the 60 percent rate no matter
   what the unit did afterwards. Measured in headless Chrome before the fix: pushing
   a Midea from 60 to 100 left all four computed durations byte-identical while the
   clip window and the handle both moved. The ring said "faster" and did not move any
   faster, which is the entire reason the animation exists.

   The numbers below are the table, not a re-derivation: fanPeriod(p) = max(0.85,
   3.4 - p/100 x 2.5), breeze multiplies it by k x 11.84 with k = 1.22, 1, 0.78, 1.45,
   and silk by rev = 16.94, 32.34, 9.69. A change to either table has to come here. */
const durations = (card) => bands(card).map((b) => b.style.animationDuration);

test("breeze: the flow speeds up when the reading does, without a rebuild", () => {
  const card = liveCard({ fan_style: "breeze" });
  const nodes = bands(card);
  // fan_mode "low" of [low, medium, high] is stop 1 of 3 -> 33 percent
  assert.equal(card._facePct(), 33);
  assert.deepEqual(durations(card), ["37.20s", "30.49s", "23.78s", "44.21s"]);

  pushFan(card, "high");                                   // -> 100 percent

  assert.equal(card._facePct(), 100);
  assert.deepEqual(durations(card), ["13.00s", "10.66s", "8.31s", "15.45s"],
    "every band turns at the new speed");
  assert.deepEqual(bands(card), nodes,
    "and they are the SAME nodes, so no timeline was destroyed to do it");
});

test("silk: same, on its own three bands", () => {
  const card = liveCard({ fan_style: "silk" });
  assert.deepEqual(durations(card), ["43.62s", "83.28s", "24.95s"]);
  pushFan(card, "high");
  assert.deepEqual(durations(card), ["15.25s", "29.11s", "8.72s"]);
});

test("the flow speeds up under the finger too, not only on release", () => {
  const card = liveCard({ fan_style: "breeze" });
  const before = durations(card);
  card._paintFanNamed(["low", "medium", "high"], "high");   // one pointermove
  const during = durations(card);
  assert.notDeepEqual(during, before, "the drag changes the rate as it goes");
  assert.ok(parseFloat(during[0]) < parseFloat(before[0]), "and faster means shorter");
});

test("auto has no reading, so it falls back to the slow base period", () => {
  const card = liveCard({ fan_style: "breeze" });
  pushFan(card, "auto");
  assert.equal(card._facePct(), null);
  // fanPeriod(null) = 3.4
  assert.deepEqual(durations(card), ["49.11s", "40.26s", "31.40s", "58.37s"]);
});

test("a reading that did not change rewrites nothing", () => {
  const card = liveCard({ fan_style: "breeze" });
  const before = durations(card);
  // an unrelated state push: same fan_mode, new room reading
  const next = JSON.parse(JSON.stringify(states));
  next["climate.ac"].attributes.current_temperature = 81;
  card.hass = makeHass(next, { entities });
  assert.deepEqual(durations(card), before);
});

/* getAnimations is how the phase is carried across a speed change, and it does not
   exist in this DOM, on older WebKit, or in a webview. The duration still has to
   land: losing the phase is a single jump, losing the speed is the bug above. */
test("no getAnimations means a plain duration write, never a throw", () => {
  const card = liveCard({ fan_style: "breeze" });
  assert.equal(typeof bands(card)[0].getAnimations, "undefined",
    "this DOM really is the no-WAAPI case, so the guard is under test");
  assert.doesNotThrow(() => pushFan(card, "high"));
  assert.deepEqual(durations(card), ["13.00s", "10.66s", "8.31s", "15.45s"]);
});

test("original has no bands to re-time, and asking for its periods is empty", () => {
  const card = liveCard({ fan_style: "original" });
  assert.equal(card._refs.fanLayer.querySelectorAll(".ct-fanband").length, 0);
  assert.doesNotThrow(() => pushFan(card, "high"));
});
