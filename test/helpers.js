// Minimal Home Assistant test doubles.
//
// makeHass builds a fake `hass` object shaped like the parts of the real one the
// card reads (states, entities, config.unit_system) whose callService records
// every call onto hass.calls instead of talking to a server.
//
// makeCard creates the custom element, configures it, and assigns state WITHOUT
// going through `set hass` (which would build the shadow DOM and paint). That
// keeps the write-path logic exercised in isolation, which is exactly what the
// per-integration service-payload tests need.

export function makeHass(states, opts = {}) {
  const hass = {
    states: states || {},
    entities: opts.entities || {},
    // Only the temperature unit is read; "F" keeps the value HA-native for these
    // swing tests (no C in the string, so the card treats values as Fahrenheit).
    config: { unit_system: { temperature: opts.unit || "F" } },
    language: opts.language || "en",
    calls: [],
    callService(domain, service, data) {
      hass.calls.push({ domain, service, data });
      return Promise.resolve();
    },
  };
  return hass;
}

export function makeCard(config, hass) {
  const card = document.createElement("climate-cluster-card");
  // Never paint in a test. Stub the renderer (some revert paths call it) and hand
  // the card an empty refs bag so any DOM poke is a no-op rather than a throw.
  card._render = () => {};
  card._paintPop = () => {};
  card._paintFanAuto = () => {};
  card._announce = () => {};
  card._refs = card._refs || {};
  card.setConfig(config);
  if (hass) card._hass = hass;
  return card;
}
