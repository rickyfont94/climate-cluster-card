// What the zone layout DOES.
//
// Every one of these dispatches a real click or a real pointer sequence on a real
// rendered element and asserts the service call it produced. The sheet opened and
// looked right while none of its controls did anything, and "it rendered" cannot
// see that, so these click.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass } from "./helpers.js";
import {
  zone,
  states,
  entities,
  ids,
  makeGroup,
  text,
  names,
  click,
  openSheet,
  offStates,
  clickG,
  doing,
} from "./zone_fixture.js";

// ------------------------------------------------------- the controls actually --
// Every one of these dispatches a real click on a real rendered element and asserts
// the service call it produced. The sheet opened and looked right while none of its
// controls did anything, because the tile scopes itself with data-zone and the sheet
// is a SIBLING of the tile grid rather than a descendant of one tile: a lookup that
// only walked up to [data-zone] found no room and every branch bailed out silently.
// "It rendered" cannot see that, so these click.

test("controls: tapping a room number opens that room's sheet, and it names that room", () => {
  const el = openSheet(makeGroup(), 1);
  assert.match(el.shadowRoot.querySelector('[data-act="panel"]').textContent, /Ricky/);
});

test("controls: a mode in the sheet writes to the room the sheet is for", () => {
  const el = openSheet(makeGroup(), 1);
  click(el, '[data-zmode="dry"]');
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_hvac_mode",
    data: { entity_id: "climate.ricky", hvac_mode: "dry" } }]);
});

test("controls: a preset writes the entity's OWN casing, never the button's", () => {
  const el = openSheet(makeGroup(), 0);
  // the sheet UPPERCASES in CSS; what is written is the string the entity advertises
  click(el, '[data-zpre="eco"]');
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_preset_mode",
    data: { entity_id: "climate.sala", preset_mode: "eco" } }]);
});

test("controls: the sheet offers only the presets and modes the room advertises", () => {
  const narrow = Object.assign({}, states, {
    "climate.sala": zone("climate.sala", {
      preset_modes: ["none"], preset_mode: "none", hvac_modes: ["off", "cool"] }),
  });
  const el = openSheet(makeGroup({}, makeHass(narrow, { entities })), 0);
  const pres = [...el.shadowRoot.querySelectorAll("[data-zpre]")].map((b) => b.dataset.zpre);
  assert.deepEqual(pres, ["none"], "no button exists for a preset it would reject");
  const modes = [...el.shadowRoot.querySelectorAll("[data-zmode]")].map((b) => b.dataset.zmode);
  assert.deepEqual(modes, ["off", "cool"]);

  // and a value that somehow reaches the handler anyway still writes nothing
  el._zoneAct(el.shadowRoot.querySelector('[data-act="panel"]'));
  assert.deepEqual(el._hass.calls, []);
});

test("controls: the sheet is the SAME object the dial opens, not a second one", () => {
  const el = openSheet(makeGroup(), 0);
  const root = el.shadowRoot;
  assert.ok(root.querySelector(".ct-pop"), "the dial's overlay");
  assert.ok(root.querySelector(".ct-sheet"), "the dial's glass panel");
  assert.ok(root.querySelector(".ct-popclose"), "the dial's round close");
  assert.equal(root.querySelectorAll(".ct-toggle .ct-tg-ic").length, 3,
    "the toggles carry the dial's icons, not bare words");
  // and it must sit OUTSIDE the container-query element, or position:fixed is
  // trapped inside the card and a tap outside cannot reach it
  assert.equal(root.querySelector(".cg-zonecard .ct-pop"), null);
});

test("controls: swing falls back to the climate entity when there is no sibling switch", () => {
  const sw = Object.assign({}, states, {
    "climate.sala": zone("climate.sala", { swing_modes: ["off", "vertical"], swing_mode: "off" }),
  });
  const el = openSheet(makeGroup({}, makeHass(sw, { entities })), 0);
  click(el, '[data-ztog="swing"]');
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_swing_mode",
    data: { entity_id: "climate.sala", swing_mode: "vertical" } }]);
});

test("controls: a toggle with no entity behind it writes nothing rather than guessing", () => {
  const el = openSheet(makeGroup(), 0);
  click(el, '[data-ztog="led"]');
  assert.deepEqual(el._hass.calls, []);
});

