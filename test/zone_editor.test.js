// The zone card's visual editor.
//
// Home Assistant shows "Visual editor not supported" for a card with no
// getConfigElement, which is what users met first, so the shape of the form is as
// much a shipped surface as the card is.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeHass } from "./helpers.js";
import {
  zone,
  states,
  entities,
  ids,
  makeGroup,
  makeEditor,
  names,
} from "./zone_fixture.js";

// ------------------------------------------------------------------- editor ----

test("zone: the group card offers a visual editor at all", () => {
  const El = customElements.get("climate-cluster-group-card");
  assert.equal(typeof El.getConfigElement, "function",
    "without this Home Assistant shows 'Visual editor not supported'");
  const ed = El.getConfigElement();
  assert.ok(ed, "and it resolves to a real element");
});

test("zone: the stub config is a working card, not an empty one", () => {
  const El = customElements.get("climate-cluster-group-card");
  const stub = El.getStubConfig(makeHass(states, { entities }));
  assert.ok(Array.isArray(stub.entities) && stub.entities.length, "it comes with rooms");
  assert.doesNotThrow(() => makeGroup(stub));
});

test("editor: the everyday fields are at the top, the rest folded away", () => {
  const ed = makeEditor({ entities: ids });
  const top = ed._schema().filter((r) => r.type !== "expandable").map((r) => r.name);
  assert.deepEqual(top, ["entities", "name", "orientation"]);
  const secs = ed._schema().filter((r) => r.type === "expandable").map((r) => r.name);
  assert.deepEqual(secs, ["look", "bar", "grid", "range"],
    "the bottom buttons get their own section, beside appearance and layout");
});

test("editor: the classic gauges are not offered, only the shape of the zone card", () => {
  const rows = makeEditor({ entities: ids })._schema();
  assert.ok(!names(rows).includes("layout"), "no layout picker at all");
  const orient = rows.find((r) => r.name === "orientation");
  assert.deepEqual(orient.selector.select.options.map((o) => o.value),
    ["auto", "horizontal", "vertical"]);
});

test("editor: a YAML config asking for the classic gauges keeps them", () => {
  // the field is gone from the form; Object.assign must still carry the key through
  const ed = makeEditor({ entities: ids, layout: "classic" });
  const seen = [];
  ed.addEventListener("config-changed", (e) => seen.push(e.detail.config));
  ed._valueChanged({ stopPropagation() {}, detail: { value: { name: "Casa" } } });
  assert.equal(seen[0].layout, "classic", "not silently dropped by the editor");
});

test("zone: orientation forces the shape, and automatic sets no key", () => {
  assert.equal(makeGroup().shadowRoot.querySelector(".cg-zonecard").dataset.orient, "auto");
  assert.equal(makeGroup({ orientation: "horizontal" }).shadowRoot
    .querySelector(".cg-zonecard").dataset.orient, "horizontal");
  assert.equal(makeGroup({ orientation: "vertical" }).shadowRoot
    .querySelector(".cg-zonecard").dataset.orient, "vertical");
  assert.equal(makeGroup({ orientation: "sideways" }).shadowRoot
    .querySelector(".cg-zonecard").dataset.orient, "auto", "junk falls back");
});

test("editor: hero and tap_zone are only offered on the layout that draws them", () => {
  assert.ok(!names(makeEditor({ entities: ids })._schema()).includes("hero"),
    "the zone layout has no hero picker, so it must not offer one");
  const classic = names(makeEditor({ entities: ids, layout: "classic" })._schema());
  assert.ok(classic.includes("hero"));
  assert.ok(classic.includes("tap_zone"));
});

test("editor: a per-room name survives a trip through the entity picker", () => {
  // The picker speaks plain ids. Round-tripping through it must not throw away the
  // { entity, name } objects, which is the whole per-room rename feature.
  const ed = makeEditor({ entities: ["climate.sala", { entity: "climate.ricky", name: "Cuarto" }] });
  const merged = ed._mergeEntities(["climate.sala", "climate.ricky", "climate.elly"]);
  assert.deepEqual(merged[1], { entity: "climate.ricky", name: "Cuarto" });
  assert.equal(merged[0], "climate.sala");
  assert.equal(merged[2], "climate.elly");
});

test("editor: dropping a room does not resurrect it", () => {
  const ed = makeEditor({ entities: ["climate.sala", { entity: "climate.ricky", name: "Cuarto" }] });
  assert.deepEqual(ed._mergeEntities(["climate.sala"]), ["climate.sala"]);
});

test("bar: the editor offers only presets the selected rooms actually have", () => {
  const ed = makeEditor({ entities: ids });
  const row = ed._schema().find((r) => r.name === "bar").schema[0];
  const vals = row.selector.select.options.map((o) => o.value);
  assert.deepEqual(vals.slice(0, 2), ["off", "sync"]);
  assert.ok(vals.includes("preset:eco"));
  assert.ok(!vals.includes("preset:none"), "none is not a preset anyone wants a button for");
});
