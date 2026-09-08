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