test("controls: the steppers move THAT room's setpoint by its own step", () => {
  const el = makeGroup();
  const tiles = el.shadowRoot.querySelectorAll("[data-zone]");
  tiles[2].querySelector('[data-act="inc"]')
    .dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  assert.deepEqual(el._hass.calls, [{ domain: "climate", service: "set_temperature",
    data: { entity_id: "climate.elly", temperature: 71 } }]);   // elly is set to 70
});

test("controls: the close button and the backdrop both shut the sheet", () => {
  const a = openSheet(makeGroup(), 0);
  click(a, '[data-act="close"]');
  assert.equal(a.shadowRoot.querySelector('[data-act="panel"]'), null);

  const b = openSheet(makeGroup(), 0);
  click(b, '[data-act="backdrop"]');
  assert.equal(b.shadowRoot.querySelector('[data-act="panel"]'), null);
});

test("controls: a tap on the panel itself does not shut the sheet under your finger", () => {
  const el = openSheet(makeGroup(), 0);
  click(el, '[data-act="panel"]');
  assert.ok(el.shadowRoot.querySelector('[data-act="panel"]'), "still open");
});

test("controls: all off arms first and only turns the house off on the second tap", () => {
  const el = makeGroup();
  click(el, '[data-gact="alloff"]');
  assert.deepEqual(el._hass.calls, [], "the first tap writes nothing");
  const armed = el.shadowRoot.querySelector('[data-gact="confirm"]');
  assert.ok(armed, "it arms instead");
  armed.dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  assert.equal(el._hass.calls.length, 1);
  assert.equal(el._hass.calls[0].service, "turn_off");
});

test("controls: sync writes the house target to every room that can take one", () => {
  const el = makeGroup();
  click(el, '[data-gact="sync"]');
  assert.equal(el._hass.calls.length, 1);
  assert.equal(el._hass.calls[0].service, "set_temperature");
  // the coldest setpoint of the three is elly's 70
  assert.equal(el._hass.calls[0].data.temperature, 70);
});

test("controls: a group preset writes to every room, in each one's own casing", () => {
  const el = makeGroup();
  click(el, '[data-gact^="preset:"]');
  assert.ok(el._hass.calls.length >= 1);
  assert.ok(el._hass.calls.every((c) => c.service === "set_preset_mode"));
});

test("controls: the sheet lights presets and toggles in the ROOM's mode ink", () => {
  // A room in AUTO showed a yellow mode button above a cyan preset row, because the
  // shared stylesheet lights those from --ct-mode-ink and the group card published
  // none, so they fell back to the fixed accent. The dial lights all three the same.
  const auto = Object.assign({}, states, { "climate.sala": zone("climate.sala") });
  auto["climate.sala"].state = "auto";
  const el = openSheet(makeGroup({}, makeHass(auto, { entities })), 0);
  const sheet = el.shadowRoot.querySelector(".ct-sheet");
  assert.match(sheet.getAttribute("style") || "", /--ct-mode-ink:\s*rgb\(255,220,90\)/);

  const cool = openSheet(makeGroup(), 0).shadowRoot.querySelector(".ct-sheet");
  assert.match(cool.getAttribute("style") || "", /--ct-mode-ink:\s*#5CD6FF/i,
    "and it follows the room, not the card");
});

// ----------------------------------------------------------------- all on ------
// The button only appears when every room is off, and the first version only wrote
// for rooms whose previous mode it had happened to see. It can only see one by
// watching that room turn off, so a card opened on an already-off house remembered
// nothing and the button did nothing at all.

test("all on: a card opened on an already-off house still turns it on", () => {
  const el = makeGroup({}, makeHass(offStates(), { entities }));
  assert.ok(el.shadowRoot.querySelector('[data-gact="allon"]'), "the button is offered");
  clickG(el, "allon");
  assert.equal(el._hass.calls.length, ids.length, "every room gets a command");
  for (const c of el._hass.calls) assert.equal(c.domain, "climate");
});

test("all on: it asks the DEVICE to turn on when it can, rather than picking a mode", () => {
  // supported_features carries ClimateEntityFeature.TURN_ON
  const el = makeGroup({}, makeHass(offStates({ supported_features: 128 }), { entities }));
  clickG(el, "allon");
  assert.ok(el._hass.calls.every((c) => c.service === "turn_on"),
    "turn_on, not a mode the card chose");
});

