// Fan AUTO write regression tests. The invariant matches the swing one: the value
// handed to climate.set_fan_mode must be a member of that entity's own fan_modes.
// The Midea case is the guard that this fix changed nothing for the integration the
// card was originally built against.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass, makeCard } from "./helpers.js";
import * as midea from "./fixtures/midea.js";
import * as cap from "./fixtures/fan_auto_capital.js";

test("midea: the AUTO payload is still exactly the lowercase auto it always was", () => {
  const hass = makeHass(midea.states, { entities: midea.entities });
  const card = makeCard(midea.config, hass);

  card._callFanAuto();

  assert.equal(hass.calls.length, 1, "exactly one service call");
  const c = hass.calls[0];
  assert.equal(c.domain, "climate");
  assert.equal(c.service, "set_fan_mode");
  assert.equal(c.data.fan_mode, "auto", "Midea payload must be byte-identical to before");
});

test("capital Auto: the entity's own casing is sent, never the literal lowercase auto", () => {
  const modes = cap.states[cap.config.entity].attributes.fan_modes;
  const hass = makeHass(cap.states, { entities: cap.entities });
  const card = makeCard(cap.config, hass);

  card._callFanAuto();

  assert.equal(hass.calls.length, 1, "exactly one service call");
  const sent = hass.calls[0].data.fan_mode;
  assert.equal(hass.calls[0].service, "set_fan_mode");
  assert.equal(sent, "Auto", "must send the member with the entity's own casing");
  assert.ok(modes.includes(sent), `sent value ${JSON.stringify(sent)} must be a member of ${JSON.stringify(modes)}`);
});

test("no auto member at all: no service call is made rather than sending a value that would be rejected", () => {
  const hass = makeHass(cap.noAutoStates, { entities: cap.noAutoEntities });
  const card = makeCard(cap.noAutoConfig, hass);

  card._callFanAuto();

  assert.equal(hass.calls.length, 0, "a list with no auto member must produce no write");
});

test("every fan_modes member written is a member of the advertised list", () => {
  for (const fx of [midea, cap]) {
    const hass = makeHass(fx.states, { entities: fx.entities });
    const card = makeCard(fx.config, hass);
    card._callFanAuto();
    if (!hass.calls.length) continue;
    const modes = fx.states[fx.config.entity].attributes.fan_modes;
    assert.ok(modes.includes(hass.calls[0].data.fan_mode),
      `${fx.config.entity}: wrote a non-member`);
  }
});
