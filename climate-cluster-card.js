/* climate-cluster-card.js
 * Vanilla web component: WIDE-ARC instrument-cluster dial for any HA climate entity
 * (Midea-aware sibling auto-discovery). No imports, no deps, no build step, single file.
 * Lovelace type: custom:climate-cluster-card
 *
 * The render / interaction engine is a wide two-ring arc gauge:
 *   - inner thick ring = TEMPERATURE (drag to set), outer thin ring = FAN SPEED.
 *   - manual letterbox pointer mapping (NOT getScreenCTM), build-once-then-patch,
 *     optimistic paint reconciled against live state, commit-on-pointerUP, window-bound
 *     move/up listeners, touch-swipe kill so the view doesn't navigate on drag.
 *   - center tap -> glass MODE POPUP with a TOGGLES ROW (SWING / LED / SOUND).
 *   - frosted-glass slab (its own backdrop-blur div, never on :host/.ct-card so the
 *     fixed mode-popup never re-anchors), optional max_height cap.
 *
 * Generic config layer over that engine:
 *   - temperature_unit F/C (auto from hass.config.unit_system); min/max/step.
 *   - modes (incl heat / heat_cool) with glyphs + cooling/heating caret.
 *   - fan: number.* percent ring, OR named climate fan_modes as discrete stops.
 *   - features (swing / led / sound) resolved: config -> Midea sibling -> generic
 *     climate attribute -> hide.
 *   - accent (UI) split from per-mode colors; mode_colors override map.
 */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  // ---- console version banner ---------------------------------------------
  const VERSION = "1.0.0";
  console.info(
    "%c CLIMATE-CLUSTER-CARD %c v" + VERSION + " ",
    "color:#0b0f16;background:#4fc3f7;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px",
    "color:#4fc3f7;background:#0b0f16;border-radius:0 4px 4px 0;padding:2px 6px"
  );

  // Default UI accent (HA "Frosted Glass" cyan). Overridable per-card via `accent`.
  const DEFAULT_ACCENT = "#4fc3f7";

  // Mode -> per-mode accent color (arc / glyph / center label fallbacks).
  const MODE_COLORS = {
    cool: "#27d3ff",
    heat: "#ff9a2e",
    heat_cool: "#7ee787",
    dry: "#2fe0c4",
    fan_only: "#eef3f8",
    auto: "rgb(255,220,90)",
    off: "#6a7480",
  };

  const MODE_LABEL = {
    off: "OFF",
    auto: "AUTO",
    cool: "COOL",
    dry: "DRY",
    heat: "HEAT",
    heat_cool: "HEAT/COOL",
    fan_only: "FAN",
  };

  const ACTION_LABEL = {
    cooling: "COOLING",
    heating: "HEATING",
    drying: "DRYING",
    fan: "FAN",
    idle: "IDLE",
    off: "OFF",
  };

  // ---- popup TOGGLES ROW chips (SWING / LED / SOUND) -----------------------
  // Inline glyphs only (no icon deps). stroke="currentColor" so the lit/dim color
  // is driven by the chip's CSS `color` (.ct-toggle.on = accent, else grey).
  //   kind -> the feature each chip drives:
  //     swing -> config.swing_entity / sibling *_swing_vertical / climate swing_modes
  //     led   -> config.led_entity   / sibling *_screen_display
  //     sound -> config.sound_entity / sibling *_prompt_tone
  const TOGGLE_DEFS = [
    {
      kind: "swing", label: "SWING",
      // up/down arrows (same glyph as the face swing chip)
      svg: '<path d="M -5 -3 L 0 -9 L 5 -3 M 0 -9 L 0 9 M -5 3 L 0 9 L 5 3" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    },
    {
      kind: "led", label: "LED",
      // monitor/display: screen rect + little stand
      svg: '<rect x="-9" y="-8" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<line x1="-5" y1="9.5" x2="5" y2="9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<line x1="0" y1="5" x2="0" y2="9.5" stroke="currentColor" stroke-width="2"/>',
    },
    {
      kind: "sound", label: "SOUND",
      // bell (beep / prompt tone)
      svg: '<path d="M 0 -9 C 4 -9 6 -6 6 -2 C 6 3 8 4 8 6 L -8 6 C -8 4 -6 3 -6 -2 C -6 -6 -4 -9 0 -9 Z" ' +
        'fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M -2.4 8 A 2.6 2.6 0 0 0 2.4 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    },
  ];

  // ---- WIDE ARC geometry (kept verbatim) ----------------------------------
  // viewBox 0 0 600 392, center pushed LOW so the band sweeps the TOP, opening
  // downward; the freed bottom shelf carries the big number + clover + swing.
  const VBW = 600, VBH = 392;          // _VBW / _VBH for the letterbox pointer math (aspect 600/392)
  const CX = 300, CY = 284;            // _cx / _cy
  const R_TEMP = 200;                  // inner thick arc = TEMPERATURE
  const R_FAN = 226;                   // outer thin arc  = FAN SPEED
  const PICK_SPLIT = 213;              // r < split -> temp ring, else fan ring
  const START_ANG = 250, SPAN = 220;   // lit band; gap = bottom 110..250
  const END_ANG = START_ANG + SPAN;    // 470 (= 110 deg)
  const PICK_INNER = 150, PICK_OUTER = 275; // WIDE drag accept band
  const FAN_HANDLE_OFFSET = 3;         // float just off the thin arc
  // Tap-vs-drag gate (px of pointer travel). A pointerdown on a ring band or the
  // fan clover ARMS the gesture; we only treat it as a drag/tap-discard once the
  // pointer moves past this. A pure tap never crosses it, so it can't nudge a
  // setpoint, and a vertical swipe that starts here can still scroll (issue #4).
  const DRAG_THRESH_PX = 8;

  // ---- FAN (percent control) ----------------------------------------------
  // The fan ring drives a number.*_fan_speed entity (min 1, max 100), snapping to
  // {1, 5,10,...,100}. AUTO is the named climate fan_mode, not a ring position.
  const FAN_MIN = 1;
  const FAN_MAX = 100;
  const FAN_STEP = 5;

  // Optimistic-paint safety timeout (ms). We hold the optimistic value until the
  // entity reports the value we asked for (then clear immediately, see
  // _reconcileOptimistic), so a slow device no longer flickers back then jumps.
  // This is only the fallback for a device that never confirms; a rejected
  // service call reverts sooner via its .catch() (issue #9).
  const OPT_HOLD_MS = 5000;

  // fraction 0..1 along the arc -> snapped percent in {1, 5,10,...,100}.
  function fanSnapPct(frac) {
    const raw = FAN_MIN + clamp(frac, 0, 1) * (FAN_MAX - FAN_MIN); // 1..100 continuous
    if (raw <= (FAN_MIN + FAN_STEP) / 2) return FAN_MIN;           // floor snaps to 1
    return clamp(Math.round(raw / FAN_STEP) * FAN_STEP, FAN_STEP, FAN_MAX);
  }

  // ---- small helpers ------------------------------------------------------
  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
  const cToF = (c) => c * 9 / 5 + 32;
  const fToC = (f) => (f - 32) * 5 / 9;

  // Accept either [r,g,b] (editor color_rgb selector) or a plain color string.
  function toColor(v) {
    if (v == null) return null;
    if (Array.isArray(v)) return v.length ? "rgb(" + v.join(",") + ")" : null;
    const s = String(v).trim();
    return s ? s : null;
  }

  // Polar helper (CW from top): x = cx + r*sin(deg), y = cy - r*cos(deg).
  function polar(cx, cy, r, angDeg) {
    const a = ((angDeg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  // SVG arc path between two angles (degrees, clockwise from top, a1 >= a0).
  function arcPath(cx, cy, r, a0, a1) {
    const [x0, y0] = polar(cx, cy, r, a0);
    const [x1, y1] = polar(cx, cy, r, a1);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  // ---- mode glyphs --------------------------------------------------------
  function snowflake() {
    let d = "";
    for (let i = 0; i < 6; i++) {
      const a = i * 60;
      const tip = polar(0, 0, 14, a), root = polar(0, 0, 4, a);
      d += `M ${root[0].toFixed(1)} ${root[1].toFixed(1)} L ${tip[0].toFixed(1)} ${tip[1].toFixed(1)} `;
      const b = polar(0, 0, 9, a);
      const bl = polar(b[0], b[1], 4, a - 90), br = polar(b[0], b[1], 4, a + 90);
      d += `M ${bl[0].toFixed(1)} ${bl[1].toFixed(1)} L ${b[0].toFixed(1)} ${b[1].toFixed(1)} L ${br[0].toFixed(1)} ${br[1].toFixed(1)} `;
    }
    return d;
  }
  const DROPLET = "M0,-14 C 7,-4 9,6 0,12 C -9,6 -7,-4 0,-14 Z";
  // filled flame (HEAT)
  const FLAME = "M0,-13 C6,-5 6,0 3,4 C5,2 6,-2 5,-5 C8,-1 7,6 1,11 C4,7 3,3 0,1 "
              + "C-1,4 -3,5 -3,8 C-6,4 -6,-2 -2,-6 C-2,-3 -1,-2 1,-3 C-2,-7 -1,-10 0,-13 Z";
  function fanGlyph() {
    let d = "";
    for (let i = 0; i < 4; i++) {
      const a = i * 90 * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const rot = (x, y) => `${(x * c - y * s).toFixed(1)},${(x * s + y * c).toFixed(1)}`;
      d += `M ${rot(0, 0)} C ${rot(6, -6)} ${rot(6, -15)} ${rot(0, -13)} C ${rot(-6, -15)} ${rot(-6, -6)} ${rot(0, 0)} Z `;
    }
    return d;
  }
  const GLYPH = {
    cool: { d: snowflake(), stroke: true },
    heat: { d: FLAME, stroke: false },            // filled flame
    heat_cool: { special: "heatcool" },           // up + down triangles
    dry: { d: DROPLET, stroke: false },
    fan_only: { d: fanGlyph(), stroke: false },
    auto: { special: "A" },
    off: { special: "off" },
  };
  const CARET_DOWN = "M-10,-6 L10,-6 L0,8 Z"; // cooling caret (down)
  const CARET_UP = "M-10,6 L10,6 L0,-8 Z";    // heating caret (up)

  class ClimateClusterCard extends HTMLElement {
    constructor() {
      super();
      this._built = false;
      this._hass = null;
      this._config = null;
      this._accent = DEFAULT_ACCENT;
      this._modeColors = Object.assign({}, MODE_COLORS);
      this._popOpen = false;
      this._popBuilt = false;
      this._refs = {};
    }

    // ---- PUBLIC CONTRACT --------------------------------------------------
    setConfig(config) {
      if (!config || !config.entity) {
        throw new Error("climate-cluster-card: 'entity' is required (e.g. climate.living_room)");
      }
      this._config = Object.assign({}, config);

      // UI accent (popup-active, lit chips, swing-lit, fan ring end + handle, caret).
      this._accent = toColor(this._config.accent) || DEFAULT_ACCENT;

      // Per-mode colors: shallow-merge config.mode_colors (run through toColor) over
      // the built-in defaults, so you may override just one mode.
      const mc = {};
      const cm = this._config.mode_colors;
      if (cm && typeof cm === "object") {
        for (const k in cm) {
          const c = toColor(cm[k]);
          if (c) mc[k] = c;
        }
      }
      this._modeColors = Object.assign({}, MODE_COLORS, mc);

      // Optional height cap. A CSS length string (e.g. "34vh" or "360px"). When set,
      // height is capped and width follows the viewBox aspect ratio (centered).
      const mh = this._config.max_height;
      this._maxHeight = (typeof mh === "string" && mh.trim()) ? mh.trim() : null;
      if (this._built) this._applyMaxHeight();
      if (this._built) this._render();
    }

    // Toggle the height-capped gauge mode via [data-capped] + --ct-max-h.
    _applyMaxHeight() {
      if (!this.shadowRoot) return;
      const card = this.shadowRoot.querySelector(".ct-card");
      if (!card) return;
      if (this._maxHeight) {
        card.setAttribute("data-capped", "");
        card.style.setProperty("--ct-max-h", this._maxHeight);
      } else {
        card.removeAttribute("data-capped");
        card.style.removeProperty("--ct-max-h");
      }
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._built) this._build();
      this._render();
    }

    getCardSize() {
      // Wide arc (600x392, ratio 1.53) is shorter than a round puck -> ~5.
      return 5;
    }

    disconnectedCallback() {
      this._popOpen = false;
      this._dragging = false;
      this._ringArmed = false;
      this._ringStart = null;
      // Capturing touch guards live on the svg; tear them down here.
      if (this._svg) {
        if (this._onSvgTouchStart) this._svg.removeEventListener("touchstart", this._onSvgTouchStart, true);
        if (this._onSvgTouchMove) this._svg.removeEventListener("touchmove", this._onSvgTouchMove, true);
      }
      // Move/up listeners live on window (survive a failed setPointerCapture).
      if (this._onRingMove) window.removeEventListener("pointermove", this._onRingMove);
      if (this._onRingUp) {
        window.removeEventListener("pointerup", this._onRingUp);
        window.removeEventListener("pointercancel", this._onRingUp);
      }
      if (this._onFanIconUp) {
        window.removeEventListener("pointerup", this._onFanIconUp);
        window.removeEventListener("pointercancel", this._onFanIconUp);
      }
      this._fanIconStart = null;
      if (this._onPopClick && this._refs && this._refs.sheet) {
        this._refs.sheet.removeEventListener("click", this._onPopClick);
        this._onPopClick = null;
        this._popBuilt = false;
      }
    }

    // ============================================================================
    // SIBLING DISCOVERY  (Midea device-id walk; config keys take precedence)
    // ============================================================================
    _siblings() {
      const out = {};
      const hass = this._hass;
      const cfg = this._config;
      if (!hass || !cfg) return out;
      const main = hass.entities ? hass.entities[cfg.entity] : null;
      const devId = main ? main.device_id : null;
      const pick = (suffix, domain) => {
        if (!devId || !hass.entities) return null;
        for (const id in hass.entities) {
          const ent = hass.entities[id];
          if (!ent || ent.device_id !== devId) continue;
          if (domain && id.indexOf(domain + ".") !== 0) continue;
          if (id.endsWith(suffix) || id.indexOf(suffix) !== -1) return id;
        }
        return null;
      };
      out.power = cfg.power_switch || pick("_power", "switch");
      out.boost = pick("_boost_mode", "switch");
      out.eco = pick("_eco_mode", "switch");
      out.comfort = pick("_comfort_mode", "switch");
      out.sleep = pick("_sleep", "switch");
      out.breezeless = pick("_breezeless", "switch");
      out.aux_heating = pick("_aux_heating", "switch");
      out.frost = pick("_frost_protect", "switch");
      out.indirect = pick("_indirect_wind", "switch");
      out.screen = cfg.led_entity || pick("_screen_display", "switch"); // LED / display toggle
      out.sound = cfg.sound_entity || pick("_prompt_tone", "switch");   // SOUND / beep toggle
      out.swing_h = pick("_swing_horizontal", "switch");
      out.swing_v = cfg.swing_entity || pick("_swing_vertical", "switch");
      out.dust = pick("_full_dust", "binary_sensor");
      // fan_entity (preferred) / fan_speed (back-compat alias) / sibling number.*_fan_speed
      out.fan_speed = cfg.fan_entity || cfg.fan_speed || pick("_fan_speed", "number");
      return out;
    }

    // The number.*_fan_speed entity. Config -> sibling -> null (named-mode fallback).
    _fanNumberId() {
      const sib = this._siblings();
      return sib.fan_speed || null;
    }

    // Named climate fan_modes minus "auto" (auto is a state, not a ring position).
    _fanNamedModes() {
      const s = this._st(this._config && this._config.entity);
      const fm = (s && s.attributes && s.attributes.fan_modes) || [];
      return fm.filter((m) => String(m).toLowerCase() !== "auto");
    }

    _st(id) {
      if (!id || !this._hass || !this._hass.states) return null;
      return this._hass.states[id] || null;
    }

    // ---- temperature unit / range / step ----------------------------------
    _unit() {                       // 'F' | 'C' (display unit)
      const cfg = (this._config && this._config.temperature_unit) || "auto";
      if (cfg === "F" || cfg === "C") return cfg;
      return this._haUnit();
    }
    _haUnit() {                     // the unit HA reports values in
      const u = this._hass && this._hass.config && this._hass.config.unit_system
              && this._hass.config.unit_system.temperature;
      return (u && /C/i.test(u)) ? "C" : "F";
    }
    _unitDefaults(u) { return u === "C" ? { min: 16, max: 30, step: 0.5 } : { min: 61, max: 86, step: 1 }; }

    // HA-unit value -> display-unit value (no-op when units match).
    _toDisplay(v) {
      if (v == null) return null;
      const du = this._unit(), hu = this._haUnit();
      if (du === hu) return v;
      return du === "F" ? cToF(v) : fToC(v);
    }
    // display-unit value -> HA-unit value (for the service call).
    _toHa(v) {
      if (v == null) return null;
      const du = this._unit(), hu = this._haUnit();
      if (du === hu) return v;
      return hu === "F" ? cToF(v) : fToC(v);
    }
    // HA-unit STEP -> display-unit step. A step is a delta, so scale by the
    // slope only (9/5 for C->F, 5/9 for F->C) with no +/-32 offset, then snap
    // to a tidy granularity for the display unit so e.g. a 0.5C step becomes 1F
    // instead of an awkward 0.9F (issue #11). No-op when units match.
    _toDisplayStep(s) {
      if (s == null) return null;
      const du = this._unit(), hu = this._haUnit();
      if (du === hu) return s;
      const scaled = du === "F" ? s * 9 / 5 : s * 5 / 9;
      const grain = du === "F" ? 0.5 : 0.1; // F snaps to half-degrees, C to tenths
      return Math.max(grain, Math.round(scaled / grain) * grain);
    }

    _range() {
      const s = this._st(this._config && this._config.entity);
      const attr = (s && s.attributes) || {};
      const cfg = this._config || {};
      const d = this._unitDefaults(this._unit());
      // Config min/max are authored in the display unit already; the entity's
      // min_temp/max_temp are reported in HA's unit, so push those through
      // _toDisplay so the whole dial lives in one unit (issue #11).
      const lo = (cfg.min_temp != null && num(cfg.min_temp) != null) ? num(cfg.min_temp)
               : (num(attr.min_temp) != null ? this._toDisplay(num(attr.min_temp)) : d.min);
      const hi = (cfg.max_temp != null && num(cfg.max_temp) != null) ? num(cfg.max_temp)
               : (num(attr.max_temp) != null ? this._toDisplay(num(attr.max_temp)) : d.max);
      return { lo, hi };
    }
    _step() {
      const s = this._st(this._config && this._config.entity);
      const attr = (s && s.attributes) || {};
      const cfg = this._config || {};
      const d = this._unitDefaults(this._unit());
      // Config temp_step is authored in the display unit; the entity's
      // target_temp_step is in HA's unit, so convert it (issue #11).
      if (cfg.temp_step != null && num(cfg.temp_step) != null) return num(cfg.temp_step);
      if (num(attr.target_temp_step) != null) return this._toDisplayStep(num(attr.target_temp_step));
      return d.step;
    }

    // accent-derived translucent color (lit chips / glow).
    _glow(pct) { return `color-mix(in srgb, ${this._accent} ${pct}%, transparent)`; }

    // effective per-mode color: merged map -> UI accent -> built-in -> off.
    _modeColor(mode) {
      return this._modeColors[mode] || this._accent || MODE_COLORS[mode] || MODE_COLORS.off;
    }

    // ============================================================================
    // BUILD DOM ONCE  (shadow DOM + arc SVG; _render only patches afterwards)
    // ============================================================================
    _build() {
      const root = this.shadowRoot || this.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = this._css();
      root.appendChild(style);

      const card = document.createElement("div");
      card.className = "ct-card";
      root.appendChild(card);

      // Frosted-glass slab: its OWN backdrop-blur div BEHIND the svg (z-index:1),
      // a SIBLING of .ct-pop. backdrop-filter lives on THIS div, never on
      // .ct-card/:host, so the fixed mode-popup never re-anchors. Build-once, inert.
      const frost = document.createElement("div");
      frost.className = "ct-frost";
      card.appendChild(frost);

      // Letterbox-correct pointer mapping reads these (NOT getScreenCTM).
      this._VBW = VBW; this._VBH = VBH;
      this._cx = CX; this._cy = CY;
      this._startAng = START_ANG; this._span = SPAN;

      const svg = el("svg", {
        viewBox: `0 0 ${VBW} ${VBH}`,
        preserveAspectRatio: "xMidYMid meet",
        class: "ct-svg",
      });
      this._svg = svg;
      this._refs.svg = svg;

      // KILL VIEW-SWIPE ON DRAG -- WITHOUT eating page scroll (issue #4). The grab
      // bands carry touch-action:none (CSS) so a ring drag owns the gesture, while
      // the card stays pan-y so a vertical swipe elsewhere scrolls the dashboard.
      // These CAPTURING guards stop the touch from reaching the ancestor's JS swipe
      // handler; preventDefault is held back until a drag is actually CONFIRMED
      // (this._dragging) so a non-drag touch can still scroll natively. Pointer
      // events fire independently, so the ring drag is unaffected.
      this._onSvgTouchStart = (e) => { e.stopPropagation(); };
      this._onSvgTouchMove = (e) => { e.stopPropagation(); if (this._dragging && e.cancelable) e.preventDefault(); };
      svg.addEventListener("touchstart", this._onSvgTouchStart, { capture: true, passive: false });
      svg.addEventListener("touchmove", this._onSvgTouchMove, { capture: true, passive: false });

      // ---- defs: gradients + tight glow filters ----
      const defs = el("defs");
      defs.innerHTML =
        '<linearGradient id="aColdGrad" gradientUnits="userSpaceOnUse" x1="100" y1="300" x2="300" y2="300">' +
        '<stop offset="0%" stop-color="#CFF4FF" stop-opacity=".9"/>' +
        '<stop offset="45%" stop-color="#5CD6FF"/>' +
        '<stop offset="100%" stop-color="#3AA8E8"/></linearGradient>' +
        '<linearGradient id="aWarmGrad" gradientUnits="userSpaceOnUse" x1="300" y1="300" x2="500" y2="300">' +
        '<stop offset="0%" stop-color="#C9772A"/>' +
        '<stop offset="70%" stop-color="#F2933A"/>' +
        '<stop offset="100%" stop-color="#FFC46A"/></linearGradient>' +
        '<linearGradient id="aFanGrad" gradientUnits="userSpaceOnUse" x1="100" y1="300" x2="500" y2="300">' +
        '<stop offset="0%" stop-color="#2A7FC4"/>' +
        '<stop offset="55%" stop-color="#46C8E6"/>' +
        '<stop offset="100%" stop-color="' + DEFAULT_ACCENT + '"/></linearGradient>' +
        '<filter id="aHalo" x="-60%" y="-60%" width="220%" height="220%">' +
        '<feGaussianBlur stdDeviation="3.5"/></filter>' +
        '<filter id="aNeedleGlow" x="-150%" y="-150%" width="400%" height="400%">' +
        '<feGaussianBlur stdDeviation="2.2" result="b"/>' +
        '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
        '<filter id="aChevGlow" x="-150%" y="-150%" width="400%" height="400%">' +
        '<feGaussianBlur stdDeviation="2.4" result="b"/>' +
        '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
      svg.appendChild(defs);
      // accent-driven fan gradient end stop (updated each render).
      this._refs.fanGradEnd = defs.querySelector("#aFanGrad stop:last-child");

      // ---- name title (top open band, above the arc apex) ----
      this._refs.title = el("text", {
        x: CX, y: 34, "text-anchor": "middle", class: "ct-title nope",
        "font-size": "24", "letter-spacing": "3", fill: "rgba(234,235,238,.92)",
      }, "");
      svg.appendChild(this._refs.title);

      // ---- TEMP reference scale (ticks + numbers), rebuilt on range/unit/step change ----
      const ticks = el("g", { class: "ct-ticks nope", "stroke-linecap": "round" });
      this._refs.ticks = ticks;
      svg.appendChild(ticks);
      this._buildTicks();

      // ---- FAN ARC (outer, thin) ----
      this._refs.fanTrack = el("path", {
        class: "nope", fill: "none", stroke: "rgba(20,30,40,.55)", "stroke-width": "7", "stroke-linecap": "round",
        d: arcPath(CX, CY, R_FAN, START_ANG, END_ANG),
      });
      svg.appendChild(this._refs.fanTrack);
      this._refs.fanFill = el("path", {
        class: "nope", fill: "none", stroke: "url(#aFanGrad)", "stroke-width": "7", "stroke-linecap": "round",
        d: arcPath(CX, CY, R_FAN, START_ANG, START_ANG + 0.01),
      });
      svg.appendChild(this._refs.fanFill);

      // ---- TEMP ARC (inner, thick) ----
      this._refs.track = el("path", {
        class: "nope", fill: "none", stroke: "rgba(27,39,51,.65)", "stroke-width": "16", "stroke-linecap": "round",
        d: arcPath(CX, CY, R_TEMP, START_ANG, END_ANG),
      });
      svg.appendChild(this._refs.track);
      this._refs.coldHalo = el("path", { class: "nope", fill: "none", stroke: "#5CD6FF", "stroke-width": "16", "stroke-linecap": "round", opacity: ".40", filter: "url(#aHalo)", d: "" });
      this._refs.warmHalo = el("path", { class: "nope", fill: "none", stroke: "#F2933A", "stroke-width": "16", "stroke-linecap": "round", opacity: ".40", filter: "url(#aHalo)", d: "" });
      this._refs.coldFill = el("path", { class: "nope", fill: "none", stroke: "url(#aColdGrad)", "stroke-width": "16", "stroke-linecap": "round", d: "" });
      this._refs.warmFill = el("path", { class: "nope", fill: "none", stroke: "url(#aWarmGrad)", "stroke-width": "16", "stroke-linecap": "round", d: "" });
      svg.appendChild(this._refs.coldHalo);
      svg.appendChild(this._refs.warmHalo);
      svg.appendChild(this._refs.coldFill);
      svg.appendChild(this._refs.warmFill);

      // ---- current-temp marker (white inset triangle, no glow) ----
      this._refs.curMarker = el("path", { class: "nope", fill: "#dfe8ef", opacity: ".9", d: "" });
      svg.appendChild(this._refs.curMarker);

      // ---- TEMP HANDLE (fat rounded warm needle; tip authored at +Y = inward) ----
      const tempNeedle = el("g", { class: "ct-needle nope" });
      tempNeedle.innerHTML =
        '<path d="M 0 15 Q 5.6 10 7.2 2.5 Q 8.2 -4.5 4.2 -9.5 Q 2.2 -11.5 0 -10 Q -2.2 -11.5 -4.2 -9.5 ' +
        'Q -8.2 -4.5 -7.2 2.5 Q -5.6 10 0 15 Z" fill="#F2933A" stroke="#FFB55E" stroke-width="1" ' +
        'stroke-opacity=".55" stroke-linejoin="round" filter="url(#aNeedleGlow)"/>' +
        '<path d="M 0 12 Q 3.2 6 3.6 0 Q 1.8 -3 0 -2.5 Q -1.8 -3 -3.6 0 Q -3.2 6 0 12 Z" ' +
        'fill="rgba(255,225,170,.45)" stroke="none"/>';
      this._refs.tempNeedle = tempNeedle;
      svg.appendChild(tempNeedle);

      // ---- FAN HANDLE (glass chevron; tip at +Y so rotate(ang) faces inward) ----
      // overflow:hidden on .ct-svg is the hard backstop so the chevron never bleeds.
      const fanHandle = el("g", { class: "ct-handle nope" });
      fanHandle.innerHTML =
        '<path d="M 0 11.5 L 10.2 -4.25 L 5.95 -7.9 L 0 3.6 L -5.95 -7.9 L -10.2 -4.25 Z" fill="rgba(79,195,247,.34)" ' +
        'stroke="' + DEFAULT_ACCENT + '" stroke-width="1.8" stroke-linejoin="round" filter="url(#aChevGlow)"/>' +
        '<path d="M 0 7.5 L 4.6 -2.9 L -4.6 -2.9 Z" fill="rgba(207,244,255,.40)" stroke="none"/>';
      this._refs.fanHandle = fanHandle;
      this._refs.fanHandlePath = fanHandle.querySelector("path"); // outer chevron (accent stroke/fill)
      svg.appendChild(fanHandle);

      // ---- top climate glyph (arc apex, above the number) ----
      this._refs.modeGlyph = el("g", {
        class: "ct-modeglyph nope", fill: "none", stroke: "#6A7A86", "stroke-width": "2",
        "stroke-linecap": "round", "stroke-linejoin": "round", opacity: ".55",
        transform: "translate(300,136)",
      });
      svg.appendChild(this._refs.modeGlyph);

      // ---- CENTER TEXT BLOCK: glyph(apex) > MODE > NOW xx (two-tone) > big number ----
      this._refs.labelTop = el("text", {
        x: CX, y: 178, "text-anchor": "middle", class: "ct-labeltop nope",
        fill: "rgba(234,235,238,.8)", "font-size": "16", "letter-spacing": "4", opacity: ".95",
      }, "COOL");
      this._refs.labelTop.style.fontWeight = "600";
      svg.appendChild(this._refs.labelTop);

      // NOW xx, two-tone: grey "NOW " + bright value.
      this._refs.nowCap = el("text", {
        x: CX, y: 196, "text-anchor": "middle", class: "ct-now nope",
        "font-size": "15", "letter-spacing": "2.5",
      });
      this._refs.nowCap.style.fontWeight = "600";
      this._refs.nowCap.appendChild(el("tspan", { fill: "#8c99a7" }, "NOW "));
      this._refs.nowVal = el("tspan", { fill: "rgba(234,235,238,.92)" }, "--°");
      this._refs.nowCap.appendChild(this._refs.nowVal);
      svg.appendChild(this._refs.nowCap);

      // big setpoint number (no degree).
      this._refs.bigNum = el("text", {
        x: CX, y: 266, "text-anchor": "middle", "dominant-baseline": "central", class: "ct-big nope",
        fill: "rgba(234,235,238,.98)", "font-size": "104", "letter-spacing": "2",
      }, "--");
      this._refs.bigNum.style.fontWeight = "300";
      svg.appendChild(this._refs.bigNum);

      // caret near the big number; shown only when hvac_action=cooling/heating.
      this._refs.caret = el("path", {
        class: "ct-caret nope", transform: "translate(372,248)", fill: this._accent, "stroke-linejoin": "round",
      });
      this._refs.caret.style.filter = `drop-shadow(0 0 4px ${this._glow(55)})`;
      this._refs.caret.style.display = "none";
      svg.appendChild(this._refs.caret);

      // ---- clover fan (lower-LEFT), spins with the FAN value ----
      const fanG = el("g", { class: "ct-clover nope", transform: "translate(212,322)" });
      const fanSpin = el("g", { fill: "#9fb1c0", opacity: ".75" });
      fanSpin.style.transformBox = "fill-box";
      fanSpin.style.transformOrigin = "center";
      fanSpin.innerHTML = `<path d="${fanGlyph()}"/>`;
      fanG.appendChild(fanSpin);
      fanG.appendChild(el("circle", { cx: 0, cy: 0, r: 3.2, fill: "#c2cedb" }));
      this._refs.fanSpin = fanSpin;
      this._refs.clover = fanG;
      svg.appendChild(fanG);

      // fan VALUE readout.
      this._refs.fanPct = el("text", {
        x: 212, y: 355, "text-anchor": "middle", class: "ct-fanpct nope",
        fill: "rgba(234,235,238,.92)", "font-size": "22", "letter-spacing": "0.5", opacity: "1",
      }, "--%");
      this._refs.fanPct.style.fontWeight = "600";
      svg.appendChild(this._refs.fanPct);

      // fan NAME label (AUTO/SILENT/MEDIUM/... for percent mode).
      this._refs.fanName = el("text", {
        x: 212, y: 377, "text-anchor": "middle", class: "ct-fanname nope",
        fill: "rgba(234,235,238,.7)", "font-size": "12", "letter-spacing": "2", opacity: ".9",
      }, "");
      this._refs.fanName.style.fontWeight = "600";
      svg.appendChild(this._refs.fanName);

      // clover tap hit (TAP = AUTO, or cycle named fan_mode when there's no auto).
      this._refs.fanIconHit = el("circle", { class: "ct-hit", cx: 212, cy: 322, r: 24, fill: "transparent" });
      svg.appendChild(this._refs.fanIconHit);
      this._onFanIconDown = (e) => this._fanIconPointerDown(e);
      this._refs.fanIconHit.addEventListener("pointerdown", this._onFanIconDown);

      // ---- VERTICAL SWING chip (lower-RIGHT) ----
      const swingChip = el("g", { class: "ct-swing ct-hit", transform: "translate(388,322)" });
      this._refs.swingChipBg = el("rect", {
        x: -19, y: -15, width: 38, height: 30, rx: 9,
        fill: "rgba(40,52,66,.30)", stroke: "rgba(234,235,238,.14)", "stroke-width": "1",
      });
      swingChip.appendChild(this._refs.swingChipBg);
      this._refs.swingIcon = el("path", {
        d: "M -5 -3 L 0 -9 L 5 -3 M 0 -9 L 0 9 M -5 3 L 0 9 L 5 3",
        fill: "none", stroke: "#6a7480", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round",
      });
      swingChip.appendChild(this._refs.swingIcon);
      this._refs.swingChip = swingChip;
      svg.appendChild(swingChip);
      this._refs.swingCap = el("text", {
        x: 388, y: 363, "text-anchor": "middle", class: "ct-swingcap nope",
        fill: "rgba(234,235,238,.7)", "font-size": "13.5", "letter-spacing": "2", opacity: ".9",
      }, "SWING");
      this._refs.swingCap.style.fontWeight = "600";
      svg.appendChild(this._refs.swingCap);
      this._onSwingDown = (e) => this._swingPointerDown(e);
      swingChip.addEventListener("pointerdown", this._onSwingDown);

      // ---- center disc: tap to open the MODE POPUP ----
      this._refs.centerHit = el("circle", { class: "ct-hit", cx: 300, cy: 255, r: 86, fill: "transparent" });
      svg.appendChild(this._refs.centerHit);
      this._refs.centerHit.addEventListener("click", (e) => { e.stopPropagation(); this._openPop(); });

      // ---- drag-to-set: TWO transparent stroke "grab" bands (temp inner / fan outer) ----
      this._refs.drag = el("path", {
        class: "ct-hit", fill: "none", stroke: "transparent", "stroke-width": "63", "stroke-linecap": "butt",
        d: arcPath(CX, CY, 181.5, START_ANG, END_ANG), // WIDE band r ~150..213 (temp ring)
      });
      this._refs.fanGrab = el("path", {
        class: "ct-hit", fill: "none", stroke: "transparent", "stroke-width": "62", "stroke-linecap": "butt",
        d: arcPath(CX, CY, 244, START_ANG, END_ANG), // WIDE band r ~213..275 (fan ring)
      });
      svg.appendChild(this._refs.drag);
      svg.appendChild(this._refs.fanGrab);

      card.appendChild(svg);

      this._onTempDown = (e) => this._ringPointerDown(e, "temp");
      this._onFanDown = (e) => this._ringPointerDown(e, "fan");
      this._onRingMove = (e) => this._ringPointerMove(e);
      this._onRingUp = (e) => this._ringPointerUp(e);
      this._refs.drag.addEventListener("pointerdown", this._onTempDown);
      this._refs.fanGrab.addEventListener("pointerdown", this._onFanDown);

      // ---- MODE POPUP (position:fixed glass overlay; built lazily on first open) ----
      const pop = document.createElement("div");
      pop.className = "ct-pop";
      pop.addEventListener("click", (e) => { if (e.target === pop) this._closePop(); });
      const sheet = document.createElement("div");
      sheet.className = "ct-sheet";
      pop.appendChild(sheet);
      this._refs.pop = pop;
      this._refs.sheet = sheet;
      card.appendChild(pop);

      this._built = true;
      this._applyMaxHeight(); // apply any max_height set before this build
    }

    // Rebuild the numbered scale. Ticks at `step` (coarsened if dense); labels every
    // 5 degrees so they always land regardless of step/unit.
    _buildTicks() {
      if (!this._refs.ticks) return;
      const { lo, hi } = this._range();
      const step = this._step();
      const span = (hi - lo) || 1;
      let minor = step;
      if (span / minor > 40) minor = span / 40; // cap minor-tick count ~40
      const labelStride = 5;                     // numbered every 5 degrees (F and C)
      const rTickOut = R_TEMP - 10;              // just inside the thick temp ring
      const rNum = R_TEMP - 40;                  // number ring inside the ticks
      let tk = "";
      // minor + major tick LINES
      for (let t = lo; t <= hi + 1e-6; t += minor) {
        const ang = START_ANG + SPAN * ((t - lo) / span);
        const major = Math.abs(t / labelStride - Math.round(t / labelStride)) < 1e-6;
        const len = major ? 13 : 6;
        const a = polar(CX, CY, rTickOut - len, ang), b = polar(CX, CY, rTickOut, ang);
        tk += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" ` +
          `stroke="${major ? "rgba(234,235,238,.62)" : "rgba(234,235,238,.24)"}" stroke-width="${major ? 2.6 : 1.5}"/>`;
      }
      // numbered LABELS every labelStride (decoupled from `minor` so they always land)
      const firstLabel = Math.ceil(lo / labelStride - 1e-6) * labelStride;
      for (let t = firstLabel; t <= hi + 1e-6; t += labelStride) {
        const ang = START_ANG + SPAN * ((t - lo) / span);
        const np = polar(CX, CY, rNum, ang);
        tk += `<text x="${np[0].toFixed(1)}" y="${np[1].toFixed(1)}" text-anchor="middle" dominant-baseline="central" ` +
          `font-size="14.5" letter-spacing="0.5" font-weight="600" fill="rgba(234,235,238,.88)">${this._fmt(t)}</text>`;
      }
      this._refs.ticks.innerHTML = tk;
      this._lo = lo; this._hi = hi; this._tickStep = step;
    }

    // ============================================================================
    // POINTER MAPPING  (MANUAL LETTERBOX, not getScreenCTM)
    // ============================================================================
    _eventToVB(e) {
      const svg = this._svg;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      // Letterbox-correct client->viewBox mapping (preserveAspectRatio meet).
      const scale = Math.min(rect.width / this._VBW, rect.height / this._VBH);
      const offX = (rect.width - this._VBW * scale) / 2;
      const offY = (rect.height - this._VBH * scale) / 2;
      const vx = (e.clientX - rect.left - offX) / scale;
      const vy = (e.clientY - rect.top - offY) / scale;
      return { vx, vy };
    }
    // 0..1 fraction along the arc (gap clamps to the nearest tip).
    _eventToFrac(e) {
      const p = this._eventToVB(e);
      if (!p) return null;
      const dx = p.vx - this._cx, dy = p.vy - this._cy;
      let ang = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 at top, clockwise
      if (ang < 0) ang += 360;
      let rel = ang - this._startAng;
      if (rel < 0) rel += 360;
      if (rel > this._span) rel = (rel - this._span) < (360 - rel) ? this._span : 0;
      return clamp(rel / this._span, 0, 1);
    }
    _eventToRadius(e) {
      const p = this._eventToVB(e);
      if (!p) return null;
      return Math.hypot(p.vx - this._cx, p.vy - this._cy);
    }
    _eventToTemp(e) {
      const f = this._eventToFrac(e);
      if (f == null) return null;
      const { lo, hi } = this._range();
      const st = this._step();
      return clamp(Math.round((lo + f * (hi - lo)) / st) * st, lo, hi); // snap to step
    }
    _eventToFanPct(e) {
      const f = this._eventToFrac(e);
      if (f == null) return null;
      return fanSnapPct(f);
    }
    _eventToFanIndex(e, n) {
      const f = this._eventToFrac(e);
      if (f == null) return null;
      if (n <= 1) return 0;
      return clamp(Math.round(f * (n - 1)), 0, n - 1);
    }

    // ============================================================================
    // SERVICE CALLS  (failure-aware: optimistic paint must self-correct, issue #9)
    // ============================================================================
    // Fire a service call and handle BOTH failure modes: callService can throw
    // synchronously (e.g. no _hass), and the promise it returns can reject (the
    // device refused / connection dropped). On either, run onRevert so the
    // optimistic paint drops back to real state instead of holding a false
    // success that snaps back on a blind timer.
    _svc(domain, service, data, onRevert) {
      if (!this._hass) return;
      let p;
      try {
        p = this._hass.callService(domain, service, data);
      } catch (e) {
        console.warn("climate-cluster-card: " + domain + "." + service + " failed", e);
        if (onRevert) onRevert();
        return;
      }
      if (p && typeof p.then === "function") {
        p.catch((e) => {
          console.warn("climate-cluster-card: " + domain + "." + service + " failed", e);
          if (onRevert) onRevert();
        });
      }
    }

    // ---- optimistic reverts (drop the optimistic value, repaint real state) ----
    _revertTemp() {
      this._optimisticTarget = null;
      this._optimisticUntil = 0;
      this._render();
    }
    _revertFan() {
      this._optimisticFanPct = null;
      this._optimisticFanName = null;
      this._optimisticFanUntil = 0;
      this._render();
    }
    _revertToggle(kind) {
      if (this._optToggle) this._optToggle[kind] = null;
      if (this._popOpen) this._paintPop();
      this._render();
    }

    // Reconcile optimistic paints against the real incoming state (issue #9):
    // the moment the entity reports the value we asked for, drop the optimistic
    // hold so we track live state again (no flicker-then-jump on a slow device).
    // A failed call never matches, so it falls through to the OPT_HOLD_MS
    // fallback (and its .catch() reverts it sooner). Skipped mid-drag: the user
    // still owns the value until they release.
    _reconcileOptimistic(attr) {
      if (this._dragging) return;
      const now = Date.now();

      // TEMP: optimistic is stored in DISPLAY units, so compare display-side.
      if (this._optimisticUntil) {
        if (now >= this._optimisticUntil) {
          this._optimisticTarget = null;
          this._optimisticUntil = 0;
        } else {
          const liveT = this._toDisplay(num(attr.temperature));
          if (liveT != null && this._optimisticTarget != null
              && Math.abs(liveT - this._optimisticTarget) < 0.1) {
            this._optimisticTarget = null;
            this._optimisticUntil = 0;
          }
        }
      }

      // FAN: percent reconciles against the number entity; a named mode against
      // climate.fan_mode.
      if (this._optimisticFanUntil) {
        if (now >= this._optimisticFanUntil) {
          this._optimisticFanPct = null;
          this._optimisticFanName = null;
          this._optimisticFanUntil = 0;
        } else if (this._optimisticFanPct != null) {
          const id = this._fanNumberId();
          const liveP = id ? num((this._st(id) || {}).state) : null;
          if (liveP != null && Math.abs(liveP - this._optimisticFanPct) < 0.5) {
            this._optimisticFanPct = null;
            this._optimisticFanUntil = 0;
          }
        } else if (this._optimisticFanName != null) {
          if (String(attr.fan_mode).toLowerCase() === String(this._optimisticFanName).toLowerCase()) {
            this._optimisticFanName = null;
            this._optimisticFanUntil = 0;
          }
        }
      }

      // TOGGLES (swing / led / sound): clear once the live on/off matches the flag.
      if (this._optToggle) {
        ["swing", "led", "sound"].forEach((kind) => {
          const o = this._optToggle[kind];
          if (!o) return;
          if (now >= o.until || this._liveFeatureOn(kind) === o.val) this._optToggle[kind] = null;
        });
      }
    }

    // ============================================================================
    // DRAG-TO-SET  (commit-on-pointerUP; optimistic paint, reconciled to live state)
    // ============================================================================
    _ringPointerDown(e, ring) {
      const s = this._st(this._config.entity);
      if (!s || s.state === "off" || s.state === "unavailable" || s.state === "unknown") return;
      if (this._popOpen) return;
      // Two-ring radius classification (temp inner / fan outer); fall back to the
      // band that received the event.
      const rad = this._eventToRadius(e);
      this._active = (rad != null && rad >= PICK_INNER && rad <= PICK_OUTER)
        ? (rad < PICK_SPLIT ? "temp" : "fan")
        : ring;
      // ARM, don't paint yet: a pure tap must NOT commit a setpoint (issue #4).
      // We hold off on preventDefault and on the first paint until the pointer
      // travels past DRAG_THRESH_PX, so a stray tap is discarded and a vertical
      // swipe that begins here can still start a page scroll.
      e.stopPropagation();
      this._ringArmed = true;
      this._dragging = false;
      this._ringStart = { x: e.clientX, y: e.clientY };
      this._pendingTemp = null;
      this._fanPendingPct = null;
      this._fanPendingName = null;
      try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
      window.addEventListener("pointermove", this._onRingMove);
      window.addEventListener("pointerup", this._onRingUp);
      window.addEventListener("pointercancel", this._onRingUp);
    }
    _ringPointerMove(e) {
      if (!this._ringArmed) return;
      if (!this._dragging) {
        // tap-vs-drag gate: nothing paints or commits until travel crosses the
        // threshold (same ~8px the fan clover uses). Below it, leave the gesture
        // free so the browser can still scroll.
        const st = this._ringStart;
        if (!st || Math.hypot(e.clientX - st.x, e.clientY - st.y) <= DRAG_THRESH_PX) return;
        this._dragging = true; // drag CONFIRMED -> from here touchmove preventDefaults
      }
      this._applyRingDrag(e);
    }
    _ringPointerUp() {
      if (!this._ringArmed) return;
      const wasDragging = this._dragging;
      this._ringArmed = false;
      this._dragging = false;
      this._ringStart = null;
      window.removeEventListener("pointermove", this._onRingMove);
      window.removeEventListener("pointerup", this._onRingUp);
      window.removeEventListener("pointercancel", this._onRingUp);
      // COMMIT ONCE on release -- but only for a real drag. A pure tap never
      // crossed the threshold (no pending value, wasDragging false) so it is
      // discarded and cannot change the setpoint (issue #4).
      if (wasDragging) {
        if (this._active === "temp" && this._pendingTemp != null && isFinite(this._pendingTemp)) {
          this._commitTemp(this._pendingTemp);
        } else if (this._active === "fan") {
          if (this._fanPendingPct != null) this._commitFanPct(this._fanPendingPct);
          else if (this._fanPendingName != null) this._commitFanName(this._fanPendingName);
        }
      }
      this._active = null;
      this._pendingTemp = null;
      this._fanPendingPct = null;
      this._fanPendingName = null;
    }
    _applyRingDrag(e) {
      if (this._active === "temp") {
        const t = this._eventToTemp(e);
        if (t == null) return;
        this._pendingTemp = t;
        // optimistic paint every move; NO service call here.
        this._optimisticTarget = t;
        this._optimisticUntil = Date.now() + OPT_HOLD_MS;
        this._paintTempArc(t);
      } else if (this._active === "fan") {
        if (this._fanNumberId()) {
          const p = this._eventToFanPct(e);
          if (p == null) return;
          this._fanPendingPct = p;
          this._optimisticFanPct = p;
          this._optimisticFanName = null;
          this._optimisticFanUntil = Date.now() + OPT_HOLD_MS;
          this._paintFanPct(p);
        } else {
          const names = this._fanNamedModes();
          if (!names.length) return;
          const i = this._eventToFanIndex(e, names.length);
          if (i == null) return;
          this._fanPendingName = names[i];
          this._optimisticFanName = names[i];
          this._optimisticFanPct = null;
          this._optimisticFanUntil = Date.now() + OPT_HOLD_MS;
          this._paintFanNamed(names, names[i]);
        }
      }
    }

    // ---- TEMPERATURE service calls (signature preserved; value unit-converted) ----
    _callTemp(t) {
      if (t == null || !this._hass) return;
      this._svc("climate", "set_temperature",
        { entity_id: this._config.entity, temperature: this._toHa(t) },
        () => this._revertTemp());
    }
    _commitTemp(t) {
      if (t == null || !this._hass) return;
      const s = this._st(this._config.entity);
      if (!s) return;
      this._optimisticTarget = t;
      this._optimisticUntil = Date.now() + OPT_HOLD_MS;
      this._paintTempArc(t);
      this._callTemp(t);
    }

    // ---- FAN service calls ----
    _fanNamedForPct(p) {
      if (p <= 20) return "silent";
      if (p <= 40) return "low";
      if (p <= 60) return "medium";
      if (p <= 80) return "high";
      return "full";
    }
    // Authoritative fan write: set the percent number. Also pull the climate
    // fan_mode off "auto" to a named bucket so the percent actually applies (Midea).
    _callFanPct(p) {
      if (!this._hass) return;
      const id = this._fanNumberId();
      if (!id) {
        this._svc("climate", "set_fan_mode",
          { entity_id: this._config.entity, fan_mode: this._fanNamedForPct(p) },
          () => this._revertFan());
        return;
      }
      const s = this._st(this._config.entity);
      if (s && String(s.attributes.fan_mode).toLowerCase() === "auto") {
        this._svc("climate", "set_fan_mode",
          { entity_id: this._config.entity, fan_mode: this._fanNamedForPct(p) },
          () => this._revertFan());
      }
      this._svc("number", "set_value",
        { entity_id: id, value: clamp(p, FAN_MIN, FAN_MAX) },
        () => this._revertFan());
    }
    _commitFanPct(p) {
      this._optimisticFanPct = clamp(p, FAN_MIN, FAN_MAX);
      this._optimisticFanName = null;
      this._optimisticFanUntil = Date.now() + OPT_HOLD_MS;
      this._paintFanPct(this._optimisticFanPct);
      this._callFanPct(this._optimisticFanPct);
    }
    // Named fan_mode commit (discrete-stop ring), optimistic + climate.set_fan_mode.
    _commitFanName(name) {
      if (!name) return;
      this._optimisticFanName = name;
      this._optimisticFanPct = null;
      this._optimisticFanUntil = Date.now() + OPT_HOLD_MS;
      this._paintFanNamed(this._fanNamedModes(), name);
      this._svcSetFanMode(name);
    }
    // Set the climate fan_mode to "auto" + paint optimistically.
    _callFanAuto() {
      if (!this._hass) return;
      this._optimisticFanUntil = 0; // drop any stale optimism so AUTO paints
      this._optimisticFanPct = null;
      this._optimisticFanName = null;
      this._paintFanAuto();
      // No optimistic value to revert here (AUTO drops optimism above); on
      // failure just repaint live state so the ring snaps back to reality.
      this._svc("climate", "set_fan_mode",
        { entity_id: this._config.entity, fan_mode: "auto" },
        () => this._render());
    }

    // Fan ICON tap. Movement-thresholded so a drag never fires it.
    _fanIconPointerDown(e) {
      const s = this._st(this._config.entity);
      if (!s || s.state === "off" || s.state === "unavailable" || s.state === "unknown") return;
      if (this._popOpen) return;
      e.preventDefault();
      e.stopPropagation();
      this._fanIconStart = { x: e.clientX, y: e.clientY };
      try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
      this._onFanIconUp = (ev) => this._fanIconPointerUp(ev);
      window.addEventListener("pointerup", this._onFanIconUp);
      window.addEventListener("pointercancel", this._onFanIconUp);
    }
    _fanIconPointerUp(e) {
      window.removeEventListener("pointerup", this._onFanIconUp);
      window.removeEventListener("pointercancel", this._onFanIconUp);
      const st = this._fanIconStart;
      this._fanIconStart = null;
      if (!st || e.type === "pointercancel") return;
      const moved = Math.hypot(e.clientX - st.x, e.clientY - st.y);
      if (moved > DRAG_THRESH_PX) return; // it was a drag, not a tap
      this._fanCloverTap();
    }
    // Clover tap: percent mode OR auto-capable -> AUTO; named-without-auto -> cycle.
    _fanCloverTap() {
      const s = this._st(this._config.entity);
      const attr = (s && s.attributes) || {};
      const fanModes = attr.fan_modes || [];
      const hasAuto = fanModes.some((m) => String(m).toLowerCase() === "auto");
      if (this._fanNumberId() || hasAuto) { this._callFanAuto(); return; }
      const names = this._fanNamedModes();
      if (!names.length) return;
      let i = names.findIndex((m) => String(m).toLowerCase() === String(attr.fan_mode).toLowerCase());
      const next = names[(i + 1 + (i < 0 ? 0 : 0)) % names.length];
      this._commitFanName(i < 0 ? names[0] : next);
    }

    // ============================================================================
    // FEATURES (swing / led / sound): config -> sibling -> climate attr -> hide
    // ============================================================================
    _featureCfg(kind) {
      const cfg = this._config || {};
      const key = kind === "swing" ? "show_swing" : kind === "led" ? "show_led" : "show_sound";
      const v = cfg[key];
      return (v === undefined) ? "auto" : v;
    }
    _ledRef() { return (this._config && this._config.led_entity) || this._siblings().screen || null; }
    _soundRef() { return (this._config && this._config.sound_entity) || this._siblings().sound || null; }
    // Swing resolution: switch (config/sibling) -> climate swing_modes -> null.
    _swingMode() {
      const cfg = this._config || {};
      if (cfg.swing_entity && this._st(cfg.swing_entity)) return { kind: "switch", ref: cfg.swing_entity };
      const sib = this._siblings();
      if (sib.swing_v && this._st(sib.swing_v)) return { kind: "switch", ref: sib.swing_v };
      const s = this._st(cfg.entity);
      const sm = s && s.attributes && s.attributes.swing_modes;
      if (sm && sm.length) return { kind: "climate", ref: cfg.entity };
      return { kind: null, ref: null };
    }
    _swingIsOn() {
      const m = this._swingMode();
      if (m.kind === "switch") { const st = this._st(m.ref); return !!(st && st.state === "on"); }
      if (m.kind === "climate") {
        const st = this._st(m.ref);
        const sv = st && st.attributes && st.attributes.swing_mode;
        return !!(sv && String(sv).toLowerCase() !== "off");
      }
      return false;
    }
    _swingToggle() {
      const m = this._swingMode();
      if (!this._hass || !m.kind) return;
      if (m.kind === "switch") {
        const st = this._st(m.ref);
        const on = !!(st && st.state === "on");
        this._svc("switch", on ? "turn_off" : "turn_on", { entity_id: m.ref },
          () => this._revertToggle("swing"));
        return;
      }
      // climate generic: toggle between first non-off swing_mode and "off".
      const st = this._st(m.ref);
      const modes = (st && st.attributes && st.attributes.swing_modes) || [];
      const onMode = modes.find((x) => String(x).toLowerCase() !== "off") || modes[0] || "vertical";
      this._svcSetSwingMode(this._swingIsOn() ? "off" : onMode);
    }
    // Resolved (visible) for a feature, honoring show_* === false.
    _featureResolved(kind) {
      if (this._featureCfg(kind) === false) return false;
      if (kind === "swing") return !!this._swingMode().kind;
      const ref = kind === "led" ? this._ledRef() : this._soundRef();
      return !!(ref && this._st(ref));
    }
    // Raw live on/off for a feature, bypassing any optimistic hold (used by the
    // reconciler to decide when the real state has caught up).
    _liveFeatureOn(kind) {
      if (kind === "swing") return this._swingIsOn();
      const ref = kind === "led" ? this._ledRef() : this._soundRef();
      const st = ref ? this._st(ref) : null;
      return !!(st && st.state === "on");
    }
    // Optimistic-or-live on/off (held until reconciled or OPT_HOLD_MS, like temp/fan).
    _featureOn(kind) {
      const o = this._optToggle && this._optToggle[kind];
      if (o && Date.now() < o.until) return o.val;
      return this._liveFeatureOn(kind);
    }
    _featureToggle(kind) {
      if (kind === "swing") {
        this._optToggle = this._optToggle || {};
        this._optToggle.swing = { val: !this._swingIsOn(), until: Date.now() + OPT_HOLD_MS };
        this._paintPop();
        this._swingToggle();
        return;
      }
      const ref = kind === "led" ? this._ledRef() : this._soundRef();
      if (!ref || !this._hass) return;
      const st = this._st(ref);
      const on = !!(st && st.state === "on");
      this._optToggle = this._optToggle || {};
      this._optToggle[kind] = { val: !on, until: Date.now() + OPT_HOLD_MS };
      this._paintPop();
      this._svc("switch", on ? "turn_off" : "turn_on", { entity_id: ref },
        () => this._revertToggle(kind));
    }

    // ---- face VERTICAL SWING chip ----
    _swingPointerDown(e) {
      e.stopPropagation();
      e.preventDefault();
      if (!this._swingMode().kind || !this._hass) return;
      this._featureToggle("swing");
      this._render(); // optimistic face repaint
    }

    // ---- service-call signatures preserved for contract parity (failure-aware) ----
    _svcSetSwingMode(v) { this._svc("climate", "set_swing_mode", { entity_id: this._config.entity, swing_mode: v }, () => this._revertToggle("swing")); }
    _svcSetPresetMode(v) { this._svc("climate", "set_preset_mode", { entity_id: this._config.entity, preset_mode: v }, () => this._render()); }
    _svcSetFanMode(v) { this._svc("climate", "set_fan_mode", { entity_id: this._config.entity, fan_mode: v }, () => this._revertFan()); }
    _svcPower(on) { this._svc("climate", on ? "turn_on" : "turn_off", { entity_id: this._config.entity }, () => this._render()); }

    // ============================================================================
    // MODE POPUP  (from config.modes or hvac_modes; active = UI accent)
    // ============================================================================
    _buildPop() {
      if (this._popBuilt) return;
      const s = this._st(this._config.entity);
      if (!s) return; // retry on next open when state arrives
      const sheet = this._refs.sheet;
      sheet.innerHTML = "";
      const modes = this._config.modes
        || s.attributes.hvac_modes
        || ["off", "cool", "heat", "heat_cool", "dry", "fan_only", "auto"];
      modes.forEach((m) => {
        const b = document.createElement("button");
        b.dataset.mode = m;
        b.textContent = MODE_LABEL[m] || String(m).toUpperCase();
        sheet.appendChild(b);
      });
      // TOGGLES ROW (SWING / LED / SOUND), below the modes with a separator. Built
      // once; visibility + lit state are driven in _paintPop so an unresolved chip
      // simply hides (like the face swing chip).
      const row = document.createElement("div");
      row.className = "ct-toggles";
      this._refs.toggles = {};
      TOGGLE_DEFS.forEach((t) => {
        const b = document.createElement("button");
        b.className = "ct-toggle";
        b.dataset.toggle = t.kind;
        b.innerHTML =
          '<svg class="ct-tg-ic" viewBox="-12 -12 24 24" aria-hidden="true">' + t.svg + "</svg>" +
          '<span class="ct-tg-lb">' + t.label + "</span>";
        row.appendChild(b);
        this._refs.toggles[t.kind] = b;
      });
      sheet.appendChild(row);
      if (!this._onPopClick) {
        this._onPopClick = (e) => {
          const b = e.target && e.target.closest ? e.target.closest("button") : null;
          if (!b) return;
          e.stopPropagation();
          // Toggle chips flip a feature and KEEP the popup open; mode buttons close it.
          if (b.dataset.toggle) { this._featureToggle(b.dataset.toggle); return; }
          this._selectMode(b.dataset.mode);
        };
        sheet.addEventListener("click", this._onPopClick);
      }
      this._popBuilt = true;
    }

    _selectMode(mode) {
      if (this._hass) {
        const ent = this._config.entity;
        const s = this._st(ent);
        const isOff = s && s.state === "off";
        // Mode has no optimistic paint (the dial reads live s.state), so on
        // failure there is nothing to snap back; just repaint live state.
        if (mode === "off") {
          this._svc("climate", "turn_off", { entity_id: ent }, () => this._render());
        } else {
          if (isOff) this._svc("climate", "turn_on", { entity_id: ent }, () => this._render());
          this._svc("climate", "set_hvac_mode", { entity_id: ent, hvac_mode: mode }, () => this._render());
        }
      }
      this._closePop();
    }
    _paintPop() {
      if (!this._popBuilt) return;
      const s = this._st(this._config.entity);
      const cur = s ? s.state : null;
      // Mode buttons only (scoped so the toggle chips never get the mode "active").
      this._refs.sheet.querySelectorAll("button[data-mode]").forEach((b) =>
        b.classList.toggle("active", b.dataset.mode === cur));
      // TOGGLES ROW: hide an unresolved chip; else lit ".on" = feature on.
      if (this._refs.toggles) {
        TOGGLE_DEFS.forEach((t) => {
          const b = this._refs.toggles[t.kind];
          if (!b) return;
          if (!this._featureResolved(t.kind)) { b.style.display = "none"; return; }
          b.style.display = "";
          b.classList.toggle("on", this._featureOn(t.kind));
        });
      }
    }
    _openPop() {
      if (!this._refs.pop) return;
      this._popOpen = true;
      this._buildPop();
      this._paintPop();
      this._refs.pop.classList.add("open");
    }
    _closePop() {
      this._popOpen = false;
      if (this._refs.pop) this._refs.pop.classList.remove("open");
    }

    // ============================================================================
    // PAINT HELPERS  (pure visual; optimistic-safe)
    // ============================================================================
    _tempToAng(t) {
      const { lo, hi } = this._range();
      return START_ANG + SPAN * clamp((t - lo) / (hi - lo), 0, 1);
    }
    _fanPctToAng(p) {
      return START_ANG + SPAN * clamp((p - FAN_MIN) / (FAN_MAX - FAN_MIN), 0, 1);
    }

    // Centralized fan-clover spin per fan_animation / fan_animation_speed.
    // (render still overrides to "none" when the unit is pushing no air.)
    _applyFanSpin(p, isAuto) {
      const cfg = this._config || {};
      if (cfg.fan_animation === false || cfg.fan_animation_speed === "off") {
        this._refs.fanSpin.style.animation = "none";
        return;
      }
      if (cfg.fan_animation_speed === "constant") {
        this._refs.fanSpin.style.animation = "ctfanspin 1.6s linear infinite";
        return;
      }
      // dynamic (default): speed scales with value.
      if (isAuto) { this._refs.fanSpin.style.animation = "ctfanspin 1.1s linear infinite"; return; }
      const dur = (3.2 - 2.7 * (clamp(p, 0, 100) / 100)).toFixed(2);
      this._refs.fanSpin.style.animation = `ctfanspin ${dur}s linear infinite`;
    }

    // Paint the temp arc (cold/warm split), the warm needle, + the big number.
    _paintTempArc(t) {
      if (t == null) return;
      const ang = this._tempToAng(t);
      const coldD = arcPath(CX, CY, R_TEMP, START_ANG, Math.max(START_ANG + 0.01, ang));
      const warmD = arcPath(CX, CY, R_TEMP, Math.min(ang, END_ANG - 0.01), END_ANG);
      this._refs.coldFill.setAttribute("d", coldD);
      this._refs.coldHalo.setAttribute("d", coldD);
      this._refs.warmFill.setAttribute("d", warmD);
      this._refs.warmHalo.setAttribute("d", warmD);
      const seat = polar(CX, CY, R_TEMP, ang);
      this._refs.tempNeedle.setAttribute("transform",
        `translate(${seat[0].toFixed(1)},${seat[1].toFixed(1)}) rotate(${ang.toFixed(1)})`);
      const txt = this._fmt(t);
      this._refs.bigNum.textContent = txt;
      // shrink for "XX.5" / 3-digit so the decimal fits the center.
      this._refs.bigNum.setAttribute("font-size", txt.length > 2 ? "84" : "104");
    }

    // Paint the fan ring for a percent (number.* entity).
    _paintFanPct(p) {
      p = clamp(p, FAN_MIN, FAN_MAX);
      const ang = this._fanPctToAng(p);
      this._refs.fanFill.setAttribute("d", arcPath(CX, CY, R_FAN, START_ANG, Math.max(START_ANG + 0.01, ang)));
      this._refs.fanFill.style.opacity = "1";
      const seat = polar(CX, CY, R_FAN + FAN_HANDLE_OFFSET, ang);
      this._refs.fanHandle.setAttribute("transform",
        `translate(${seat[0].toFixed(1)},${seat[1].toFixed(1)}) rotate(${ang.toFixed(1)})`);
      this._refs.fanPct.textContent = Math.round(p) + "%";
      this._refs.fanName.textContent = this._fanNamedForPct(p).toUpperCase();
      this._applyFanSpin(p, false);
    }

    // Paint the fan ring for a NAMED fan_mode (discrete stops along the arc).
    _paintFanNamed(names, curName) {
      const n = names.length;
      if (!n) return;
      if (String(curName).toLowerCase() === "auto") { this._paintFanAuto(); return; }
      let i = names.findIndex((m) => String(m).toLowerCase() === String(curName).toLowerCase());
      if (i < 0) i = 0;
      const frac = n <= 1 ? 1 : i / (n - 1);
      const ang = START_ANG + SPAN * clamp(frac, 0, 1);
      this._refs.fanFill.setAttribute("d", arcPath(CX, CY, R_FAN, START_ANG, Math.max(START_ANG + 0.01, ang)));
      this._refs.fanFill.style.opacity = "1";
      const seat = polar(CX, CY, R_FAN + FAN_HANDLE_OFFSET, ang);
      this._refs.fanHandle.setAttribute("transform",
        `translate(${seat[0].toFixed(1)},${seat[1].toFixed(1)}) rotate(${ang.toFixed(1)})`);
      this._refs.fanPct.textContent = String(names[i]).toUpperCase();
      this._refs.fanName.textContent = "";
      const pctEq = n <= 1 ? 100 : (i / (n - 1)) * 100;
      this._applyFanSpin(pctEq, false);
    }

    // Paint the AUTO state (climate.fan_mode == "auto"): full ring, dim, "AUTO".
    _paintFanAuto() {
      this._refs.fanFill.setAttribute("d", arcPath(CX, CY, R_FAN, START_ANG, END_ANG));
      this._refs.fanFill.style.opacity = "0.45";
      const seat = polar(CX, CY, R_FAN + FAN_HANDLE_OFFSET, END_ANG);
      this._refs.fanHandle.setAttribute("transform",
        `translate(${seat[0].toFixed(1)},${seat[1].toFixed(1)}) rotate(${END_ANG.toFixed(1)})`);
      this._refs.fanPct.textContent = "AUTO";
      this._refs.fanName.textContent = "";
      this._applyFanSpin(100, true);
    }

    _paintModeGlyph(mode, accent, off) {
      const g = GLYPH[mode] || GLYPH.cool;
      let html;
      if (g.special === "A") {
        html = `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="26" font-weight="700" fill="${accent}" stroke="none">A</text>`;
      } else if (g.special === "off") {
        html = `<circle cx="0" cy="0" r="11" fill="none" stroke="${accent}" stroke-width="2"/><line x1="0" y1="-11" x2="0" y2="-3" stroke="${accent}" stroke-width="2"/>`;
      } else if (g.special === "heatcool") {
        html = `<path d="M0,-12 L7,-4 L-7,-4 Z M0,12 L7,4 L-7,4 Z" fill="${accent}" stroke="none"/>`;
      } else if (g.special === "none") {
        html = "";
      } else if (g.stroke) {
        html = `<path d="${g.d}" fill="none" stroke="${accent}" stroke-width="2"/>`;
      } else {
        html = `<path d="${g.d}" fill="${accent}" stroke="none"/>`;
      }
      this._refs.modeGlyph.innerHTML = html;
      this._refs.modeGlyph.style.opacity = off ? "0.45" : "0.85";
    }

    // Display name: config.name first, else friendly_name, else entity id, else "AC".
    _acName() {
      const cfgName = this._config && this._config.name ? String(this._config.name).trim() : "";
      if (cfgName) return cfgName;
      const s = this._st(this._config && this._config.entity);
      const attr = (s && s.attributes) || {};
      return attr.friendly_name || (this._config && this._config.entity) || "AC";
    }

    // ============================================================================
    // RENDER  (patch-only; build never re-runs)
    // ============================================================================
    _render() {
      if (!this._built || !this._hass || !this._config) return;
      const card = this.shadowRoot.querySelector(".ct-card");
      if (!card) return;
      const s = this._st(this._config.entity);

      if (this._refs.title) this._refs.title.textContent = this._acName();

      // scale: rebuild when range/unit/step changed; honor show_scale.
      {
        const rng = this._range(), stp = this._step();
        if (this._lo !== rng.lo || this._hi !== rng.hi || this._tickStep !== stp) this._buildTicks();
        if (this._refs.ticks) this._refs.ticks.style.display = (this._config.show_scale === false) ? "none" : "";
      }

      // UI accent var (popup / chips inherit it through the DOM).
      card.style.setProperty("--ct-accent", this._accent);

      if (!s || s.state === "unavailable" || s.state === "unknown") {
        card.setAttribute("data-mode", "off");
        card.style.setProperty("--accent", this._modeColor("off"));
        this._refs.bigNum.textContent = "--";
        this._refs.bigNum.setAttribute("font-size", "104");
        this._refs.labelTop.textContent = s ? s.state.toUpperCase() : "MISSING";
        this._refs.labelTop.setAttribute("fill", "#6b7a88");
        this._refs.nowCap.style.display = "none";
        this._refs.caret.style.display = "none";
        this._refs.curMarker.style.display = "none";
        this._refs.clover.style.display = "none";
        this._refs.fanPct.style.display = "none";
        this._refs.fanName.style.display = "none";
        this._refs.fanIconHit.style.display = "none";
        this._refs.swingChip.style.display = "none";
        this._refs.swingCap.style.display = "none";
        this._refs.svg.style.opacity = "0.5";
        this._paintModeGlyph(s ? s.state : "off", this._modeColor("off"), true);
        return;
      }

      const attr = s.attributes || {};
      // Drop any optimistic hold the moment live state catches up (issue #9), so
      // the optimistic-vs-live checks below paint live as soon as it is real.
      this._reconcileOptimistic(attr);
      const mode = s.state;
      const off = mode === "off";
      const accent = this._modeColor(mode);
      const showCurrent = this._config.show_current !== false;
      card.setAttribute("data-mode", mode);
      card.style.setProperty("--accent", accent);
      this._refs.svg.style.opacity = off ? "0.55" : "1";

      // accent-driven SVG bits (fan gradient end + handle stroke/fill).
      if (this._refs.fanGradEnd) this._refs.fanGradEnd.setAttribute("stop-color", this._accent);
      if (this._refs.fanHandlePath) {
        this._refs.fanHandlePath.setAttribute("stroke", this._accent);
        this._refs.fanHandlePath.setAttribute("fill", this._glow(34));
      }

      // ---- TEMP (optimistic-or-real, unit-converted for display) ----
      const optActive = this._optimisticUntil && Date.now() < this._optimisticUntil
        && this._optimisticTarget != null;
      const target = optActive ? this._optimisticTarget : this._toDisplay(num(attr.temperature));
      if (target != null) this._paintTempArc(target);
      else { this._refs.bigNum.textContent = "--"; this._refs.bigNum.setAttribute("font-size", "104"); }
      this._refs.tempNeedle.style.opacity = off ? "0.45" : "1";
      this._refs.coldFill.style.opacity = off ? "0.30" : "1";
      this._refs.warmFill.style.opacity = off ? "0.30" : "1";
      this._refs.coldHalo.style.opacity = off ? "0" : "0.40";
      this._refs.warmHalo.style.opacity = off ? "0" : "0.40";

      // ---- current-temp marker (white inset triangle on the temp arc) ----
      const cur = this._toDisplay(num(attr.current_temperature));
      if (cur != null && showCurrent) {
        const curAng = this._tempToAng(cur);
        const cm = polar(CX, CY, R_TEMP + 7, curAng);
        const cmTip = polar(CX, CY, R_TEMP - 6, curAng);
        const cmL = polar(cm[0], cm[1], 5, curAng - 90), cmR = polar(cm[0], cm[1], 5, curAng + 90);
        this._refs.curMarker.setAttribute("d",
          `M ${cmL[0].toFixed(1)} ${cmL[1].toFixed(1)} L ${cmR[0].toFixed(1)} ${cmR[1].toFixed(1)} L ${cmTip[0].toFixed(1)} ${cmTip[1].toFixed(1)} Z`);
        this._refs.curMarker.style.display = off ? "none" : "";
      } else {
        this._refs.curMarker.style.display = "none";
      }

      // ---- center labels ----
      this._refs.labelTop.textContent = MODE_LABEL[mode] || mode.toUpperCase();
      this._refs.labelTop.setAttribute("fill", off ? "#5e6b78" : "rgba(234,235,238,.8)");
      if (cur != null && showCurrent) {
        this._refs.nowVal.textContent = this._fmt(cur) + "°";
        this._refs.nowVal.setAttribute("fill", off ? "#8c99a7" : accent);
        this._refs.nowCap.style.display = "";
        this._refs.nowCap.style.opacity = off ? "0.5" : "1";
      } else {
        this._refs.nowCap.style.display = "none";
      }

      // ---- caret (cooling = down, heating = up) ----
      const action = attr.hvac_action;
      if (!off && action === "cooling") {
        this._refs.caret.setAttribute("d", CARET_DOWN);
        this._refs.caret.setAttribute("fill", this._accent);
        this._refs.caret.style.filter = `drop-shadow(0 0 4px ${this._glow(55)})`;
        this._refs.caret.style.display = "";
      } else if (!off && action === "heating") {
        this._refs.caret.setAttribute("d", CARET_UP);
        this._refs.caret.setAttribute("fill", this._accent);
        this._refs.caret.style.filter = `drop-shadow(0 0 4px ${this._glow(55)})`;
        this._refs.caret.style.display = "";
      } else {
        this._refs.caret.style.display = "none";
      }

      // ---- mode glyph ----
      this._paintModeGlyph(mode, accent, off);

      // ---- FAN ring + clover (percent number OR named fan_modes) ----
      const fanNumId = this._fanNumberId();
      const namedModes = this._fanNamedModes();
      const fanAvail = !!(fanNumId || namedModes.length);
      const cfgShowFan = this._config.show_fan;
      const haveFan = cfgShowFan === true ? fanAvail
                    : cfgShowFan === false ? false
                    : fanAvail;
      if (haveFan) {
        this._refs.clover.style.display = "";
        this._refs.fanPct.style.display = "";
        this._refs.fanName.style.display = "";
        this._refs.fanIconHit.style.display = "";
        this._refs.fanHandle.style.display = "";
        this._refs.fanFill.style.display = "";
        const fanOptActive = this._optimisticFanUntil && Date.now() < this._optimisticFanUntil;
        const fanOptPct = fanOptActive && this._optimisticFanPct != null;
        const fanOptName = fanOptActive && this._optimisticFanName != null;
        if (fanNumId) {
          const fanIsAuto = String(attr.fan_mode).toLowerCase() === "auto";
          if (fanIsAuto && !fanOptPct) {
            this._paintFanAuto();
          } else {
            const liveP = num((this._st(fanNumId) || {}).state);
            const p = fanOptPct ? this._optimisticFanPct : (liveP != null ? liveP : FAN_MIN);
            this._paintFanPct(p);
          }
        } else {
          const curName = fanOptName ? this._optimisticFanName : attr.fan_mode;
          this._paintFanNamed(namedModes, curName);
        }
        // gate the clover spin: static when off / pushing no air.
        const airOff = off || action === "off" || action === "idle";
        if (airOff) this._refs.fanSpin.style.animation = "none";
        this._refs.fanSpin.style.opacity = off ? "0.3" : "0.75";
        this._refs.fanHandle.style.opacity = off ? "0.4" : "1";
        this._refs.fanPct.style.opacity = off ? "0.35" : "1";
        this._refs.fanName.style.opacity = off ? "0.3" : "0.9";
      } else {
        this._refs.clover.style.display = "none";
        this._refs.fanPct.style.display = "none";
        this._refs.fanName.style.display = "none";
        this._refs.fanIconHit.style.display = "none";
        this._refs.fanHandle.style.display = "none";
        this._refs.fanFill.style.display = "none";
      }

      // ---- face VERTICAL SWING chip ----
      if (this._featureResolved("swing")) {
        const on = this._featureOn("swing");
        this._refs.swingChip.style.display = "";
        this._refs.swingCap.style.display = "";
        this._refs.swingIcon.setAttribute("stroke", on ? this._accent : "#8a98a6");
        this._refs.swingChipBg.setAttribute("stroke", on ? this._glow(55) : "rgba(234,235,238,.16)");
        this._refs.swingChipBg.setAttribute("fill", on ? this._glow(14) : "rgba(40,52,66,.45)");
        this._refs.swingChip.style.filter = on ? `drop-shadow(0 0 6px ${this._glow(55)})` : "none";
        this._refs.swingChip.style.opacity = off ? "0.4" : "1";
      } else {
        this._refs.swingChip.style.display = "none";
        this._refs.swingCap.style.display = "none";
      }

      if (this._popOpen) this._paintPop();
    }

    // step-aware setpoint display (C -> one decimal, F -> whole).
    _fmt(v) {
      const st = this._step();
      const dec = st < 1 ? 1 : 0;
      return (Math.round(v / st) * st).toFixed(dec);
    }

    // ============================================================================
    // CSS  (.ct-card has NO backdrop-filter; .ct-frost is its own blur slab)
    // ============================================================================
    _css() {
      return `
:host{ display:block; }
.ct-card{
  position:relative; width:100%; margin:0 auto; overflow:visible;
  --ct-accent:${DEFAULT_ACCENT};
  /* pan-y (NOT none): a vertical swipe over the card still scrolls the dashboard;
     only the .ct-hit grab bands below opt out so a ring drag owns the gesture. */
  touch-action:pan-y;
  /* NEVER put backdrop-filter here or on :host: it would re-anchor the fixed .ct-pop. */
}
/* height-capped mode: width follows the arc viewBox aspect (600/392 = 1.5306), centered. */
.ct-card[data-capped]{ width:min(100%, calc(var(--ct-max-h) * 1.5306)); }
.ct-card[data-capped] .ct-svg{ max-height:var(--ct-max-h); }

/* pan-y like the card (NOT none) so a vertical swipe over empty svg space still
   scrolls. overflow:hidden: clipping the svg to its own 600x392 box is the hard
   backstop so the arcs / round caps / temp needle / fan chevron can never bleed
   past the card edge. */
.ct-svg{ display:block; width:100%; height:auto; position:relative; z-index:2; touch-action:pan-y; overflow:hidden; }
.ct-svg text{ font-family:'Rajdhani','DIN Alternate','Oswald','Roboto Condensed','Segoe UI',system-ui,sans-serif; }
.nope{ pointer-events:none; }
/* The interactive grab bands/buttons own the touch: touch-action:none keeps the
   browser from stealing a ring drag for a scroll. The tap-vs-drag threshold (JS)
   makes sure a pure tap on a band is still discarded, not committed. */
.ct-hit{ cursor:pointer; touch-action:none; }

/* Frosted-glass slab: dark translucent fill, 1px hairline outline, 14px radius. Its OWN
   backdrop-blur div BEHIND the svg, full-card inset; backdrop-filter kept for glass. */
.ct-frost{
  position:absolute; z-index:1; inset:6px; border-radius:14px;
  background:rgba(18,22,30,.62);
  backdrop-filter:blur(14px) saturate(1.1);
  -webkit-backdrop-filter:blur(14px) saturate(1.1);
  border:1px solid rgba(255,255,255,.16);
  box-shadow:
    inset 0 2px 10px rgba(255,255,255,.08),
    inset 0 -10px 28px rgba(0,0,0,.42),
    0 18px 50px rgba(0,0,0,.50);
  pointer-events:none;
}

@keyframes ctfanspin{ to{ transform:rotate(360deg); } }

/* Mode popup: position:fixed glass overlay (no transformed/filtered ancestor). */
.ct-pop{
  position:fixed; inset:0; z-index:50;
  display:flex; align-items:center; justify-content:center;
  background:rgba(3,6,10,.55);
  -webkit-backdrop-filter:blur(3px); backdrop-filter:blur(3px);
  opacity:0; visibility:hidden; pointer-events:none;
  transition:opacity .18s ease, visibility 0s linear .18s;
}
.ct-pop.open{ opacity:1; visibility:visible; pointer-events:auto; transition:opacity .18s ease; }
.ct-sheet{
  background:linear-gradient(180deg, rgba(24,31,40,.92), rgba(12,17,23,.94));
  border:1px solid rgba(234,235,238,.12); border-radius:22px; padding:22px;
  -webkit-backdrop-filter:blur(18px) saturate(120%); backdrop-filter:blur(18px) saturate(120%);
  box-shadow:0 24px 60px rgba(0,0,0,.6), inset 0 1px 1px rgba(255,255,255,.05);
  display:grid; grid-template-columns:repeat(3,1fr); gap:12px;
  transform:scale(.92); transition:transform .18s ease;
  font-family:'Rajdhani','DIN Alternate','Oswald','Segoe UI',system-ui,sans-serif;
}
.ct-pop.open .ct-sheet{ transform:scale(1); }
.ct-sheet button{
  min-width:120px; padding:18px 14px; cursor:pointer;
  background:rgba(30,40,52,.55); color:#9aa8b6;
  border:1px solid rgba(234,235,238,.14); border-radius:12px;
  font:inherit; font-size:15px; letter-spacing:2px; text-transform:uppercase; transition:.15s;
}
.ct-sheet button:hover{ border-color:color-mix(in srgb, var(--ct-accent) 45%, transparent); color:#c6d3df; }
.ct-sheet button.active{
  background:color-mix(in srgb, var(--ct-accent) 16%, transparent); color:rgba(234,235,238,.98);
  border:1.5px solid var(--ct-accent);
  box-shadow:0 0 14px color-mix(in srgb, var(--ct-accent) 40%, transparent),
    inset 0 0 12px color-mix(in srgb, var(--ct-accent) 14%, transparent);
}
@media (max-width:480px){ .ct-sheet button{ min-width:88px; padding:14px 8px; font-size:13px; } }

/* TOGGLES ROW: full-width strip under the modes, divider above it. */
.ct-toggles{
  grid-column:1 / -1;
  display:flex; flex-wrap:wrap; gap:12px; justify-content:center;
  margin-top:6px; padding-top:16px;
  border-top:1px solid rgba(234,235,238,.12);
}
/* Glass toggle chip. Higher specificity than ".ct-sheet button" so it overrides the
   mode-button min-width/padding/font. Dim grey by default; lit accent when .on. */
.ct-sheet button.ct-toggle{
  min-width:86px; padding:10px 14px;
  display:flex; flex-direction:column; align-items:center; gap:6px;
  background:rgba(30,40,52,.45); color:#8a98a6;
  border:1px solid rgba(234,235,238,.14); border-radius:12px;
  font-size:12px; letter-spacing:1.5px; line-height:1; transition:.15s;
}
.ct-sheet button.ct-toggle:hover{ border-color:color-mix(in srgb, var(--ct-accent) 45%, transparent); color:#c6d3df; }
.ct-sheet button.ct-toggle.on{
  color:var(--ct-accent);
  background:color-mix(in srgb, var(--ct-accent) 16%, transparent);
  border:1.5px solid var(--ct-accent);
  box-shadow:0 0 14px color-mix(in srgb, var(--ct-accent) 40%, transparent),
    inset 0 0 12px color-mix(in srgb, var(--ct-accent) 14%, transparent);
}
.ct-toggle .ct-tg-ic{ width:24px; height:24px; display:block; }
.ct-toggle .ct-tg-lb{ display:block; }
@media (max-width:480px){ .ct-sheet button.ct-toggle{ min-width:72px; padding:9px 8px; } }
`;
    }
  }

  // ===========================================================================
  // VISUAL EDITOR  (schema-driven ha-form GUI; Mushroom-grade ergonomics)
  // ---------------------------------------------------------------------------
  // Sectioned expandables (Appearance / Modes / Fan / Features / Layout) with the
  // right selector per field. Recomputes the schema on every `hass`/config change
  // so the Modes multi-select is populated from the picked entity's live
  // `hvac_modes`. Emits the card-standard `config-changed` on every edit.
  // ===========================================================================

  // The mode keys exposed by the per-mode color sub-section (matches MODE_COLORS).
  const MODE_KEYS = ["cool", "heat", "heat_cool", "dry", "fan_only", "auto", "off"];

  // Tri-state visibility selector for the swing / LED / sound features.
  const AUTO_TF = [
    { value: "auto", label: "Auto" },
    { value: true, label: "Show" },
    { value: false, label: "Hide" },
  ];

  // Friendly field labels (computeLabel). Falls back to MODE_LABEL then prettified name.
  const EDITOR_LABELS = {
    entity: "Climate entity",
    name: "Name",
    accent: "Accent color",
    temperature_unit: "Temperature unit",
    temp_step: "Step",
    min_temp: "Minimum temperature",
    max_temp: "Maximum temperature",
    show_scale: "Show scale",
    show_current: "Show current temperature",
    modes: "Modes",
    fan_entity: "Fan speed entity (number.*)",
    show_fan: "Show fan ring",
    fan_animation: "Fan animation",
    fan_animation_speed: "Fan animation speed",
    swing_entity: "Swing entity (switch.*)",
    show_swing: "Show swing",
    led_entity: "LED / display entity (switch.*)",
    show_led: "Show LED",
    sound_entity: "Sound / beep entity (switch.*)",
    show_sound: "Show sound",
    max_height: "Max height",
    power_switch: "Power switch",
  };

  // Per-field helper text (computeHelper).
  const EDITOR_HELPERS = {
    name: "Card title. Defaults to the entity's friendly name.",
    accent: "UI accent for the popup, lit chips, fan ring and caret. Defaults to #4fc3f7.",
    temperature_unit: "Auto follows your Home Assistant unit system.",
    temp_step: "Setpoint granularity. Defaults to the entity's target_temp_step.",
    min_temp: "Leave empty to use the entity's minimum.",
    max_temp: "Leave empty to use the entity's maximum.",
    show_scale: "The numbered tick scale around the dial.",
    show_current: "The NOW reading and current-temperature marker.",
    modes: "Which HVAC modes appear in the popup. Defaults to the entity's modes.",
    fan_entity: "A number.* percent entity for a draggable fan ring. Auto-discovered for Midea; falls back to named fan_modes.",
    show_fan: "Force the fan ring on or off. Auto shows it when a fan source resolves.",
    fan_animation: "The spinning clover animation.",
    fan_animation_speed: "Dynamic scales the spin with fan speed; constant is a fixed spin.",
    swing_entity: "Override the swing switch. Leave empty to auto-discover (Midea) or use climate swing_modes.",
    show_swing: "Auto shows it when a swing source resolves; Hide always hides it.",
    led_entity: "Override the display/LED switch. Leave empty to auto-discover (Midea).",
    show_led: "Auto shows it when the entity resolves; Hide always hides it.",
    sound_entity: "Override the beep/prompt-tone switch. Leave empty to auto-discover (Midea).",
    show_sound: "Auto shows it when the entity resolves; Hide always hides it.",
    max_height: "CSS length cap, e.g. 34vh or 360px. Width follows the dial aspect.",
    power_switch: "Optional power switch override (used by sibling discovery).",
  };

  // snake_case / dotted name -> Title Case (label fallback).
  function prettifyName(name) {
    if (!name) return "";
    return String(name).replace(/[_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  class ClimateClusterCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = Object.assign({}, config);
      this._update();
    }
    set hass(h) {
      this._hass = h;
      this._update();
    }

    // Build the ha-form schema. Re-derived on every change so the Modes multi-select
    // options track the SELECTED entity's live `hvac_modes`.
    _schema(hass, config) {
      const st = hass && config && config.entity && hass.states ? hass.states[config.entity] : null;
      const hvac = (st && st.attributes && st.attributes.hvac_modes)
        || ["off", "cool", "heat", "heat_cool", "dry", "fan_only", "auto"];
      const modeOptions = hvac.map((m) => ({ value: m, label: MODE_LABEL[m] || String(m).toUpperCase() }));

      return [
        { name: "entity", required: true, selector: { entity: { domain: "climate" } } },
        { name: "name", selector: { text: {} } },

        { type: "expandable", name: "", title: "Appearance", icon: "mdi:palette", schema: [
          { name: "accent", selector: { color_rgb: {} } },
          { type: "grid", schema: [
            { name: "temperature_unit", selector: { select: { mode: "dropdown", options: [
              { value: "auto", label: "Auto" },
              { value: "F", label: "Fahrenheit" },
              { value: "C", label: "Celsius" },
            ] } } },
            { name: "temp_step", selector: { number: { min: 0.1, max: 5, step: 0.1, mode: "box" } } },
            { name: "min_temp", selector: { number: { min: -20, max: 120, step: 0.5, mode: "box" } } },
            { name: "max_temp", selector: { number: { min: -20, max: 120, step: 0.5, mode: "box" } } },
          ] },
          { type: "grid", schema: [
            { name: "show_scale", selector: { boolean: {} } },
            { name: "show_current", selector: { boolean: {} } },
          ] },
          { type: "expandable", name: "mode_colors", title: "Per-mode colors", icon: "mdi:format-color-fill",
            schema: MODE_KEYS.map((m) => ({ name: m, selector: { color_rgb: {} } })) },
        ] },

        { type: "expandable", name: "", title: "Modes", icon: "mdi:thermostat", schema: [
          { name: "modes", selector: { select: { multiple: true, mode: "list", options: modeOptions } } },
        ] },

        { type: "expandable", name: "", title: "Fan", icon: "mdi:fan", schema: [
          { name: "fan_entity", selector: { entity: { domain: "number" } } },
          { type: "grid", schema: [
            { name: "show_fan", selector: { boolean: {} } },
            { name: "fan_animation", selector: { boolean: {} } },
          ] },
          { name: "fan_animation_speed", selector: { select: { mode: "dropdown", options: [
            { value: "dynamic", label: "Dynamic (scale with speed)" },
            { value: "constant", label: "Constant" },
            { value: "off", label: "Off" },
          ] } } },
        ] },

        { type: "expandable", name: "", title: "Features", icon: "mdi:tune", schema: [
          { name: "swing_entity", selector: { entity: { domain: "switch" } } },
          { name: "show_swing", selector: { select: { mode: "dropdown", options: AUTO_TF } } },
          { name: "led_entity", selector: { entity: { domain: "switch" } } },
          { name: "show_led", selector: { select: { mode: "dropdown", options: AUTO_TF } } },
          { name: "sound_entity", selector: { entity: { domain: "switch" } } },
          { name: "show_sound", selector: { select: { mode: "dropdown", options: AUTO_TF } } },
        ] },

        { type: "expandable", name: "", title: "Layout", icon: "mdi:arrange-bring-forward", schema: [
          { name: "max_height", selector: { text: {} } },
          { name: "power_switch", selector: { entity: { domain: "switch" } } },
        ] },
      ];
    }

    _update() {
      if (!this._hass || !this._config) return;
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.addEventListener("value-changed", (e) => this._valueChanged(e));
        this._form.computeLabel = (s) =>
          EDITOR_LABELS[s.name] || MODE_LABEL[s.name] || s.title || prettifyName(s.name);
        this._form.computeHelper = (s) => EDITOR_HELPERS[s.name] || "";
        const root = this.shadowRoot || this.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = "ha-form{display:block;padding:8px 4px;}";
        root.appendChild(style);
        root.appendChild(this._form);
      }
      this._form.hass = this._hass;
      this._form.data = this._config;
      // Re-derive each time so the Modes options live-populate from the picked entity.
      this._form.schema = this._schema(this._hass, this._config);
    }

    // ha-form fires `value-changed` with the FULL merged config. Prune empties and
    // re-emit the card-standard `config-changed` (the HA editor contract).
    _valueChanged(ev) {
      ev.stopPropagation();
      const cfg = Object.assign({}, ev.detail.value);
      for (const k of Object.keys(cfg)) {
        const v = cfg[k];
        if (v === "" || v === undefined || v === null) { delete cfg[k]; continue; }
        // drop an empty per-mode color map so it doesn't litter the YAML.
        if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) delete cfg[k];
      }
      this._config = cfg;
      this.dispatchEvent(new CustomEvent("config-changed", {
        detail: { config: cfg }, bubbles: true, composed: true,
      }));
    }
  }

  if (!customElements.get("climate-cluster-card")) {
    customElements.define("climate-cluster-card", ClimateClusterCard);
  }
  if (!customElements.get("climate-cluster-card-editor")) {
    customElements.define("climate-cluster-card-editor", ClimateClusterCardEditor);
  }
  ClimateClusterCard.getConfigElement = function () {
    return document.createElement("climate-cluster-card-editor");
  };
  ClimateClusterCard.getStubConfig = function (hass) {
    const first = hass && hass.states
      ? Object.keys(hass.states).find((id) => id.startsWith("climate.")) : null;
    return { entity: first || "climate.example" };
  };

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "climate-cluster-card",
    name: "Climate Cluster Card",
    description: "Wide-arc instrument-cluster dial for any climate entity: two-ring temperature/fan gauge, glass mode popup, optional swing/LED/sound toggles. Midea sibling auto-discovery.",
    preview: true,
    documentationURL: "https://github.com/rickyfont94/climate-cluster-card",
  });
})();