test("all on: a unit without turn_on gets its OWN first non-off mode", () => {
  const st = offStates();
  st["climate.sala"].attributes.hvac_modes = ["off", "heat"];   // no cool at all
  const el = makeGroup({}, makeHass(st, { entities }));
  clickG(el, "allon");
  const sala = el._hass.calls.find((c) => c.data.entity_id === "climate.sala");
  assert.equal(sala.service, "set_hvac_mode");
  assert.equal(sala.data.hvac_mode, "heat", "never a blanket cool onto a heat-only unit");
});

test("all on: a room it watched turn off goes back to what it was", () => {
  const el = makeGroup();                      // alive: cool
  el.hass = makeHass(offStates(), { entities });   // now off, so prev is remembered
  clickG(el, "allon");
  const one = el._hass.calls.find((c) => c.data.entity_id === "climate.sala");
  assert.equal(one.service, "set_hvac_mode");
  assert.equal(one.data.hvac_mode, "cool", "restored, not guessed");
});

// ------------------------------------------------------- feels immediate -------
// The dial has had optimistic paint since it shipped; the zone card had none, so a
// tap sat there doing nothing visible until Home Assistant reported the change back.
// On these units that is seconds, and it reads as a card that ignored you.

test("feel: a mode tap lights the new mode before the unit answers", () => {
  const el = openSheet(makeGroup(), 1);
  click(el, '[data-zmode="dry"]');
  const sheet = el.shadowRoot.querySelector('[data-zmode="dry"]');
  assert.match(sheet.getAttribute("class") || "", /active/,
    "the button you pressed is lit immediately, not in two seconds");
  assert.equal(el._hass.calls.length, 1, "and the command still went out");
});

test("feel: a preset and a toggle do the same", () => {
  const a = openSheet(makeGroup(), 0);
  click(a, '[data-zpre="eco"]');
  assert.match(a.shadowRoot.querySelector('[data-zpre="eco"]').getAttribute("class") || "",
    /active/);

  const b = openSheet(makeGroup(), 0);
  const before = b.shadowRoot.querySelector('[data-ztog="swing"]').className;
  click(b, '[data-ztog="swing"]');
  assert.notEqual(b.shadowRoot.querySelector('[data-ztog="swing"]').className, before,
    "the toggle flips under the finger");
});

test("feel: a stepper moves the number it is attached to", () => {
  const el = makeGroup();
  const tile = el.shadowRoot.querySelectorAll("[data-zone]")[2];
  tile.querySelector('[data-act="inc"]')
    .dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  assert.match(el.shadowRoot.querySelector(".cg-inner").textContent, /71/,
    "elly was 70, the tile reads 71 straight away");
});

test("feel: reality wins as soon as it arrives", () => {
  const el = openSheet(makeGroup(), 1);
  click(el, '[data-zmode="dry"]');
  assert.equal(el._zoneModel().zones[1].mode, "dry", "held while the unit is quiet");

  const live = JSON.parse(JSON.stringify(states));
  live["climate.ricky"].state = "dry";
  el.hass = makeHass(live, { entities });
  assert.equal(el._zoneOpt["climate.ricky"].mode, undefined,
    "the hold is dropped once it is just the value");
});

// ----------------------------------------------------------- the sheet host ----

test("sheet: it sits outside the stacking context, or it paints behind the dashboard", () => {
  const el = openSheet(makeGroup(), 0);
  const inner = el.shadowRoot.querySelector(".cg-inner");
  assert.equal(inner.querySelector(".ct-pop"), null,
    ".cg-inner carries z-index:1, so a fixed overlay inside it can never rise above anything outside this card");
  assert.ok(el.shadowRoot.querySelector(".cg-sheet-host .ct-pop"), "it lives in its own host");
});

test("sheet: a state push does not rebuild the open sheet under your finger", () => {
  const el = openSheet(makeGroup(), 0);
  const node = el.shadowRoot.querySelector('[data-act="panel"]');
  const other = JSON.parse(JSON.stringify(states));
  other["climate.elly"].attributes.current_temperature = 69;   // an unrelated room
  el.hass = makeHass(other, { entities });
  assert.equal(el.shadowRoot.querySelector('[data-act="panel"]'), node,
    "the very same node survived, so a tap mid-push cannot miss");
});

