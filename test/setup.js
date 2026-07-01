// Test bootstrap. Preloaded via `node --import ./test/setup.js` before every test
// file, so the DOM globals (window, document, customElements, HTMLElement,
// CustomEvent, ...) exist and the card is registered before any test runs.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register once per process. The ESM cache means this module body runs a single
// time even if the runner also discovers this file under test/, but guard anyway.
if (!globalThis.__cccDomRegistered) {
  GlobalRegistrator.register();
  globalThis.__cccDomRegistered = true;
}

// Import the card for its side effect: the IIFE calls
// customElements.define("climate-cluster-card", ...). No named exports exist, so
// tests reach the class through document.createElement(...).
await import("../climate-cluster-card.js");
