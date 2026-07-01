// Swing position-picker + optimistic-accent tests (v1.2.3 swing UX). The invariants:
//   - the long-press picker lists the entity's OWN swing_modes (climate branch only);
//   - selecting an option writes exactly that member via climate.set_swing_mode;
//   - a tap-cycle and a picker-select both update the displayed position optimistically,
//     before the entity round-trips, then reconcile to live state;
//   - none of this touches the switch-backed (Midea) branch: no swing_modes list, no
//     picker, and never a climate.set_swing_mode call.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass, makeCard } from "./helpers.js";
import * as melcloud from "./fixtures/melcloud.js";
import * as withOff from "./fixtures/climate_swing_with_off.js";
import * as midea from "./fixtures/midea.js";

test("picker: _swingModesList exposes the climate entity's own swing_modes", () => {
  const hass = makeHass(melcloud.states, { entities: melcloud.entities });
  const card = makeCard(melcloud.config, hass);
  assert.deepEqual(
    card._swingModesList(),
    melcloud.states[melcloud.config.entity].attributes.swing_modes,
    "the picker reads the entity's real swing_modes",
  );
});

test("picker: selecting a specific option writes exactly that member", () => {
  const hass = makeHass(melcloud.states, { entities: melcloud.entities });
  const card = makeCard(melcloud.config, hass);

  card._pickSwingMode("3");

  assert.equal(hass.calls.length, 1, "exactly one service call");
  const c = hass.calls[0];
  assert.equal(c.domain, "climate");
  assert.equal(c.service, "set_swing_mode");
  assert.equal(c.data.entity_id, "climate.melcloud_ac");
  assert.equal(c.data.swing_mode, "3", "writes the exact member the user picked, no cycling");
});

test("picker: an option outside swing_modes is rejected, no service call", () => {
  const hass = makeHass(melcloud.states, { entities: melcloud.entities });
  const card = makeCard(melcloud.config, hass);

  card._pickSwingMode("not-a-real-mode");

  assert.equal(hass.calls.length, 0, "a value outside swing_modes never reaches the service");
});

test("optimistic: a picker-select reflects the position + accent immediately, then reconciles", () => {
  // Start from a real off member so the accent has somewhere to flip TO.
  const st = structuredClone(withOff.states);
  const ent = withOff.config.entity; // swing_mode currently "off" -> chip reads OFF
  const hass = makeHass(st, { entities: withOff.entities });
  const card = makeCard(withOff.config, hass);

  assert.equal(card._featureOn("swing"), false, "starts OFF (live swing_mode is off)");

  card._pickSwingMode("vertical");

  // BEFORE any state round-trip: label + accent already show the picked position.
  assert.equal(card._swingEffMode(), "vertical", "effective position is optimistic immediately");
  assert.equal(card._swingLabelText(), "vertical", "chip label shows the picked position at once");
  assert.equal(card._featureOn("swing"), true, "accent lights immediately, no wait for the device");
  assert.ok(card._optSwingPos && card._optSwingPos.mode === "vertical", "an optimistic hold is recorded");

  // The device confirms: live swing_mode catches up, the optimistic hold clears.
  st[ent].attributes.swing_mode = "vertical";
  card._reconcileOptimistic(st[ent].attributes);

  assert.equal(card._optSwingPos, null, "optimistic hold cleared once live state matches");
  assert.equal(card._swingEffMode(), "vertical", "still reads the position, now from live state");
  assert.equal(card._featureOn("swing"), true, "accent stays lit on the reconciled live value");
});

test("optimistic: a tap-cycle updates the label before the state round-trips", () => {
  const modes = melcloud.states[melcloud.config.entity].attributes.swing_modes; // Auto,1..5,Swing
  const hass = makeHass(melcloud.states, { entities: melcloud.entities });
  const card = makeCard(melcloud.config, hass);

  // Live swing_mode is "Auto" (index 0). One tap-cycle advances to the next member.
  card._swingToggle();

  const sent = hass.calls[0].data.swing_mode;
  assert.ok(modes.includes(sent), "cycle writes a real member");
  assert.equal(sent, "1", "advances Auto -> 1");
  assert.equal(card._swingEffMode(), "1", "label tracks the optimistic target immediately");
  assert.equal(card._swingLabelText(), "1", "chip caption shows the new position at once");
});

test("optimistic: rapid tap-cycles keep advancing off the optimistic position", () => {
  const hass = makeHass(melcloud.states, { entities: melcloud.entities });
  const card = makeCard(melcloud.config, hass);

  // Two quick taps with NO live update between them: the second cycle must read the
  // optimistic position (1), not the stale live value (Auto), so it advances to 2.
  card._swingToggle();
  card._swingToggle();

  assert.equal(hass.calls.length, 2);
  assert.equal(hass.calls[0].data.swing_mode, "1");
  assert.equal(hass.calls[1].data.swing_mode, "2", "second tap advances off the optimistic position");
  assert.equal(card._swingEffMode(), "2");
});

test("label: an off swing_mode falls back to the localized SWING word", () => {
  const hass = makeHass(withOff.states, { entities: withOff.entities });
  const card = makeCard(withOff.config, hass);
  // swing_mode is "off" -> the caption is the plain SWING word, not the literal "off".
  assert.equal(card._swingLabelText(), "SWING");
});

test("midea (switch branch): no swing_modes list, picker inert, never climate.set_swing_mode", () => {
  const hass = makeHass(midea.states, { entities: midea.entities });
  const card = makeCard(midea.config, hass);

  assert.deepEqual(card._swingModesList(), [], "switch-backed swing exposes no member list");
  assert.equal(card._swingLabelText(), "SWING", "switch-backed swing keeps the plain SWING label");

  // Opening the picker or forcing a pick must not drive the climate service.
  card._openSwingPicker();
  card._pickSwingMode("vertical"); // "vertical" IS a midea climate swing_mode attr, still ignored
  assert.ok(
    !hass.calls.some((x) => x.domain === "climate" && x.service === "set_swing_mode"),
    "the switch branch never calls climate.set_swing_mode",
  );
});

test("failure: a rejected picker-select reverts the optimistic position", () => {
  const st = structuredClone(melcloud.states);
  const hass = makeHass(st, { entities: melcloud.entities });
  // Make the service reject so the failure-revert path runs.
  hass.callService = (domain, service, data) => {
    hass.calls.push({ domain, service, data });
    return Promise.reject(new Error("device offline"));
  };
  const card = makeCard(melcloud.config, hass);

  card._pickSwingMode("Swing");
  assert.equal(card._optSwingPos.mode, "Swing", "optimistic hold set on the pick");

  // The _svc .catch() fires _revertToggle("swing") on the next microtask.
  return Promise.resolve().then(() => {
    assert.equal(card._optSwingPos, null, "a rejected call drops the optimistic position");
  });
});
