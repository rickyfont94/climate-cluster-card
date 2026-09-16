// The zone card under a theme.
//
// The handoff module writes every colour as an inline style attribute, and an inline
// style beats any stylesheet, so the card rewrites its own markup on the way out.
// These assert that the rewrite reaches the right things and spares the rest.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  zone,
  makeGroup,
  text,
  html,
} from "./zone_fixture.js";

// ------------------------------------------------------------------- theming ----
// The module writes every colour as an inline style attribute, and an inline style
// beats any stylesheet, so the card rewrites its markup on the way out. Before this
// the zone layout was dark-only and accent, glass_color and glass_opacity were dead
// keys that the editor still offered.

test("theme: neutrals resolve from the theme, they are not baked in", () => {
  const h = html(makeGroup());
  assert.match(h, /var\(--primary-text-color/, "ink follows the theme");
  assert.match(h, /var\(--secondary-text-color/);
  assert.ok(!/#f2f5f8(?!\))/.test(h.replace(/var\([^)]*\)/g, "")),
    "no bare neutral literal survives outside a fallback");
});

test("theme: accent reaches the zone card", () => {
  const h = html(makeGroup({ accent: "#c77dff" }));
  assert.match(h, /var\(--cg-accent/, "the accent is referenced, not hardcoded cyan");
  const card = makeGroup({ accent: "#c77dff" }).shadowRoot.querySelector("ha-card");
  assert.equal(card.style.getPropertyValue("--cg-accent"), "#c77dff");
});

test("theme: the arc gradients are NOT accented, they are the instrument", () => {
  // routing the gradient through the accent turns a purple accent into a purple COLD
  // ARC, which is a different card rather than a tinted one
  const h = html(makeGroup({ accent: "#c77dff" }));
  const defs = h.slice(h.indexOf("<defs>"), h.indexOf("</defs>"));
  assert.match(defs, /#7fe4ff/, "the cold stop is untouched");
  assert.match(defs, /#F2933A/i, "and so is the warm one");
  assert.ok(!/--cg-accent/.test(defs), "no theme property reaches inside defs");
});

test("theme: the ground is measured, so a plain light theme is covered too", () => {
  const el = makeGroup();
  const card = el.shadowRoot.querySelector(".cg-card");
  assert.ok(["light", "dark"].includes(card.getAttribute("data-ink")),
    "the card stamps which way round its ground is");
});
