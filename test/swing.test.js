// Swing-write regression tests. The invariant for a climate entity is simple:
// the value handed to climate.set_swing_mode must be a member of that entity's own
// swing_modes. For switch-backed swing (Midea), the write must target the switch,
// never climate.set_swing_mode.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass, makeCard } from "./helpers.js";
import * as melcloud from "./fixtures/melcloud.js";
import * as withOff from "./fixtures/climate_swing_with_off.js";
import * as midea from "./fixtures/midea.js";

test("melcloud (vane positions, no off member): swing writes a real swing_modes member, never literal off", () => {
  const modes = melcloud.states[melcloud.config.entity].attributes.swing_modes;
  const hass = makeHass(melcloud.states, { entities: melcloud.entities });
  const card = makeCard(melcloud.config, hass);

  card._swingToggle();

  assert.equal(hass.calls.length, 1, "exactly one service call");
  const c = hass.calls[0];
  assert.equal(c.domain, "climate");
  assert.equal(c.service, "set_swing_mode");
  const sent = c.data.swing_mode;
  assert.notEqual(String(sent).toLowerCase(), "off", "must never send the literal off");
  assert.ok(modes.includes(sent), `sent value ${JSON.stringify(sent)} must be a member of ${JSON.stringify(modes)}`);
});

test("climate with a real off member: swing toggles between the real off and a real on member", () => {
  const ent = withOff.config.entity;
  const modes = withOff.states[ent].attributes.swing_modes;

  // Current swing_mode is "off" -> tapping should turn swing ON with a real member.
  {
    const hass = makeHass(withOff.states, { entities: withOff.entities });
    const card = makeCard(withOff.config, hass);
    card._swingToggle();
    assert.equal(hass.calls.length, 1);
    const sent = hass.calls[0].data.swing_mode;
    assert.equal(hass.calls[0].service, "set_swing_mode");
    assert.ok(modes.includes(sent), `${JSON.stringify(sent)} must be a member of swing_modes`);
    assert.notEqual(String(sent).toLowerCase(), "off", "turning on must not send off");
  }

  // Current swing_mode is a real ON member -> tapping should turn swing OFF with
  // the entity's real off member.
  {
    const onStates = structuredClone(withOff.states);
    onStates[ent].attributes.swing_mode = "vertical";
    const hass = makeHass(onStates, { entities: withOff.entities });
    const card = makeCard(withOff.config, hass);
    card._swingToggle();
    assert.equal(hass.calls.length, 1);
    const sent = hass.calls[0].data.swing_mode;
    assert.equal(hass.calls[0].service, "set_swing_mode");
    assert.ok(modes.includes(sent), `${JSON.stringify(sent)} must be a member of swing_modes`);
    assert.equal(String(sent).toLowerCase(), "off", "turning off must land on the real off member");
  }
});

test("midea (switch-backed swing): swing toggles the discovered switch, not climate.set_swing_mode", () => {
  const hass = makeHass(midea.states, { entities: midea.entities });
  const card = makeCard(midea.config, hass);

  card._swingToggle();

  assert.equal(hass.calls.length, 1, "exactly one service call");
  const c = hass.calls[0];
  assert.equal(c.domain, "switch", "Midea swing must drive the switch, not climate");
  assert.ok(c.service === "turn_on" || c.service === "turn_off", `switch service was ${c.service}`);
  assert.equal(c.data.entity_id, "switch.midea_ac_swing_vertical");
  assert.ok(
    !hass.calls.some((x) => x.domain === "climate" && x.service === "set_swing_mode"),
    "Midea must never call climate.set_swing_mode",
  );
});
