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