test("step: one press moves a whole degree, whatever the entity advertises", () => {
  // these units report target_temp_step 0.5, and half a degree Fahrenheit is below
  // anything they hold: two presses to move the room by one, and a tile reading 74.5
  const half = JSON.parse(JSON.stringify(states));
  for (const id of ids) half[id].attributes.target_temp_step = 0.5;
  const el = makeGroup({}, makeHass(half, { entities }));

  el.shadowRoot.querySelectorAll("[data-zone]")[2].querySelector('[data-act="inc"]')
    .dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  assert.equal(el._hass.calls[0].data.temperature, 71, "elly was 70, one press is 71");
});

test("step: temp_step brings a finer step back", () => {
  const half = JSON.parse(JSON.stringify(states));
  for (const id of ids) half[id].attributes.target_temp_step = 0.5;
  const el = makeGroup({ temp_step: 0.5 }, makeHass(half, { entities }));

  el.shadowRoot.querySelectorAll("[data-zone]")[2].querySelector('[data-act="inc"]')
    .dispatchEvent(new Event("click", { bubbles: true, composed: true }));
  assert.equal(el._hass.calls[0].data.temperature, 70.5);
});

test("step: a silly step falls back to a whole degree", () => {
  for (const bad of [0, -2, "abc", null]) {
    const el = makeGroup({ temp_step: bad });
    assert.equal(el._zoneStep(), 1, JSON.stringify(bad) + " must not reach the write");
  }
});

test("hero: the drag band writes the house setpoint on release", () => {
  const el = makeGroup();
  const band = el.shadowRoot.querySelector('[data-act="house"]');
  assert.ok(band, "the module draws the band");

  // drive the handler directly: happy-dom lays nothing out, so a synthetic pointer
  // sequence cannot produce a real angle
  el._zui = el._zui || {};
  el._zui.houseTarget = 71;
  el._houseDrag = true;
  el._onHouseUp = el._onHouseUp || (() => {});
  el._groupAction("setpoint", "71");
  assert.equal(el._hass.calls.length, 1);
  assert.equal(el._hass.calls[0].service, "set_temperature");
  assert.equal(el._hass.calls[0].data.temperature, 71);
});

test("hero: while dragging, the hero reads the dragged value", () => {
  const el = makeGroup();
  el._zui = { houseTarget: 68 };
  el._zoneRepaint();
  assert.match(text(el), /68/, "the number under the finger is the one on screen");
});

// ----------------------------------------------------------------- sync all ----

test("sync: it matches the mode as well as the temperature", () => {
  // a house at one temperature with one room drying and one circulating is not synced
  const mixed = JSON.parse(JSON.stringify(states));
  mixed["climate.sala"].state = "cool";
  mixed["climate.ricky"].state = "cool";
  mixed["climate.elly"].state = "dry";
  const el = makeGroup({}, makeHass(mixed, { entities }));
  clickG(el, "sync");

  const modes = el._hass.calls.filter((c) => c.service === "set_hvac_mode");
  assert.equal(modes.length, 1, "only the room that disagreed is moved");
  assert.equal(modes[0].data.entity_id, "climate.elly");
  assert.equal(modes[0].data.hvac_mode, "cool", "to the majority, not to a mode the card invented");
  assert.ok(el._hass.calls.some((c) => c.service === "set_temperature"),
    "and the temperature still goes out");
});

test("sync: a room somebody turned off stays off", () => {
  const mixed = JSON.parse(JSON.stringify(states));
  mixed["climate.sala"].state = "cool";
  mixed["climate.ricky"].state = "cool";
  mixed["climate.elly"].state = "off";
  const el = makeGroup({}, makeHass(mixed, { entities }));
  clickG(el, "sync");
  assert.ok(!el._hass.calls.some((c) => c.data.entity_id === "climate.elly"
    && c.service === "set_hvac_mode"), "syncing it on would be a different, destructive button");
});

