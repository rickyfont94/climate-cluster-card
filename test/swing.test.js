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

// ---------------------------------------------------------------- group card --
// The same invariant, on the other card. The dial was taught to resolve the value
// out of swing_modes; the group card was not, and kept sending a literal lowercase
// "off" (and a literal "on" when it found no off-like member). Neither is a member
// of a MelCloud vane list, and "off" is not a member of a list that spells it "Off"
// either, so Home Assistant rejected the call and the room's swing button did
// nothing at all. These drive a real click on the rendered control.
import { makeGroup, zone, entities as zEntities, openSheet } from "./zone_fixture.js";

function swingClick(over) {
  const st = { "climate.sala": zone("climate.sala", over) };
  // The hardware toggles live in the room sheet, so open it first, the same way a
  // user reaches them.
  const el = openSheet(makeGroup({ entities: ["climate.sala"] },
    makeHass(st, { entities: { "climate.sala": zEntities["climate.sala"] } })), 0);
  const btn = el.shadowRoot.querySelector('[data-ztog="swing"]');
  assert.ok(btn, "the room draws a swing control");
  btn.dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  return { el, calls: el._hass.calls, modes: over.swing_modes };
}
const sentSwing = (r) => {
  assert.equal(r.calls.length, 1, "exactly one service call");
  assert.equal(r.calls[0].service, "set_swing_mode");
  return r.calls[0].data.swing_mode;
};

test("group: a vane-position list with no off member cycles, it never invents one", () => {
  const modes = ["Auto", "1", "2", "3", "4", "5", "Swing"];
  const r = swingClick({ swing_modes: modes, swing_mode: "Auto" });
  const sent = sentSwing(r);
  assert.ok(modes.includes(sent), `${JSON.stringify(sent)} must be a member of ${JSON.stringify(modes)}`);
  assert.equal(sent, "1", "and it advances to the next position");
});

test("group: a second tap advances a second position, it does not resend the first", () => {
  const modes = ["Auto", "1", "2", "3", "4", "5", "Swing"];
  const r = swingClick({ swing_modes: modes, swing_mode: "Auto" });
  // the unit has not reported back yet, which is the whole point
  r.el.shadowRoot.querySelector('[data-ztog="swing"]')
    .dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  assert.equal(r.calls.length, 2);
  assert.deepEqual(r.calls.map((c) => c.data.swing_mode), ["1", "2"]);
});

test("group: a capitalised Off is matched case-insensitively and sent with its own casing", () => {
  const modes = ["Off", "Vertical", "Horizontal"];
  // currently swinging -> the tap turns it off, and must send "Off", not "off"
  const r = swingClick({ swing_modes: modes, swing_mode: "Vertical" });
  const sent = sentSwing(r);
  assert.equal(sent, "Off", "the entity's own casing, or the call is rejected");
  assert.ok(modes.includes(sent));
});

test("group: an all-caps list is handled the same way in both directions", () => {
  const modes = ["OFF", "SWING"];
  assert.equal(sentSwing(swingClick({ swing_modes: modes, swing_mode: "OFF" })), "SWING");
  assert.equal(sentSwing(swingClick({ swing_modes: modes, swing_mode: "SWING" })), "OFF");
});

test("group: a plain lowercase list still toggles the way it always did", () => {
  const modes = ["off", "vertical", "horizontal", "both"];
  assert.equal(sentSwing(swingClick({ swing_modes: modes, swing_mode: "off" })), "vertical");
  assert.equal(sentSwing(swingClick({ swing_modes: modes, swing_mode: "vertical" })), "off");
});

test("group: no swing_modes at all means no call, not a guess", () => {
  const st = { "climate.sala": zone("climate.sala", { swing_modes: undefined, swing_mode: undefined }) };
  delete st["climate.sala"].attributes.swing_modes;
  delete st["climate.sala"].attributes.swing_mode;
  const el = openSheet(makeGroup({ entities: ["climate.sala"] },
    makeHass(st, { entities: { "climate.sala": zEntities["climate.sala"] } })), 0);
  const btn = el.shadowRoot.querySelector('[data-ztog="swing"]');
  if (btn) btn.dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  assert.deepEqual(el._hass.calls, [], "nothing legal to send, so nothing is sent");
});

test("group: every value either card can send is drawn from the entity's own list", () => {
  // The two cards share one resolver now. Walk the shapes that broke it and assert
  // the membership invariant on both, so a future edit cannot split them again.
  const shapes = [
    { swing_modes: ["off", "vertical"], swing_mode: "off" },
    { swing_modes: ["off", "vertical"], swing_mode: "vertical" },
    { swing_modes: ["Off", "Vertical"], swing_mode: "Off" },
    { swing_modes: ["OFF", "SWING"], swing_mode: "SWING" },
    { swing_modes: ["Auto", "1", "2", "Swing"], swing_mode: "Swing" },
    { swing_modes: ["Auto"], swing_mode: "Auto" },
  ];
  for (const shape of shapes) {
    const r = swingClick(shape);
    const sent = sentSwing(r);
    assert.ok(shape.swing_modes.includes(sent),
      `group sent ${JSON.stringify(sent)} for ${JSON.stringify(shape.swing_modes)}`);

    const hass = makeHass({ "climate.x": { entity_id: "climate.x", state: "cool",
      attributes: Object.assign({ hvac_modes: ["off", "cool"], current_temperature: 76,
        temperature: 74, min_temp: 61, max_temp: 86 }, shape) } },
      { entities: { "climate.x": { device_id: "dx" } } });
    const card = makeCard({ entity: "climate.x" }, hass);
    card._swingToggle();
    assert.equal(hass.calls.length, 1);
    assert.ok(shape.swing_modes.includes(hass.calls[0].data.swing_mode),
      `dial sent ${JSON.stringify(hass.calls[0].data.swing_mode)} for ${JSON.stringify(shape.swing_modes)}`);
  }
});