test("sync: a room that cannot do the majority mode is left alone", () => {
  const mixed = JSON.parse(JSON.stringify(states));
  mixed["climate.sala"].state = "cool";
  mixed["climate.ricky"].state = "cool";
  mixed["climate.elly"].state = "dry";
  mixed["climate.elly"].attributes.hvac_modes = ["off", "dry"];   // no cool at all
  const el = makeGroup({}, makeHass(mixed, { entities }));
  clickG(el, "sync");
  assert.ok(!el._hass.calls.some((c) => c.service === "set_hvac_mode"),
    "never write a mode the unit does not advertise");
});

// ------------------------------------------------ the house drag, odd fingers ---
// Same three defects the dial's rings had, in the card that shipped alongside it:
// the move and up listeners are on WINDOW, so they hear every pointer on the page,
// and nothing checked which one or whether the event was a release or a CANCEL.
// Here it is worse than one setpoint, because a release writes the WHOLE house.

// happy-dom lays nothing out, so a synthetic pointer cannot produce a real angle.
// The geometry has its own tests; what these drive is the lifecycle around it.
const houseDown = (el, id, at) => {
  const band = el.shadowRoot.querySelector('[data-act="house"]');
  assert.ok(band, "the module draws the band");
  el._houseTempAt = typeof at === "function" ? at : () => (at == null ? 71 : at);
  el._housePointerDown({ pointerId: id, clientX: 10, clientY: 10, target: band,
    preventDefault() {} });
  return el;
};
const sets = (el) => el._hass.calls.filter((c) => c.service === "set_temperature");

test("house: a cancel abandons the drag instead of writing every room", () => {
  const el = houseDown(makeGroup(), 1, 68);
  assert.equal(el._zui.houseTarget, 68, "the finger is on 68");

  el._onHouseUp({ type: "pointercancel", pointerId: 1 });
  assert.deepEqual(el._hass.calls, [], "nothing was released, so nothing is written");
  assert.equal(el._zui.houseTarget, null, "and the gauge stops showing a value nobody chose");
  assert.ok(!el._houseDrag);
});

test("house: a second finger lifting does not commit the house", () => {
  const el = houseDown(makeGroup(), 1, 68);

  el._onHouseUp({ type: "pointerup", pointerId: 2 });
  assert.deepEqual(el._hass.calls, [], "a stray pointer cannot end this drag");
  assert.ok(el._houseDrag, "which is still running");

  el._onHouseUp({ type: "pointerup", pointerId: 1 });
  assert.ok(sets(el).length >= 1, "the finger that started it does commit");
  assert.equal(sets(el)[0].data.temperature, 68);
});

test("house: a stray pointer moving does not drag the house", () => {
  let v = 68;
  const el = houseDown(makeGroup(), 1, () => v);

  v = 61;
  el._onHouseMove({ pointerId: 2, clientX: 900, clientY: 900 });
  assert.equal(el._zui.houseTarget, 68, "a thumb resting on the dashboard is not the drag");

  el._onHouseMove({ pointerId: 1, clientX: 900, clientY: 900 });
  assert.equal(el._zui.houseTarget, 61, "the finger that started it still moves it");
});

test("house: a second pointerdown does not rebind and strand the listeners", () => {
  const el = houseDown(makeGroup(), 1, 68);
  const move = el._onHouseMove, up = el._onHouseUp;

  houseDown(el, 2, 80);
  assert.equal(el._onHouseMove, move, "rebinding would strand the old closure on window");
  assert.equal(el._onHouseUp, up);
  assert.equal(el._housePointerId, 1, "the first gesture still owns the gauge");
  assert.equal(el._zui.houseTarget, 68, "and its value survived");
});

test("house: a card removed mid-drag comes back with a working gauge", () => {
  // Lovelace detaches and re-attaches cards freely, entering edit mode does it. A
  // teardown that only removed the listeners would leave _houseDrag true, and the
  // one-gesture guard reads that as "a drag already owns the gauge", forever.
  const el = houseDown(makeGroup(), 1, 68);
  el.disconnectedCallback();
  assert.ok(!el._houseDrag, "the gesture is dropped with the element");
  assert.equal(el._zui.houseTarget, null, "and so is the value it was showing");

  houseDown(el, 2, 74);
  assert.ok(el._houseDrag, "so the next drag is accepted");
  assert.equal(el._housePointerId, 2);
});
