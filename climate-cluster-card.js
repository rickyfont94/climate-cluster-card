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
  const VERSION = "1.2.2-beta.1";
  console.info(
    "%c CLIMATE-CLUSTER-CARD %c v" + VERSION + " ",
    "color:#0b0f16;background:#4fc3f7;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px",
    "color:#4fc3f7;background:#0b0f16;border-radius:0 4px 4px 0;padding:2px 6px"
  );

  // Default UI accent (HA "Frosted Glass" cyan). Overridable per-card via `accent`.
  const DEFAULT_ACCENT = "#4fc3f7";

  // Per-variant frosted-glass base: the rgb tint + alpha each glass appearance uses
  // by default. The `glass_color` / `glass_opacity` config keys override these; the
  // editor seeds the swatch/slider from here and prunes a value back out when it still
  // equals the per-variant default, so an unchanged glass keeps a byte-lean YAML.
  const GLASS_BASE = {
    "glass-dark": { rgb: [20, 24, 46], alpha: 0.66 },
    "glass-light": { rgb: [244, 247, 253], alpha: 0.60 },
  };

  // Card font stack. We do NOT ship or fetch any font, so this must not depend on a
  // missing face: 'Rajdhani' is honored only if the user already has it installed,
  // then we fall through to the Home Assistant theme font, then system UI fonts.
  // Overridable per-card via the `font` / `font_url` config keys (see _applyFont).
  const FONT_STACK = "'Rajdhani', var(--ha-card-header-font-family, var(--ha-font-family-body, var(--mdc-typography-font-family, 'Roboto'))), 'Segoe UI', system-ui, -apple-system, sans-serif";

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

  // ---- i18n (issue #19) ----------------------------------------------------
  // The card's OWN literal strings (labels, captions, aria-labels, live-region
  // announcements, editor labels/helpers/options) live here. HVAC mode names and
  // fan_mode names are NOT in this map: they are localized through Home Assistant
  // (see modeName / _fanModeName) so they always match the rest of the dashboard
  // and any custom mode/fan value keeps working.
  //
  // To add a language: add a 2-letter key (e.g. "de") mirroring "en"'s keys,
  // including the nested editorLabels / editorHelpers maps. Any missing key
  // falls back to English, so a partial translation is fine. The active language
  // is read from hass.language (then hass.locale.language); a region subtag is
  // stripped (es-419 -> es). Keep values free of em dashes (use a hyphen).
  const LOCALE = {
    en: {
      now: "NOW",
      swing: "SWING",
      led: "LED",
      sound: "SOUND",
      auto: "AUTO",
      automatic: "Automatic",
      percent: "percent",
      fan: "Fan",
      mode: "Mode",
      to: "to",
      on: "on",
      off: "off",
      celsius: "Celsius",
      fahrenheit: "Fahrenheit",
      missing: "MISSING",
      climate_control: "climate control",
      set_fan_auto: "Set fan to automatic",
      change_mode: "Change mode",
      target_temperature: "Target temperature",
      fan_speed: "Fan speed",
      select_mode: "Select mode",
      hint_mode: "MODE",
      hint_fan: "FAN",
      hint_auto: "AUTO",
      "editor.section.appearance": "Appearance",
      "editor.section.modes": "Modes",
      "editor.section.fan": "Fan",
      "editor.section.features": "Features",
      "editor.section.extra_toggles": "Extra toggles",
      "editor.section.layout": "Layout",
      "editor.section.actions": "Actions",
      "editor.section.mode_colors": "Per-mode colors",
      "editor.opt.auto": "Auto",
      "editor.opt.show": "Show",
      "editor.opt.hide": "Hide",
      "editor.opt.unit_fahrenheit": "Fahrenheit",
      "editor.opt.unit_celsius": "Celsius",
      "editor.opt.anim_dynamic": "Dynamic (scale with speed)",
      "editor.opt.anim_constant": "Constant",
      "editor.opt.anim_off": "Off",
      "editor.opt.appearance_theme": "Theme (follows Home Assistant)",
      "editor.opt.appearance_glass_dark": "Frosted glass (dark)",
      "editor.opt.appearance_glass_light": "Frosted glass (light)",
      "editor.warn_range": "Minimum temperature must be below maximum temperature. The dial uses a flat range until this is fixed.",
      editorLabels: {
        entity: "Climate entity",
        name: "Name",
        appearance: "Background",
        reset_styling: "Reset styling to defaults",
        glass_color: "Glass tint",
        glass_opacity: "Glass opacity",
        accent: "Accent color",
        font: "Font family",
        font_url: "Font stylesheet URL",
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
        extra_toggles: "Extra toggle entities",
        show_hints: "Show gesture hints",
        max_height: "Max height",
        tap_action: "Tap action",
        hold_action: "Hold action",
        double_tap_action: "Double tap action",
      },
      editorHelpers: {
        name: "Card title. Defaults to the entity's friendly name.",
        appearance: "Theme follows your active Home Assistant theme (works on light and dark). Frosted glass is a translucent panel, in a dark indigo or light finish, that holds its look on any theme.",
        reset_styling: "Clears the appearance, glass, accent, font and per-mode color settings back to their defaults. Your entity, range, modes and other options are kept.",
        glass_color: "Tints the frosted glass panel. Applies only to the frosted glass backgrounds.",
        glass_opacity: "How solid the frosted glass is (0 clear to 1 solid). Applies only to the frosted glass backgrounds.",
        accent: "UI accent for the popup, lit chips, fan ring and caret. Defaults to #4fc3f7.",
        font: "Leave empty to use Rajdhani if installed, then your Home Assistant theme font. A value here is prepended to that stack.",
        font_url: "Optional stylesheet URL (e.g. a Google Fonts link) that loads the font named above. No font is fetched by default.",
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
        show_swing: "Force the swing chip on or off. Auto shows it when a swing source resolves; a forced chip with no source renders disabled.",
        led_entity: "Override the display/LED switch. Leave empty to auto-discover (Midea).",
        show_led: "Force the LED chip on or off. Auto shows it when the entity resolves; a forced chip with no source renders disabled.",
        sound_entity: "Override the beep/prompt-tone switch. Leave empty to auto-discover (Midea).",
        show_sound: "Force the sound chip on or off. Auto shows it when the entity resolves; a forced chip with no source renders disabled.",
        extra_toggles: "Add any switch, input boolean or select entity as an extra chip in the mode popup, for functions the card does not auto-detect (anti-mildew, UV lamp, gentle wind, and so on). A two-state entity becomes an on/off chip; a select becomes a chip that cycles its own options. The chip uses the entity name and a default icon; set a custom name or icon in YAML. A missing or unavailable entity is dimmed.",
        show_hints: "Faint MODE / FAN / AUTO labels showing the dial is interactive.",
        max_height: "CSS length cap, e.g. 34vh or 360px. Width follows the dial aspect.",
        tap_action: "Leave unset to keep the default: tap opens the mode menu.",
        hold_action: "Defaults to opening the more-info dialog (history, attributes, presets).",
        double_tap_action: "Off by default.",
      },
    },
    es: {
      now: "AHORA",
      swing: "OSCILAR",
      led: "LED",
      sound: "SONIDO",
      auto: "AUTO",
      automatic: "Automatico",
      percent: "por ciento",
      fan: "Ventilador",
      mode: "Modo",
      to: "a",
      on: "encendido",
      off: "apagado",
      celsius: "Celsius",
      fahrenheit: "Fahrenheit",
      missing: "NO DISPONIBLE",
      climate_control: "control de clima",
      set_fan_auto: "Poner el ventilador en automatico",
      change_mode: "Cambiar modo",
      target_temperature: "Temperatura objetivo",
      fan_speed: "Velocidad del ventilador",
      select_mode: "Seleccionar modo",
      hint_mode: "MODO",
      hint_fan: "VENT.",
      hint_auto: "AUTO",
      "editor.section.appearance": "Apariencia",
      "editor.section.modes": "Modos",
      "editor.section.fan": "Ventilador",
      "editor.section.features": "Funciones",
      "editor.section.extra_toggles": "Controles adicionales",
      "editor.section.layout": "Diseno",
      "editor.section.actions": "Acciones",
      "editor.section.mode_colors": "Colores por modo",
      "editor.opt.auto": "Auto",
      "editor.opt.show": "Mostrar",
      "editor.opt.hide": "Ocultar",
      "editor.opt.unit_fahrenheit": "Fahrenheit",
      "editor.opt.unit_celsius": "Celsius",
      "editor.opt.anim_dynamic": "Dinamica (escala con la velocidad)",
      "editor.opt.anim_constant": "Constante",
      "editor.opt.anim_off": "Apagada",
      "editor.opt.appearance_theme": "Tema (sigue a Home Assistant)",
      "editor.opt.appearance_glass_dark": "Vidrio esmerilado (oscuro)",
      "editor.opt.appearance_glass_light": "Vidrio esmerilado (claro)",
      "editor.warn_range": "La temperatura minima debe ser menor que la maxima. El dial usa un rango plano hasta que se corrija.",
      editorLabels: {
        entity: "Entidad de clima",
        name: "Nombre",
        appearance: "Fondo",
        reset_styling: "Restablecer estilo a los valores por defecto",
        glass_color: "Tinte del vidrio",
        glass_opacity: "Opacidad del vidrio",
        accent: "Color de acento",
        font: "Tipo de letra",
        font_url: "URL de la hoja de estilos de la fuente",
        temperature_unit: "Unidad de temperatura",
        temp_step: "Incremento",
        min_temp: "Temperatura minima",
        max_temp: "Temperatura maxima",
        show_scale: "Mostrar escala",
        show_current: "Mostrar temperatura actual",
        modes: "Modos",
        fan_entity: "Entidad de velocidad del ventilador (number.*)",
        show_fan: "Mostrar anillo del ventilador",
        fan_animation: "Animacion del ventilador",
        fan_animation_speed: "Velocidad de la animacion del ventilador",
        swing_entity: "Entidad de oscilacion (switch.*)",
        show_swing: "Mostrar oscilacion",
        led_entity: "Entidad de LED / pantalla (switch.*)",
        show_led: "Mostrar LED",
        sound_entity: "Entidad de sonido / pitido (switch.*)",
        show_sound: "Mostrar sonido",
        extra_toggles: "Entidades adicionales",
        show_hints: "Mostrar pistas de gestos",
        max_height: "Altura maxima",
        tap_action: "Accion al tocar",
        hold_action: "Accion al mantener",
        double_tap_action: "Accion al tocar dos veces",
      },
      editorHelpers: {
        name: "Titulo de la tarjeta. Por defecto usa el nombre descriptivo de la entidad.",
        appearance: "Tema sigue el tema activo de Home Assistant (funciona en claro y oscuro). Vidrio esmerilado es un panel translucido, en acabado indigo oscuro o claro, que mantiene su aspecto en cualquier tema.",
        reset_styling: "Borra los ajustes de apariencia, vidrio, acento, fuente y colores por modo a sus valores por defecto. Se conservan la entidad, el rango, los modos y las demas opciones.",
        glass_color: "Tinta el panel de vidrio esmerilado. Solo aplica a los fondos de vidrio esmerilado.",
        glass_opacity: "Que tan solido es el vidrio esmerilado (0 transparente a 1 solido). Solo aplica a los fondos de vidrio esmerilado.",
        accent: "Acento de la interfaz para el menu, los chips encendidos, el anillo del ventilador y la flecha. Por defecto #4fc3f7.",
        font: "Dejar vacio para usar Rajdhani si esta instalada, y luego la fuente del tema de Home Assistant. Un valor aqui se antepone a esa lista.",
        font_url: "URL opcional de una hoja de estilos (por ejemplo un enlace de Google Fonts) que carga la fuente indicada arriba. No se descarga ninguna fuente por defecto.",
        temperature_unit: "Auto sigue el sistema de unidades de Home Assistant.",
        temp_step: "Granularidad del punto de ajuste. Por defecto usa el target_temp_step de la entidad.",
        min_temp: "Dejar vacio para usar el minimo de la entidad.",
        max_temp: "Dejar vacio para usar el maximo de la entidad.",
        show_scale: "La escala numerada de marcas alrededor del dial.",
        show_current: "La lectura AHORA y el marcador de temperatura actual.",
        modes: "Que modos HVAC aparecen en el menu. Por defecto los modos de la entidad.",
        fan_entity: "Una entidad number.* de porcentaje para un anillo de ventilador arrastrable. Se autodetecta en Midea; si no, usa los fan_modes con nombre.",
        show_fan: "Forzar el anillo del ventilador encendido o apagado. Auto lo muestra cuando se resuelve una fuente de ventilador.",
        fan_animation: "La animacion giratoria del trebol.",
        fan_animation_speed: "Dynamic escala el giro con la velocidad del ventilador; constant es un giro fijo.",
        swing_entity: "Anula el interruptor de oscilacion. Dejar vacio para autodetectar (Midea) o usar los swing_modes del clima.",
        show_swing: "Forzar el chip de oscilacion encendido o apagado. Auto lo muestra cuando se resuelve una fuente; un chip forzado sin fuente se muestra deshabilitado.",
        led_entity: "Anula el interruptor de pantalla/LED. Dejar vacio para autodetectar (Midea).",
        show_led: "Forzar el chip de LED encendido o apagado. Auto lo muestra cuando la entidad se resuelve; un chip forzado sin fuente se muestra deshabilitado.",
        sound_entity: "Anula el interruptor de pitido/tono. Dejar vacio para autodetectar (Midea).",
        show_sound: "Forzar el chip de sonido encendido o apagado. Auto lo muestra cuando la entidad se resuelve; un chip forzado sin fuente se muestra deshabilitado.",
        extra_toggles: "Anade cualquier interruptor, input boolean o select como un chip adicional en el menu de modos, para funciones que la tarjeta no detecta sola (antimoho, lampara UV, viento suave, etc.). Una entidad de dos estados se muestra como un chip de encendido/apagado; un select se muestra como un chip que rota entre sus opciones. El chip usa el nombre de la entidad y un icono por defecto; define un nombre o icono personalizado en YAML. Una entidad ausente o no disponible se atenua.",
        show_hints: "Etiquetas tenues MODO / VENT. / AUTO que muestran que el dial es interactivo.",
        max_height: "Limite de longitud CSS, por ejemplo 34vh o 360px. El ancho sigue la proporcion del dial.",
        tap_action: "Dejar sin definir para mantener el valor por defecto: tocar abre el menu de modos.",
        hold_action: "Por defecto abre el dialogo de mas informacion (historial, atributos, preajustes).",
        double_tap_action: "Apagado por defecto.",
      },
    },
  };

  // Active 2-letter language from hass (region subtag stripped), else English.
  function langOf(hass) {
    let l = (hass && (hass.language || (hass.locale && hass.locale.language))) || "en";
    l = String(l).toLowerCase();
    const dash = l.indexOf("-");
    return dash > 0 ? l.slice(0, dash) : l;
  }
  // Resolve a flat card string: active language, then English, then the raw key.
  function tr(hass, key) {
    const table = LOCALE[langOf(hass)] || LOCALE.en;
    if (table[key] != null) return table[key];
    if (LOCALE.en[key] != null) return LOCALE.en[key];
    return key;
  }
  // HVAC mode display name THROUGH Home Assistant (so it matches the dashboard and
  // any custom mode works). Falls back to the built-in dictionary, else null so the
  // editor label resolver can keep falling through for non-mode field names.
  function modeName(hass, mode) {
    if (hass && typeof hass.localize === "function") {
      const v = hass.localize("component.climate.entity_component._.state." + mode);
      if (v) return v;
    }
    return MODE_LABEL[mode] || null;
  }
  // Merge English + active-language nested editor map (English keys are the base so
  // an untranslated label still resolves).
  function editorMap(hass, which) {
    return Object.assign({}, LOCALE.en[which], (LOCALE[langOf(hass)] || {})[which]);
  }

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
  // A finger tap jitters more than a mouse click, so the center tap/hold uses a larger
  // cancel slop on touch. Below this a tap still fires (opens the mode popup); above it
  // the gesture is treated as a swipe. Too small here = the "white square but no popup"
  // bug where a touch tap is misread as a drag and discarded.
  const CENTER_TAP_SLOP = 16;

  // ---- center-disc tap / hold / double-tap action timing ------------------
  // HOLD_MS: a pointer held still on the center disc past this fires hold_action.
  // DBL_TAP_MS: the window a second center tap must land in to count as a double
  // tap. The deferred single-tap is ONLY armed when double_tap_action is set, so
  // the default (no double action) keeps tap firing immediately (no latency).
  const HOLD_MS = 500;
  const DBL_TAP_MS = 250;

  // ---- FAN (numeric control) ----------------------------------------------
  // The fan ring drives a number.*_fan_speed entity. Its real range is read from
  // the number entity's own min/max/step attributes (HA `number` entities expose
  // them); these consts are only the fallback when those attributes are missing.
  // AUTO is the named climate fan_mode, not a ring position. When there is no
  // usable numeric source the ring degrades to the climate entity's fan_modes.
  const FAN_MIN = 1;
  const FAN_MAX = 100;
  const FAN_STEP = 5;

  // Card CSS-px width below which the per-degree tick scale and the tiny captions
  // (fan name, SWING caption) are dropped so the dial stays legible when the
  // Sections grid hands the card a narrow cell. Measure-tuned: rendered tick px is
  // ~14.5 * W/600, so W < 380 puts ticks under ~9px and the small captions blur.
  const COMPACT_W = 380;

  // Optimistic-paint safety timeout (ms). We hold the optimistic value until the
  // entity reports the value we asked for (then clear immediately, see
  // _reconcileOptimistic), so a slow device no longer flickers back then jumps.
  // This is only the fallback for a device that never confirms; a rejected
  // service call reverts sooner via its .catch() (issue #9).
  const OPT_HOLD_MS = 5000;

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

  // Vanilla HA-style event dispatcher (no custom-card-helpers dependency). composed
  // is true so the event crosses this card's shadow boundaries up to home-assistant
  // (mandatory for hass-more-info to actually open the dialog).
  function fireEvent(node, type, detail, opts) {
    const ev = new Event(type, {
      bubbles: opts && opts.bubbles !== undefined ? opts.bubbles : true,
      cancelable: !!(opts && opts.cancelable),
      composed: opts && opts.composed !== undefined ? opts.composed : true,
    });
    ev.detail = detail == null ? {} : detail;
    node.dispatchEvent(ev);
    return ev;
  }

  // Accept either [r,g,b] (editor color_rgb selector) or a plain color string.
  function toColor(v) {
    if (v == null) return null;
    if (Array.isArray(v)) return v.length ? "rgb(" + v.join(",") + ")" : null;
    const s = String(v).trim();
    return s ? s : null;
  }

  // Color -> [r,g,b] for the ha-form color_rgb selector (it ONLY renders an array;
  // a string or undefined shows a BLACK swatch). Handles a stored array, an
  // rgb()/rgba() string, and #rgb / #rrggbb hex. Returns null if unparseable.
  function colorToRgb(v) {
    if (v == null) return null;
    if (Array.isArray(v)) return v.length >= 3 ? [+v[0], +v[1], +v[2]] : null;
    const s = String(v).trim();
    let m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
    m = s.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    return null;
  }
  // True when two [r,g,b] arrays match (used to drop seeded defaults on save).
  function rgbEq(a, b) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((x, i) => +x === +b[i]);
  }
  // True when two arrays hold the same SET of values (order-independent; used to
  // drop a `modes` selection that still equals the entity's full hvac_modes).
  function arrSetEq(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const sb = new Set(b.map(String));
    return a.every((x) => sb.has(String(x)));
  }

  // Defensive cap so a config cannot flood the popup row (issue #34).
  const MAX_EXTRA_TOGGLES = 8;

  // Normalize config.extra_toggles into a clean [{entity, name, icon}] list. Accepts a
  // bare "switch.x" string OR a {entity, name?, icon?} object, or an array of either.
  // Drops entries with no usable entity id (needs a "domain.object" shape); order kept;
  // name/icon are null when unset. Missing / non-array -> []. Never throws. Shared by the
  // card render path and the editor display seed. Capped at MAX_EXTRA_TOGGLES.
  function normalizeExtra(v) {
    if (!Array.isArray(v)) return [];
    const out = [];
    for (const row of v) {
      if (out.length >= MAX_EXTRA_TOGGLES) break;
      let entity = "", name = null, icon = null;
      if (typeof row === "string") { entity = row.trim(); }
      else if (row && typeof row === "object" && typeof row.entity === "string") {
        entity = row.entity.trim();
        if (typeof row.name === "string" && row.name.trim()) name = row.name.trim();
        if (typeof row.icon === "string" && row.icon.trim()) icon = row.icon.trim();
      } else { continue; }
      if (!entity || entity.indexOf(".") < 1) continue; // require a real entity_id
      out.push({ entity, name, icon });
    }
    return out;
  }

  // Display-side defaults for the editor color swatches / default-on toggles.
  const DEFAULT_ACCENT_RGB = colorToRgb(DEFAULT_ACCENT);   // [79,195,247]
  const MODE_COLORS_RGB = {};                              // per-mode defaults as [r,g,b]
  for (const k in MODE_COLORS) MODE_COLORS_RGB[k] = colorToRgb(MODE_COLORS[k]);
  // Booleans the CARD treats as on unless explicitly false (seed ON in the editor).
  const DEFAULT_ON_KEYS = ["show_scale", "show_current", "fan_animation", "show_hints"];

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
      this._extraToggles = [];
      this._accent = DEFAULT_ACCENT;
      this._modeColors = Object.assign({}, MODE_COLORS);
      this._popOpen = false;
      this._popBuilt = false;
      this._refs = {};
      // center-disc tap / hold / double-tap gesture state (issue #15).
      this._centerStart = null;
      this._centerMoved = false;
      this._centerHeld = false;
      this._centerHoldTimer = null;
      this._centerTapTimer = null;
      this._onCenterMove = null;
      this._onCenterUp = null;
      this._lastCenterUp = 0;
    }

    // ---- PUBLIC CONTRACT --------------------------------------------------
    setConfig(config) {
      if (!config || !config.entity) {
        throw new Error("climate-cluster-card: 'entity' is required (e.g. climate.living_room)");
      }
      this._config = Object.assign({}, config);

      // User-defined feature chips (issue #34). Structural parse only; capability
      // (toggle vs cycle) and availability are resolved live at paint. Absent -> [].
      this._extraToggles = normalizeExtra(this._config.extra_toggles);
      // Extra chips are dynamic (count varies with config), unlike the build-once
      // swing/led/sound chips, so force _buildPop to rebuild the sheet next open. The
      // sheet click listener is guarded by `if (!this._onPopClick)` so it is not re-bound.
      if (this._built) this._popBuilt = false;

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

      // Optional font override. `font` prepends a family to the default stack (so a
      // failed/blocked web font still degrades to the theme/system fonts); `font_url`
      // loads a stylesheet (e.g. a Google Fonts URL) that declares its own @font-face.
      this._font = (typeof this._config.font === "string" && this._config.font.trim()) ? this._config.font.trim() : null;
      this._fontUrl = (typeof this._config.font_url === "string" && this._config.font_url.trim()) ? this._config.font_url.trim() : null;

      // Appearance: "theme" (default) follows the active Home Assistant theme so the
      // dial reads on light AND dark themes; "glass-dark" / "glass-light" force a
      // translucent frosted-glass panel (deep indigo or pale) on ANY theme. Legacy
      // "glass" maps to the dark variant; anything unknown falls back to "theme".
      const _ap = this._config.appearance;
      this._appearance = (_ap === "glass" || _ap === "glass-dark") ? "glass-dark"
        : _ap === "glass-light" ? "glass-light" : "theme";

      // Glass tint + translucency overrides (glass appearances only; the per-variant
      // CSS vars are the fallback when these are unset). glass_color is parsed to an
      // "r,g,b" triple for rgba(var(--ct-glass-rgb), ...); glass_opacity must be a
      // number in 0..1 (anything else, including "" or out-of-range, falls back to the
      // per-variant default). Both stay null when unset (theme mode ignores them).
      const _gc = colorToRgb(this._config.glass_color);
      this._glassColorRgb = _gc ? _gc.join(",") : null;
      const _go = this._config.glass_opacity;
      this._glassOpacity = (typeof _go === "number" && isFinite(_go) && _go >= 0 && _go <= 1) ? _go : null;

      if (this._built) this._applyMaxHeight();
      if (this._built) this._applyFont();
      if (this._built) this._applyAppearance();
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

    // Toggle the frosted-glass appearance via [data-appearance="glass"] on the
    // <ha-card>. Placed on ha-card (not .ct-card) so glass mode can also hide the
    // themed card chrome (a light theme would otherwise show a white ring around the
    // indigo slab). "theme" removes the attribute and the dial follows the theme.
    _applyAppearance() {
      if (!this.shadowRoot) return;
      const haCard = this.shadowRoot.querySelector("ha-card");
      if (!haCard) return;
      if (this._appearance === "glass-dark" || this._appearance === "glass-light")
        haCard.setAttribute("data-appearance", this._appearance);
      else haCard.removeAttribute("data-appearance");

      // Drive the glass tint/translucency custom props on the inner .ct-card. Unset
      // values are removed so the per-variant CSS fallback applies unchanged.
      const card = haCard.querySelector(".ct-card");
      if (card) {
        if (this._glassColorRgb) card.style.setProperty("--ct-glass-rgb", this._glassColorRgb); else card.style.removeProperty("--ct-glass-rgb");
        if (this._glassOpacity != null) card.style.setProperty("--ct-glass-alpha", String(this._glassOpacity)); else card.style.removeProperty("--ct-glass-alpha");
      }
    }

    // Apply the optional `font` / `font_url` overrides. With neither set the CSS default
    // --ct-font (FONT_STACK) is used. `font` is prepended so a missing/blocked override
    // still degrades to the theme/system fonts. `font_url` injects one <link> stylesheet.
    _applyFont() {
      if (!this.shadowRoot) return;
      const card = this.shadowRoot.querySelector(".ct-card");
      if (card) {
        if (this._font) {
          card.style.setProperty("--ct-font", "'" + this._font + "', " + FONT_STACK);
        } else {
          card.style.removeProperty("--ct-font");
        }
      }
      // Manage a single stylesheet <link> in the shadow root (create once, update in place).
      let link = this.shadowRoot.querySelector("link[data-ct-font]");
      if (this._fontUrl) {
        if (!link) {
          link = document.createElement("link");
          link.setAttribute("data-ct-font", "");
          link.setAttribute("rel", "stylesheet");
          this.shadowRoot.appendChild(link);
        }
        if (link.getAttribute("href") !== this._fontUrl) link.setAttribute("href", this._fontUrl);
      } else if (link) {
        link.remove();
      }
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._built) this._build();
      this._render();
    }

    getCardSize() {
      // Wide arc (600x392, ratio 1.53). At a full-width column the natural height
      // is ~300px, so ~6 masonry units (50px each). Kept in step with getGridOptions
      // rows below so masonry and the Sections grid reserve the same vertical space.
      return 6;
    }

    // Sections (grid) layout sizing. Without this HA gives a custom card columns:full
    // and lets the aspect-locked SVG drive an unbounded height, so the dial renders
    // huge. columns:12 keeps the default render width above COMPACT_W (full dial shows
    // by default); rows:6 reserves enough height that the 1.5306-aspect SVG letterboxes
    // instead of spilling past the cell. min 6x4 lets it shrink into compact mode (ticks
    // and tiny captions hidden) without ever clipping the arcs.
    getGridOptions() {
      return { columns: 12, rows: 6, min_columns: 6, min_rows: 4 };
    }

    disconnectedCallback() {
      if (this._ro) this._ro.disconnect(); // stop the compact-mode observer (re-observed on reconnect)
      this._popOpen = false;
      this._dragging = false;
      this._ringArmed = false;
      this._ringStart = null;
      this._touchOnRing = false;
      // Capturing touch guards live on the svg; tear them down here.
      if (this._svg) {
        if (this._onSvgTouchStart) this._svg.removeEventListener("touchstart", this._onSvgTouchStart, true);
        if (this._onSvgTouchMove) this._svg.removeEventListener("touchmove", this._onSvgTouchMove, true);
        if (this._onSvgTouchEnd) {
          this._svg.removeEventListener("touchend", this._onSvgTouchEnd, true);
          this._svg.removeEventListener("touchcancel", this._onSvgTouchEnd, true);
        }
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
      if (this._onPopKeydown && this._refs && this._refs.pop) {
        this._refs.pop.removeEventListener("keydown", this._onPopKeydown);
        this._onPopKeydown = null;
      }
      // The document-level Escape listener lives on document while the popup is
      // open; detach it here in case the card is removed while still open. Keep
      // the function reference (the shadow DOM persists across reconnect and is
      // not rebuilt) so the next _openPop can re-attach it.
      if (this._onDocKeydown) document.removeEventListener("keydown", this._onDocKeydown, true);
      // center-disc gesture teardown (issue #15): clear timers + window listeners so
      // a card moved/removed in Lovelace leaks nothing (mirrors the ring/fan-icon path).
      if (this._centerHoldTimer) { clearTimeout(this._centerHoldTimer); this._centerHoldTimer = null; }
      if (this._centerTapTimer) { clearTimeout(this._centerTapTimer); this._centerTapTimer = null; }
      if (this._onCenterMove) window.removeEventListener("pointermove", this._onCenterMove);
      if (this._onCenterUp) {
        window.removeEventListener("pointerup", this._onCenterUp);
        window.removeEventListener("pointercancel", this._onCenterUp);
      }
      this._centerStart = null;
      this._centerMoved = false;
      this._centerHeld = false;
      // center TOUCH-tap teardown (svg touch guards): clear the touch hold timer + flags.
      if (this._touchCenterHoldTimer) { clearTimeout(this._touchCenterHoldTimer); this._touchCenterHoldTimer = null; }
      this._touchOnCenter = false;
      this._centerTouchStart = null;
      this._touchCenterHeld = false;
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

    // The numeric fan source's STATE object, or null when there is no USABLE
    // numeric source (no entity, or unavailable/unknown/non-numeric). null means
    // the ring should drive the climate entity's fan_modes instead.
    _fanNumState() {
      const id = this._fanNumberId();
      if (!id) return null;
      const s = this._st(id);
      if (!s) return null;
      const st = String(s.state).toLowerCase();
      if (st === "unavailable" || st === "unknown") return null;
      if (num(s.state) == null) return null;   // non-numeric -> not usable
      return s;
    }
    // True when the ring runs in numeric (value) mode, false for named fan_modes.
    _fanUsesNumber() { return this._fanNumState() != null; }
    // {min,max,step} read from the number entity's own attributes; sane fallbacks.
    _fanNumRange() {
      const s = this._fanNumState();
      if (!s) return null;
      const a = s.attributes || {};
      let min = num(a.min); if (min == null) min = FAN_MIN;
      let max = num(a.max); if (max == null) max = FAN_MAX;
      if (max <= min) max = min + 1;             // guard a degenerate range
      let step = num(a.step); if (step == null || step <= 0) step = 1;
      return { min, max, step };
    }
    // 0..1 fraction along the arc -> value snapped to the entity's {min,max,step}.
    _snapFanValue(frac) {
      const r = this._fanNumRange();
      if (!r) return null;
      const raw = r.min + clamp(frac, 0, 1) * (r.max - r.min);
      const snapped = Math.round((raw - r.min) / r.step) * r.step + r.min;
      return clamp(snapped, r.min, r.max);
    }
    // Nearest fan_mode (from the entity's OWN non-auto list) for a numeric value,
    // case-preserving. Replaces the old hardcoded silent/low/.../full bucketer so
    // the auto-pull picks a mode the entity actually supports (issue #8).
    _nearestFanMode(value) {
      const names = this._fanNamedModes();
      if (!names.length) return null;
      const r = this._fanNumRange() || { min: FAN_MIN, max: FAN_MAX };
      const frac = clamp((value - r.min) / ((r.max - r.min) || 1), 0, 1);
      const i = clamp(Math.round(frac * (names.length - 1)), 0, names.length - 1);
      return names[i];
    }
    // Value label: integer unless the step has a fractional part.
    _fmtFan(v, step) {
      const dec = (step != null && step % 1 !== 0) ? 1 : 0;
      return dec ? v.toFixed(dec) : String(Math.round(v));
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
      // Reject non-positive steps from hand-written YAML / attrs so the snap math
      // in _eventToTemp/_tempKeyDown can never divide by zero (issue #18).
      const cs = num(cfg.temp_step);
      if (cfg.temp_step != null && cs != null && cs > 0) return cs;
      const as = num(attr.target_temp_step);
      if (as != null && as > 0) return this._toDisplayStep(as);
      return d.step;
    }

    // ---- dual-setpoint (heat_cool) detection + readers (issue #14) ---------
    // A heat/cool entity reports target_temp_low/target_temp_high and leaves the
    // single `temperature` attribute null. Treat the dial as dual-setpoint when
    // both range attrs are present AND (the state is heat_cool, or the single
    // target is empty). A normal single-target entity never satisfies this (no
    // range attrs), so its behavior is untouched.
    _isHeatCool() {
      const s = this._st(this._config && this._config.entity);
      if (!s) return false;
      const attr = s.attributes || {};
      const hasRange = num(attr.target_temp_low) != null && num(attr.target_temp_high) != null;
      if (!hasRange) return false;
      if (String(s.state).toLowerCase() === "heat_cool") return true;
      return num(attr.temperature) == null;
    }
    // Low / high setpoints in DISPLAY units (or null when unavailable).
    _hcLow() {
      const s = this._st(this._config && this._config.entity);
      return s ? this._toDisplay(num((s.attributes || {}).target_temp_low)) : null;
    }
    _hcHigh() {
      const s = this._st(this._config && this._config.entity);
      return s ? this._toDisplay(num((s.attributes || {}).target_temp_high)) : null;
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

      // Wrap the dial in a real <ha-card> so it inherits the active theme's
      // background / border / radius / shadow and becomes the default card-mod
      // target. The inner .ct-card keeps all the layout + interaction wiring, so
      // no code that queries .ct-card needs to change. Outside HA, ha-card is an
      // inert inline element and the dark literal fallbacks below keep the look.
      const haCard = document.createElement("ha-card");
      const card = document.createElement("div");
      card.className = "ct-card";
      // Glass appearance lives on the ha-card so its themed chrome is hidden too.
      if (this._appearance === "glass-dark" || this._appearance === "glass-light")
        haCard.setAttribute("data-appearance", this._appearance);
      haCard.appendChild(card);
      root.appendChild(haCard);

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
      // a11y (issue #5): group the focusable controls so screen readers don't read
      // the whole dial as one unlabeled graphic. aria-label is refreshed in _render.
      svg.setAttribute("role", "group");

      // SCROLL + TAP MODEL (issues #4 + the touch regression + the iPhone scroll/tap fix).
      // The root .ct-svg is touch-action:pan-y, so a vertical swipe ANYWHERE on the dial
      // scrolls the dashboard by DEFAULT. These CAPTURING touch guards carve out only the
      // two exceptions, keyed off e.target so the touch hit-region matches the pointer one:
      //   1. RING DRAG -- the instant a touch lands on a ring grab band we set
      //      _touchOnRing, and from the first touchmove we preventDefault so the page can
      //      never scroll while the ring owns the gesture. It is set on TOUCHSTART (not on
      //      pointerdown) because iOS WebKit can fire the first touchmove BEFORE the
      //      synthesized pointerdown, and a late preventDefault is ignored once a scroll
      //      has begun. It is independent of _ringArmed (which still gates the pointer
      //      commit) and is cleared on touchend/cancel below.
      //   2. CENTER TAP -- a tap on the center disc opens the mode popup. We fire it from
      //      touchend (movement within CENTER_TAP_SLOP of touchstart) instead of a
      //      synthesized click/pointerup, which iOS can drop to a pointercancel under
      //      pan-y (the old "focus square but no popup" bug). A center swipe past the slop
      //      is not a tap, so we leave it alone and pan-y scrolls it.
      // Everywhere else (empty dial, clover, swing) we never preventDefault, so pan-y
      // scrolls; the guards also stopPropagation so an ancestor JS swipe navigator never
      // sees the touch. Mouse/pen still run the full _centerPointerDown pointer path.
      this._onSvgTouchStart = (e) => {
        e.stopPropagation();
        this._touchOnRing = false;
        this._touchOnCenter = false;
        this._centerTouchStart = null;
        this._touchCenterHeld = false;
        if (this._touchCenterHoldTimer) { clearTimeout(this._touchCenterHoldTimer); this._touchCenterHoldTimer = null; }
        const t = e.touches && e.touches[0];
        if (!t || this._popOpen) return;
        const tgt = e.target;
        // CENTER disc tap: record the start so touchend can open the mode popup directly.
        // Independent of on/off state (the mode can be changed while the entity is off).
        if (tgt === this._refs.centerHit) {
          this._touchOnCenter = true;
          this._centerTouchStart = { x: t.clientX, y: t.clientY };
          this._setPress(true);
          const hold = this._config.hold_action || { action: "more-info" };
          if (hold.action && hold.action !== "none") {
            this._touchCenterHoldTimer = setTimeout(() => {
              this._touchCenterHoldTimer = null;
              if (!this._touchOnCenter) return; // moved/cancelled before the hold landed
              this._touchCenterHeld = true;
              this._setPress(false);
              this._runHoldAction();
            }, HOLD_MS);
          }
          return;
        }
        // RING grab band: arm the scroll-block so a real drag owns the gesture. Only when
        // the entity is controllable (a drag no-ops on off/unavailable/unknown anyway).
        if (tgt === this._refs.drag || tgt === this._refs.fanGrab) {
          const s = this._st(this._config.entity);
          if (!s || s.state === "off" || s.state === "unavailable" || s.state === "unknown") return;
          this._touchOnRing = true;
        }
      };
      this._onSvgTouchMove = (e) => {
        e.stopPropagation();
        if (this._touchOnCenter && this._centerTouchStart) {
          const t = e.touches && e.touches[0];
          if (t && Math.hypot(t.clientX - this._centerTouchStart.x, t.clientY - this._centerTouchStart.y) > CENTER_TAP_SLOP) {
            // past the tap slop -> it's a swipe: drop the tap/hold and let pan-y scroll.
            this._touchOnCenter = false;
            this._centerTouchStart = null;
            this._setPress(false);
            if (this._touchCenterHoldTimer) { clearTimeout(this._touchCenterHoldTimer); this._touchCenterHoldTimer = null; }
          }
        }
        if ((this._ringArmed || this._touchOnRing) && e.cancelable) e.preventDefault();
      };
      this._onSvgTouchEnd = (e) => {
        // A clean center tap (touchend, moved within the slop, no hold, popup closed)
        // opens the mode popup straight from the touch stream. preventDefault swallows
        // the follow-up synthesized click so the tap can't double-fire; setting
        // _lastCenterUp backstops the click-listener's own 700ms de-dup guard too.
        if (e.type === "touchend" && this._touchOnCenter && this._centerTouchStart
            && !this._touchCenterHeld && !this._popOpen) {
          const c = e.changedTouches && e.changedTouches[0];
          const moved = c && Math.hypot(c.clientX - this._centerTouchStart.x, c.clientY - this._centerTouchStart.y) > CENTER_TAP_SLOP;
          if (!moved) {
            if (e.cancelable) e.preventDefault();
            this._lastCenterUp = Date.now();
            this._runTapAction();
          }
        }
        if (this._touchCenterHoldTimer) { clearTimeout(this._touchCenterHoldTimer); this._touchCenterHoldTimer = null; }
        this._setPress(false);
        this._touchOnRing = false;
        this._touchOnCenter = false;
        this._centerTouchStart = null;
        this._touchCenterHeld = false;
      };
      svg.addEventListener("touchstart", this._onSvgTouchStart, { capture: true, passive: false });
      svg.addEventListener("touchmove", this._onSvgTouchMove, { capture: true, passive: false });
      svg.addEventListener("touchend", this._onSvgTouchEnd, { capture: true, passive: false });
      svg.addEventListener("touchcancel", this._onSvgTouchEnd, { capture: true, passive: false });

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
      // Thin dark outline so the white marker stays visible over the light end of
      // the cold/cyan arc (it vanished against the pale arc without it).
      this._refs.curMarker = el("path", { class: "nope", fill: "#dfe8ef", opacity: ".9", stroke: "rgba(15,22,33,.55)", "stroke-width": "1", "stroke-linejoin": "round", d: "" });
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
      // refs to the needle's two inner <path>s so _render can tint them to the
      // active mode color (issue #21); each carries an explicit fill attr, so a
      // fill on the parent <g> alone would never reach them.
      const tnPaths = tempNeedle.querySelectorAll("path");
      this._refs.tempNeedleBody = tnPaths[0]; // body: fill + stroke
      this._refs.tempNeedleHi = tnPaths[1];   // inner highlight: translucent fill
      svg.appendChild(tempNeedle);

      // ---- LOW-setpoint needle (cold/cyan), heat_cool dual mode ONLY (issue #14).
      // The warm needle above doubles as the HIGH handle; this cyan twin is the LOW
      // handle. Hidden by default so single-target dials look exactly as before.
      const tempNeedleLo = el("g", { class: "ct-needle-lo nope" });
      tempNeedleLo.innerHTML =
        '<path d="M 0 15 Q 5.6 10 7.2 2.5 Q 8.2 -4.5 4.2 -9.5 Q 2.2 -11.5 0 -10 Q -2.2 -11.5 -4.2 -9.5 ' +
        'Q -8.2 -4.5 -7.2 2.5 Q -5.6 10 0 15 Z" fill="#5CD6FF" stroke="#CFF4FF" stroke-width="1" ' +
        'stroke-opacity=".55" stroke-linejoin="round" filter="url(#aNeedleGlow)"/>' +
        '<path d="M 0 12 Q 3.2 6 3.6 0 Q 1.8 -3 0 -2.5 Q -1.8 -3 -3.6 0 Q -3.2 6 0 12 Z" ' +
        'fill="rgba(207,244,255,.45)" stroke="none"/>';
      tempNeedleLo.style.display = "none";
      this._refs.tempNeedleLo = tempNeedleLo;
      svg.appendChild(tempNeedleLo);

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

      // ---- center press-feedback disc (issue #15): faint accent fill behind the
      // readout, flashed on a center pointerdown so a touch registers visually.
      // Inert (.nope) so it never intercepts the tap. fill comes from CSS. ----
      this._refs.pressDisc = el("circle", {
        class: "ct-pressdisc nope", cx: 300, cy: 255, r: 86, opacity: "0",
      });
      svg.appendChild(this._refs.pressDisc);

      // ---- CENTER TEXT BLOCK: glyph(apex) > MODE > NOW xx (two-tone) > big number ----
      this._refs.labelTop = el("text", {
        x: CX, y: 178, "text-anchor": "middle", class: "ct-labeltop nope",
        fill: "rgba(234,235,238,.8)", "font-size": "16", "letter-spacing": "4", opacity: ".95",
      }, "COOL");
      this._refs.labelTop.style.fontWeight = "600";
      // Theme-driven neutral fill (inline style beats the leftover presentation
      // attr); kept JS-set so the off / unavailable dim states still apply below.
      this._refs.labelTop.style.fill = "var(--primary-text-color, rgba(234,235,238,.8))";
      svg.appendChild(this._refs.labelTop);

      // NOW xx, two-tone: grey "NOW " + bright value.
      this._refs.nowCap = el("text", {
        x: CX, y: 196, "text-anchor": "middle", class: "ct-now nope",
        "font-size": "15", "letter-spacing": "2.5",
      });
      this._refs.nowCap.style.fontWeight = "400";
      const nowPrefix = el("tspan", { fill: "#8c99a7" }, "NOW ");
      nowPrefix.style.fill = "var(--secondary-text-color, #8c99a7)";
      this._refs.nowLabel = nowPrefix; // localized in _applyStaticStrings (issue #19)
      this._refs.nowCap.appendChild(nowPrefix);
      this._refs.nowVal = el("tspan", { fill: "rgba(234,235,238,.92)" }, "--°");
      this._refs.nowCap.appendChild(this._refs.nowVal);
      svg.appendChild(this._refs.nowCap);

      // big setpoint number (no degree).
      this._refs.bigNum = el("text", {
        x: CX, y: 266, "text-anchor": "middle", "dominant-baseline": "central", class: "ct-big nope",
        fill: "rgba(234,235,238,.98)", "font-size": "104", "letter-spacing": "2",
      }, "--");
      this._refs.bigNum.style.fontWeight = "400";
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
      // a11y (issue #5): focusable button; aria-pressed tracks the AUTO state.
      this._refs.fanIconHit = el("circle", {
        class: "ct-hit", cx: 212, cy: 322, r: 24, fill: "transparent",
        role: "button", tabindex: "0", "aria-label": "Set fan to automatic", "aria-pressed": "false",
      });
      svg.appendChild(this._refs.fanIconHit);
      this._onFanIconDown = (e) => this._fanIconPointerDown(e);
      this._refs.fanIconHit.addEventListener("pointerdown", this._onFanIconDown);
      this._refs.fanIconHit.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
        e.preventDefault(); e.stopPropagation();
        const s = this._st(this._config.entity);
        if (!s || s.state === "off" || s.state === "unavailable" || s.state === "unknown") return;
        if (this._popOpen) return;
        this._fanCloverTap();
      });

      // ---- VERTICAL SWING chip (lower-RIGHT) ----
      // a11y (issue #5): focusable toggle button; aria-pressed tracks the swing state.
      const swingChip = el("g", {
        class: "ct-swing ct-hit", transform: "translate(388,322)",
        role: "button", tabindex: "0", "aria-label": "Swing", "aria-pressed": "false",
      });
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
      swingChip.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
        e.preventDefault(); e.stopPropagation();
        if (!this._swingMode().kind || !this._hass) return;
        this._featureToggle("swing");
        this._render(); // optimistic face repaint
      });

      // ---- gesture HINT labels (issue #15): faint MODE / FAN / AUTO micro-labels so
      // a wall-tablet user sees the dial is interactive. Inert (.nope) so they never
      // steal a tap; visibility is driven in _render (show_hints + fan availability). ----
      const hints = el("g", { class: "ct-hints nope" });
      this._refs.hints = hints;
      const hintAttrs = {
        "text-anchor": "middle", "font-size": "10", "letter-spacing": "1.5",
        "font-weight": "600", fill: "rgba(234,235,238,.4)",
      };
      this._refs.hintMode = el("text", Object.assign({ x: 300, y: 371 }, hintAttrs), "MODE");
      this._refs.hintFan = el("text", Object.assign({ x: 120, y: 360 }, hintAttrs), "FAN");
      this._refs.hintAuto = el("text", Object.assign({ x: 212, y: 300 }, hintAttrs), "AUTO");
      hints.appendChild(this._refs.hintMode);
      hints.appendChild(this._refs.hintFan);
      hints.appendChild(this._refs.hintAuto);
      svg.appendChild(hints);

      // ---- center disc: tap / hold / double-tap actions (issues #5 + #15) ----
      // a11y (issue #5): a focusable button. The pointer scheme (issue #15) routes a
      // tap to tap_action (default = open the mode popup), a press to hold_action
      // (default = more-info), and a double tap to double_tap_action (default none),
      // while respecting DRAG_THRESH_PX so a swipe off the disc is never an action.
      this._refs.centerHit = el("circle", {
        class: "ct-hit ct-center-hit", cx: 300, cy: 255, r: 86, fill: "transparent",
        role: "button", tabindex: "0", "aria-label": "Change mode", "aria-haspopup": "dialog",
      });
      svg.appendChild(this._refs.centerHit);
      this._onCenterDown = (e) => this._centerPointerDown(e);
      this._refs.centerHit.addEventListener("pointerdown", this._onCenterDown);
      // Swallow the synthetic click that follows a pointer tap (the _lastCenterUp
      // guard) so the action never double-fires; a pure assistive-tech click (no
      // preceding pointer flow) still runs the tap action.
      this._refs.centerHit.addEventListener("click", (e) => {
        e.stopPropagation();
        if (Date.now() - this._lastCenterUp < 700) return;
        if (!this._popOpen) this._runTapAction();
      });
      this._refs.centerHit.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault(); e.stopPropagation();
          if (!this._popOpen) this._runTapAction();
        }
      });

      // ---- drag-to-set: TWO transparent stroke "grab" bands (temp inner / fan outer) ----
      // a11y (issue #5): the grab bands double as focusable role="slider"s so the
      // value can be set from the keyboard (arrows/Page/Home/End). aria-value* are
      // refreshed by the paint helpers; the slider commits via the same _commit* paths.
      this._refs.drag = el("path", {
        class: "ct-hit", fill: "none", stroke: "transparent", "stroke-width": "63", "stroke-linecap": "butt",
        d: arcPath(CX, CY, 181.5, START_ANG, END_ANG), // WIDE band r ~150..213 (temp ring)
        role: "slider", tabindex: "0", "aria-label": "Target temperature",
      });
      this._refs.fanGrab = el("path", {
        class: "ct-hit", fill: "none", stroke: "transparent", "stroke-width": "62", "stroke-linecap": "butt",
        d: arcPath(CX, CY, 244, START_ANG, END_ANG), // WIDE band r ~213..275 (fan ring)
        role: "slider", tabindex: "0", "aria-label": "Fan speed",
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
      // keyboard slider operability (issue #5)
      this._refs.drag.addEventListener("keydown", (e) => this._ringKeyDown(e, "temp"));
      this._refs.fanGrab.addEventListener("keydown", (e) => this._ringKeyDown(e, "fan"));

      // ---- MODE POPUP (position:fixed glass overlay; built lazily on first open) ----
      // a11y (issue #5): a real modal dialog. Escape closes it, Tab is trapped inside,
      // focus moves in on open (_openPop) and returns to the center on close (_closePop).
      const pop = document.createElement("div");
      pop.className = "ct-pop";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-modal", "true");
      pop.setAttribute("aria-label", "Select mode");
      pop.addEventListener("click", (e) => { if (e.target === pop) this._closePop(); });
      this._onPopKeydown = (e) => this._popKeyDown(e);
      pop.addEventListener("keydown", this._onPopKeydown);
      // Escape must close the popup no matter where focus landed. The pop-level
      // handler only fires when focus is INSIDE the dialog, but the popup opens
      // from the SVG center disc (a sibling of .ct-pop), so an Escape keydown can
      // bubble up the svg and never reach .ct-pop. A document-level capture
      // listener (added on open, removed on close) catches Escape regardless.
      this._onDocKeydown = (e) => {
        if (this._popOpen && e.key === "Escape") {
          e.preventDefault(); e.stopPropagation(); this._closePop();
        }
      };
      const sheet = document.createElement("div");
      sheet.className = "ct-sheet";
      pop.appendChild(sheet);
      this._refs.pop = pop;
      this._refs.sheet = sheet;
      card.appendChild(pop);

      // ---- visually-hidden polite live region: announces setpoint/fan/mode changes ----
      const live = document.createElement("div");
      live.className = "ct-sr";
      live.setAttribute("aria-live", "polite");
      live.setAttribute("role", "status");
      card.appendChild(live);
      this._refs.live = live;

      this._built = true;
      this._applyMaxHeight(); // apply any max_height set before this build
      this._applyFont();      // apply any font / font_url set before this build

      // Width-driven compact mode: below COMPACT_W the per-degree tick scale and the
      // tiny captions are hidden via the ct-compact class (CSS in _css). Guarded so it
      // no-ops on engines without ResizeObserver. width 0 (hidden/detached) stays
      // non-compact so there is no compact flash before the first real layout.
      // Compact-mode relayout removed: hiding the ticks + tiny captions below a width
      // breakpoint made the dial visibly RE-LAY-OUT when the browser was merely zoomed
      // (the card's CSS-px width crosses the breakpoint), which reads as broken. The SVG
      // already scales uniformly via its viewBox, so we keep ONE layout at every size.
      // The .ct-compact CSS and the connected/disconnected _ro guards stay as harmless
      // no-ops (this._ro is never created).
      this._compact = false;
      this._applyAppearance(); // apply any glass tint / opacity set before this build
    }

    // Re-observe after a reconnect (the shadow DOM persists, so .ct-card is reused).
    connectedCallback() {
      if (this._built && this._ro) {
        const c = this.shadowRoot && this.shadowRoot.querySelector(".ct-card");
        if (c) this._ro.observe(c); // observing an already-observed element is a safe no-op
      }
    }

    // Rebuild the numbered scale. Ticks at `step` (coarsened if dense); labels every
    // 5 degrees so they always land regardless of step/unit.
    _buildTicks() {
      if (!this._refs.ticks) return;
      const { lo, hi } = this._range();
      const step = this._step();
      const span = this._tempSpan(lo, hi); // guard degenerate/inverted ranges (issue #18)
      let minor = step;
      if (span / minor > 40) minor = span / 40; // cap minor-tick count ~40
      // numbered every 5 degrees on normal ranges; widen on wide ranges so labels never smear
      let labelStride = 5;
      const TARGET_LABELS = 8;                   // cap of numbers drawn around the arc
      if (span / labelStride > TARGET_LABELS) {
        const niceStrides = [10, 15, 20, 25, 50, 100];
        labelStride = niceStrides[niceStrides.length - 1];
        for (const ns of niceStrides) { if (span / ns <= TARGET_LABELS) { labelStride = ns; break; } }
      }
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
          `class="${major ? "ct-tk-major" : "ct-tk-minor"}" stroke-width="${major ? 2.6 : 1.5}"/>`;
      }
      // numbered LABELS every labelStride (decoupled from `minor` so they always land)
      const firstLabel = Math.ceil(lo / labelStride - 1e-6) * labelStride;
      for (let t = firstLabel; t <= hi + 1e-6; t += labelStride) {
        const ang = START_ANG + SPAN * ((t - lo) / span);
        const np = polar(CX, CY, rNum, ang);
        tk += `<text x="${np[0].toFixed(1)}" y="${np[1].toFixed(1)}" text-anchor="middle" dominant-baseline="central" ` +
          `font-size="14.5" letter-spacing="0.5" font-weight="600" fill="rgba(234,235,238,.88)">${this._fmtDisplay(t)}</text>`;
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
    _eventToFanValue(e) {
      const f = this._eventToFrac(e);
      if (f == null) return null;
      return this._snapFanValue(f);
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
    _revertHeatCool() {
      this._optimisticLow = null;
      this._optimisticHigh = null;
      this._optimisticHcUntil = 0;
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

      // HEAT_COOL: optimistic low/high (display units) clear once both live
      // setpoints catch up, same as the single-target reconcile (issue #14).
      if (this._optimisticHcUntil) {
        if (now >= this._optimisticHcUntil) {
          this._optimisticLow = null;
          this._optimisticHigh = null;
          this._optimisticHcUntil = 0;
        } else {
          const liveLo = this._toDisplay(num(attr.target_temp_low));
          const liveHi = this._toDisplay(num(attr.target_temp_high));
          if (liveLo != null && liveHi != null
              && this._optimisticLow != null && this._optimisticHigh != null
              && Math.abs(liveLo - this._optimisticLow) < 0.1
              && Math.abs(liveHi - this._optimisticHigh) < 0.1) {
            this._optimisticLow = null;
            this._optimisticHigh = null;
            this._optimisticHcUntil = 0;
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
          const tol = Math.max(0.5, ((this._fanNumRange() || {}).step || 1) / 2);
          if (liveP != null && Math.abs(liveP - this._optimisticFanPct) < tol) {
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
      // Extra toggles (issue #34): only toggle entities take a hold; selects never do.
      if (this._optToggle && this._extraToggles.length) {
        this._extraToggles.forEach((it) => {
          if (this._xIsSelect(it)) return;
          const o = this._optToggle["x:" + it.entity];
          if (!o) return;
          if (now >= o.until || this._xLiveOn(it) === o.val) this._optToggle["x:" + it.entity] = null;
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
      // ARM the gesture NOW so the svg touchmove guard claims it from the very
      // first move and the page can never scroll mid-drag (touch regression). We
      // still hold off PAINTING until the pointer travels past DRAG_THRESH_PX, so a
      // pure tap is discarded and cannot commit a setpoint (issue #4).
      e.stopPropagation();
      this._ringArmed = true;
      this._dragging = false;
      this._ringStart = { x: e.clientX, y: e.clientY };
      this._pendingTemp = null;
      this._fanPendingPct = null;
      this._fanPendingName = null;
      // heat_cool two-handle: lock which setpoint (low/high) this drag owns and
      // seed BOTH pending values, so the handle the user is not dragging holds
      // its position. _hcHandle stays null for normal single-target dials, which
      // keeps them on the unchanged single-temperature path below (issue #14).
      this._hcHandle = null;
      this._hcPendingLow = null;
      this._hcPendingHigh = null;
      if (this._active === "temp" && this._isHeatCool()) {
        const lo = this._hcLow(), hi = this._hcHigh();
        this._hcPendingLow = lo;
        this._hcPendingHigh = hi;
        const f = this._eventToFrac(e);
        const r = this._range();
        const span = this._tempSpan(r.lo, r.hi); // guard degenerate/inverted ranges (issue #18)
        const fLo = clamp((lo - r.lo) / span, 0, 1);
        const fHi = clamp((hi - r.lo) / span, 0, 1);
        const ff = (f != null) ? f : 0;
        this._hcHandle = Math.abs(ff - fLo) <= Math.abs(ff - fHi) ? "low" : "high";
      }
      try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
      window.addEventListener("pointermove", this._onRingMove);
      window.addEventListener("pointerup", this._onRingUp);
      window.addEventListener("pointercancel", this._onRingUp);
    }
    _ringPointerMove(e) {
      if (!this._ringArmed) return;
      if (!this._dragging) {
        // tap-vs-drag gate: nothing paints or commits until travel crosses the
        // threshold (same ~8px the fan clover uses). The gesture is ALREADY claimed
        // (page scroll blocked) since _ringArmed went true on pointerdown; below the
        // threshold we simply paint/commit nothing so a tap can't nudge the value.
        const st = this._ringStart;
        if (!st || Math.hypot(e.clientX - st.x, e.clientY - st.y) <= DRAG_THRESH_PX) return;
        this._dragging = true; // drag CONFIRMED -> from here we paint + will commit
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
        if (this._active === "temp") {
          if (this._hcHandle) {
            // heat_cool: write the low/high pair (issue #14).
            if (this._hcPendingLow != null && this._hcPendingHigh != null) {
              this._commitHeatCool(this._hcPendingLow, this._hcPendingHigh);
            }
          } else if (this._pendingTemp != null && isFinite(this._pendingTemp)) {
            this._commitTemp(this._pendingTemp);
          }
        } else if (this._active === "fan") {
          if (this._fanPendingPct != null) this._commitFanPct(this._fanPendingPct);
          else if (this._fanPendingName != null) this._commitFanName(this._fanPendingName);
        }
      }
      this._active = null;
      this._pendingTemp = null;
      this._hcHandle = null;
      this._hcPendingLow = null;
      this._hcPendingHigh = null;
      this._fanPendingPct = null;
      this._fanPendingName = null;
    }
    _applyRingDrag(e) {
      if (this._active === "temp") {
        const t = this._eventToTemp(e);
        if (t == null) return;
        if (this._hcHandle) {
          // heat_cool: move only the locked handle; keep the other fixed and
          // separated by at least one step so we never send low > high (issue #14).
          const st = this._step();
          const r = this._range();
          let lo = this._hcPendingLow, hi = this._hcPendingHigh;
          if (this._hcHandle === "low") lo = clamp(t, r.lo, hi - st);
          else hi = clamp(t, lo + st, r.hi);
          this._hcPendingLow = lo;
          this._hcPendingHigh = hi;
          this._optimisticLow = lo;
          this._optimisticHigh = hi;
          this._optimisticHcUntil = Date.now() + OPT_HOLD_MS;
          this._paintHeatCool(lo, hi);
          return;
        }
        this._pendingTemp = t;
        // optimistic paint every move; NO service call here.
        this._optimisticTarget = t;
        this._optimisticUntil = Date.now() + OPT_HOLD_MS;
        this._paintTempArc(t);
      } else if (this._active === "fan") {
        if (this._fanUsesNumber()) {
          const p = this._eventToFanValue(e);
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

    // ============================================================================
    // KEYBOARD OPERABILITY  (issue #5): the rings are role="slider"s; these key
    // handlers nudge the value and commit through the SAME _commit* paths as a
    // pointer drag, so behavior is identical for pointer users.
    // ============================================================================
    _ringKeyDown(e, ring) {
      const s = this._st(this._config.entity);
      if (!s || s.state === "off" || s.state === "unavailable" || s.state === "unknown") return;
      if (this._popOpen) return;
      if (ring === "temp") this._tempKeyDown(e, s);
      else this._fanKeyDown(e, s);
    }

    // Arrow = one step, Page = five steps, Home/End = min/max. heat_cool nudges the
    // HIGH (cool) setpoint and keeps LOW fixed, mirroring the single warm needle.
    _tempKeyDown(e, s) {
      const { lo, hi } = this._range();
      const step = this._step();
      const big = step * 5;
      const snap = (v, min, max) => clamp(Math.round(v / step) * step, min, max);
      const k = e.key;
      let handled = true;

      if (this._isHeatCool()) {
        const hcOpt = this._optimisticHcUntil && Date.now() < this._optimisticHcUntil
          && this._optimisticLow != null && this._optimisticHigh != null;
        const cLo = hcOpt ? this._optimisticLow : this._hcLow();
        const cHi = hcOpt ? this._optimisticHigh : this._hcHigh();
        if (cLo == null || cHi == null) return;
        let nh = cHi;
        if (k === "ArrowUp" || k === "ArrowRight") nh = cHi + step;
        else if (k === "ArrowDown" || k === "ArrowLeft") nh = cHi - step;
        else if (k === "PageUp") nh = cHi + big;
        else if (k === "PageDown") nh = cHi - big;
        else if (k === "Home") nh = cLo + step;
        else if (k === "End") nh = hi;
        else handled = false;
        if (handled) {
          e.preventDefault();
          this._commitHeatCool(cLo, snap(nh, cLo + step, hi));
        }
        return;
      }

      const optActive = this._optimisticUntil && Date.now() < this._optimisticUntil
        && this._optimisticTarget != null;
      let cur = optActive ? this._optimisticTarget : this._toDisplay(num((s.attributes || {}).temperature));
      if (cur == null) cur = lo;
      let nt = cur;
      if (k === "ArrowUp" || k === "ArrowRight") nt = cur + step;
      else if (k === "ArrowDown" || k === "ArrowLeft") nt = cur - step;
      else if (k === "PageUp") nt = cur + big;
      else if (k === "PageDown") nt = cur - big;
      else if (k === "Home") nt = lo;
      else if (k === "End") nt = hi;
      else handled = false;
      if (handled) {
        e.preventDefault();
        this._commitTemp(snap(nt, lo, hi));
      }
    }

    // Percent ring: arrows step by FAN_STEP, Page by five steps, Home/End = min/max.
    // Named-mode ring: arrows/Page move one stop, Home/End jump to first/last mode.
    _fanKeyDown(e, s) {
      const useNum = this._fanUsesNumber();
      const k = e.key;
      let handled = true;
      const fanOptActive = this._optimisticFanUntil && Date.now() < this._optimisticFanUntil;

      if (useNum) {
        const r = this._fanNumRange();
        let p;
        if (fanOptActive && this._optimisticFanPct != null) p = this._optimisticFanPct;
        else { const liveP = num((this._fanNumState() || {}).state); p = liveP != null ? liveP : r.min; }
        const big = r.step * 5;
        let np = p;
        if (k === "ArrowUp" || k === "ArrowRight") np = p + r.step;
        else if (k === "ArrowDown" || k === "ArrowLeft") np = p - r.step;
        else if (k === "PageUp") np = p + big;
        else if (k === "PageDown") np = p - big;
        else if (k === "Home") np = r.min;
        else if (k === "End") np = r.max;
        else handled = false;
        if (handled) { e.preventDefault(); this._commitFanPct(clamp(np, r.min, r.max)); }
        return;
      }

      const names = this._fanNamedModes();
      if (!names.length) return;
      const curName = (fanOptActive && this._optimisticFanName != null)
        ? this._optimisticFanName : (s.attributes || {}).fan_mode;
      let i = names.findIndex((m) => String(m).toLowerCase() === String(curName).toLowerCase());
      if (i < 0) i = 0;
      let ni = i;
      if (k === "ArrowUp" || k === "ArrowRight" || k === "PageUp") ni = i + 1;
      else if (k === "ArrowDown" || k === "ArrowLeft" || k === "PageDown") ni = i - 1;
      else if (k === "Home") ni = 0;
      else if (k === "End") ni = names.length - 1;
      else handled = false;
      if (handled) { e.preventDefault(); this._commitFanName(names[clamp(ni, 0, names.length - 1)]); }
    }

    // ---- modal-dialog keyboard: Escape closes, Tab is trapped inside (issue #5) ----
    _popFocusables() {
      if (!this._refs.sheet) return [];
      return Array.from(this._refs.sheet.querySelectorAll("button"))
        .filter((b) => b.style.display !== "none" && !b.disabled);
    }
    _popKeyDown(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this._closePop(); return; }
      if (e.key !== "Tab") return;
      const f = this._popFocusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const active = this.shadowRoot ? this.shadowRoot.activeElement : null;
      if (e.shiftKey) {
        if (active === first || f.indexOf(active) === -1) { e.preventDefault(); last.focus(); }
      } else {
        if (active === last || f.indexOf(active) === -1) { e.preventDefault(); first.focus(); }
      }
    }

    // ---- screen-reader announcements (visually-hidden polite live region) ----
    _announce(msg) {
      if (this._refs && this._refs.live && msg != null) this._refs.live.textContent = String(msg);
    }
    _unitWord() { return this._t(this._unit() === "C" ? "celsius" : "fahrenheit"); }

    // ---- i18n helpers (issue #19) ----
    // Flat card string in the active language (English fallback).
    _t(key) { return tr(this._hass, key); }
    // HVAC mode display name via Home Assistant; uppercased fallback for the SVG
    // center label (no CSS text-transform there). Returns a non-empty string.
    _modeName(mode) { return modeName(this._hass, mode) || String(mode).toUpperCase(); }
    // fan_mode display name via Home Assistant (matches the dashboard); uppercased
    // raw fallback so custom fan_modes and older HA still render. DISPLAY ONLY:
    // service calls always send the raw fan_mode value, never this string.
    _fanModeName(name) {
      if (this._hass && typeof this._hass.formatEntityAttributeValue === "function") {
        try {
          const st = this._st(this._config.entity);
          if (st) {
            const v = this._hass.formatEntityAttributeValue(st, "fan_mode", name);
            if (v) return String(v).toUpperCase();
          }
        } catch (e) {}
      }
      return String(name).toUpperCase();
    }
    // BCP47 tag for number formatting from hass language/locale.
    _localeTag() {
      return (this._hass && (this._hass.language || (this._hass.locale && this._hass.locale.language))) || "en";
    }
    // Locale used for number formatting, honoring hass.locale.number_format. "none"
    // -> null (plain, no separators); the named formats map to a representative tag;
    // language/system/default/unset -> the active language tag.
    _numberLocale() {
      const nf = this._hass && this._hass.locale && this._hass.locale.number_format;
      switch (nf) {
        case "comma_decimal": return "en-US";
        case "decimal_comma": return "de-DE";
        case "space_comma": return "fr-FR";
        case "none": return null;
        default: return this._localeTag();
      }
    }
    // Human-visible setpoint string: step-rounded then locale-formatted (decimal
    // separator / grouping per the user's locale). Trailing zeros are dropped to
    // match _fmt (72 not 72.0, 21.5 kept). Used for ALL visible text + aria-valuetext;
    // _fmt stays the dotted-decimal source for the numeric aria-value* attributes.
    _fmtDisplay(v) {
      if (v == null) return "";
      const st = this._step();
      const maxDec = st < 1 ? 1 : 0;
      const r = Math.round(v / st) * st;
      const tag = this._numberLocale();
      if (!tag) return this._fmt(v);
      try {
        return r.toLocaleString(tag, { minimumFractionDigits: 0, maximumFractionDigits: maxDec });
      } catch (e) {
        return this._fmt(v);
      }
    }
    // (Re)apply the card's static localized strings (svg captions + aria-labels).
    // Cheap; called from _render only when the language changes (_i18nLang guard).
    _applyStaticStrings() {
      const r = this._refs;
      if (!r) return;
      if (r.nowLabel) r.nowLabel.textContent = this._t("now") + " ";
      if (r.swingCap) r.swingCap.textContent = this._t("swing");
      if (r.fanIconHit) r.fanIconHit.setAttribute("aria-label", this._t("set_fan_auto"));
      if (r.swingChip) r.swingChip.setAttribute("aria-label", this._t("swing"));
      if (r.centerHit) r.centerHit.setAttribute("aria-label", this._t("change_mode"));
      if (r.drag) r.drag.setAttribute("aria-label", this._t("target_temperature"));
      if (r.fanGrab) r.fanGrab.setAttribute("aria-label", this._t("fan_speed"));
      if (r.pop) r.pop.setAttribute("aria-label", this._t("select_mode"));
      if (r.hintMode) r.hintMode.textContent = this._t("hint_mode");
      if (r.hintFan) r.hintFan.textContent = this._t("hint_fan");
      if (r.hintAuto) r.hintAuto.textContent = this._t("hint_auto");
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
      this._announce(this._fmtDisplay(t) + "° " + this._unitWord());
      this._callTemp(t);
    }

    // ---- HEAT_COOL service call: write BOTH setpoints in one set_temperature
    // call (the correct shape for a dual-setpoint entity), optimistic + revert
    // on failure like the single-target path (issue #14). ----
    _commitHeatCool(lo, hi) {
      if (lo == null || hi == null || !this._hass) return;
      const s = this._st(this._config.entity);
      if (!s) return;
      this._optimisticLow = lo;
      this._optimisticHigh = hi;
      this._optimisticHcUntil = Date.now() + OPT_HOLD_MS;
      this._paintHeatCool(lo, hi);
      this._announce(this._fmtDisplay(lo) + " " + this._t("to") + " " + this._fmtDisplay(hi) + "° " + this._unitWord());
      this._svc("climate", "set_temperature",
        { entity_id: this._config.entity,
          target_temp_low: this._toHa(lo),
          target_temp_high: this._toHa(hi) },
        () => this._revertHeatCool());
    }

    // ---- FAN service calls ----
    // Authoritative numeric fan write: set the number value, snapped to its real
    // range. Also pull the climate fan_mode off "auto" to the nearest supported
    // mode so the value actually applies (Midea). When there is NO number entity,
    // fall back to the nearest named fan_mode (issue #8).
    _callFanPct(p) {
      if (!this._hass) return;
      const id = this._fanNumberId();
      if (!id) {
        const nm = this._nearestFanMode(p);
        if (nm) this._svc("climate", "set_fan_mode",
          { entity_id: this._config.entity, fan_mode: nm },
          () => this._revertFan());
        return;
      }
      const r = this._fanNumRange() || { min: FAN_MIN, max: FAN_MAX };
      const s = this._st(this._config.entity);
      if (s && String(s.attributes.fan_mode).toLowerCase() === "auto") {
        const nm = this._nearestFanMode(p);
        if (nm) this._svc("climate", "set_fan_mode",
          { entity_id: this._config.entity, fan_mode: nm },
          () => this._revertFan());
      }
      this._svc("number", "set_value",
        { entity_id: id, value: clamp(p, r.min, r.max) },
        () => this._revertFan());
    }
    _commitFanPct(p) {
      const r = this._fanNumRange() || { min: FAN_MIN, max: FAN_MAX };
      this._optimisticFanPct = clamp(p, r.min, r.max);
      this._optimisticFanName = null;
      this._optimisticFanUntil = Date.now() + OPT_HOLD_MS;
      this._paintFanPct(this._optimisticFanPct);
      this._announce(this._t("fan") + " " + (r.max === 100
        ? Math.round(this._optimisticFanPct) + " " + this._t("percent")
        : this._fmtFan(this._optimisticFanPct, r.step)));
      this._callFanPct(this._optimisticFanPct);
    }
    // Named fan_mode commit (discrete-stop ring), optimistic + climate.set_fan_mode.
    _commitFanName(name) {
      if (!name) return;
      this._optimisticFanName = name;
      this._optimisticFanPct = null;
      this._optimisticFanUntil = Date.now() + OPT_HOLD_MS;
      this._paintFanNamed(this._fanNamedModes(), name);
      this._announce(this._t("fan") + " " + this._fanModeName(name));
      this._svcSetFanMode(name);
    }
    // Set the climate fan_mode to "auto" + paint optimistically.
    _callFanAuto() {
      if (!this._hass) return;
      this._optimisticFanUntil = 0; // drop any stale optimism so AUTO paints
      this._optimisticFanPct = null;
      this._optimisticFanName = null;
      this._paintFanAuto();
      this._announce(this._t("fan") + " " + this._t("automatic"));
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
      if (this._fanUsesNumber() || hasAuto) { this._callFanAuto(); return; }
      const names = this._fanNamedModes();
      if (!names.length) return;
      let i = names.findIndex((m) => String(m).toLowerCase() === String(attr.fan_mode).toLowerCase());
      const next = names[(i + 1 + (i < 0 ? 0 : 0)) % names.length];
      this._commitFanName(i < 0 ? names[0] : next);
    }

    // ============================================================================
    // CENTER-DISC TAP / HOLD / DOUBLE-TAP  (issue #15)
    // A self-contained gesture detector on the center disc, independent of the ring
    // drag (_ringArmed short-circuits it so the two never overlap). It respects
    // DRAG_THRESH_PX so a swipe off the disc is neither a tap nor a hold, and only
    // defers the single tap when a double_tap_action is configured (no tap latency
    // otherwise). The default tap still opens the mode popup; default hold = more-info.
    // ============================================================================
    _centerPointerDown(e) {
      if (this._popOpen || this._ringArmed) return;
      if (e.button && e.button !== 0) return;
      // Touch taps/holds are driven from the svg touch guards (touchend fires the tap,
      // a hold timer fires hold_action) so iOS can't drop the tap to a pointercancel
      // under pan-y, and a vertical swipe off the disc still scrolls. Mouse/pen keep
      // the full pointer tap/hold/double-tap path below.
      if (e.pointerType === "touch") return;
      e.stopPropagation();
      this._centerStart = { x: e.clientX, y: e.clientY };
      this._centerPointerType = e.pointerType || "mouse";
      this._centerMoved = false;
      this._centerHeld = false;
      this._setPress(true);
      try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
      this._onCenterMove = (ev) => this._centerPointerMove(ev);
      this._onCenterUp = (ev) => this._centerPointerUp(ev);
      window.addEventListener("pointermove", this._onCenterMove);
      window.addEventListener("pointerup", this._onCenterUp);
      window.addEventListener("pointercancel", this._onCenterUp);
      // Start the hold timer only when a hold action would actually fire.
      const hold = this._config.hold_action || { action: "more-info" };
      if (hold.action && hold.action !== "none") {
        this._centerHoldTimer = setTimeout(() => {
          this._centerHoldTimer = null;
          if (this._centerMoved) return;
          this._centerHeld = true;
          this._setPress(false);
          this._runHoldAction();
        }, HOLD_MS);
      }
    }
    _centerPointerMove(e) {
      const st = this._centerStart;
      if (!st) return;
      const slop = this._centerPointerType === "touch" ? CENTER_TAP_SLOP : DRAG_THRESH_PX;
      if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > slop) {
        // a swipe off the disc: never a tap or hold (touch gets a wider slop than mouse).
        this._centerMoved = true;
        this._setPress(false);
        if (this._centerHoldTimer) { clearTimeout(this._centerHoldTimer); this._centerHoldTimer = null; }
      }
    }
    _centerPointerUp(e) {
      window.removeEventListener("pointermove", this._onCenterMove);
      window.removeEventListener("pointerup", this._onCenterUp);
      window.removeEventListener("pointercancel", this._onCenterUp);
      this._onCenterMove = null;
      this._onCenterUp = null;
      if (this._centerHoldTimer) { clearTimeout(this._centerHoldTimer); this._centerHoldTimer = null; }
      this._setPress(false);
      this._lastCenterUp = Date.now();
      const moved = this._centerMoved;
      const held = this._centerHeld;
      this._centerStart = null;
      this._centerMoved = false;
      this._centerHeld = false;
      if (e.type === "pointercancel" || moved || held) return;
      // a clean tap. Defer it only when a double-tap action is configured.
      if (this._dblConfigured()) {
        if (this._centerTapTimer) {
          // second tap inside the window -> double tap.
          clearTimeout(this._centerTapTimer);
          this._centerTapTimer = null;
          this._runDoubleTapAction();
        } else {
          this._centerTapTimer = setTimeout(() => {
            this._centerTapTimer = null;
            this._runTapAction();
          }, DBL_TAP_MS);
        }
      } else {
        this._runTapAction();
      }
    }
    _dblConfigured() {
      const d = this._config.double_tap_action;
      return !!(d && d.action && d.action !== "none");
    }
    _runTapAction() {
      if (this._config.tap_action) this._handleAction(this._config.tap_action);
      else this._openPop();
    }
    _runHoldAction() {
      this._handleAction(this._config.hold_action || { action: "more-info" });
    }
    _runDoubleTapAction() {
      if (this._config.double_tap_action) this._handleAction(this._config.double_tap_action);
    }
    // Flash the center press-feedback disc (opacity only; no transform, so it plays
    // nice with prefers-reduced-motion and never clobbers a presentation transform).
    _setPress(on) {
      if (this._refs.pressDisc) this._refs.pressDisc.style.opacity = on ? "0.14" : "0";
    }
    // Fire the more-info dialog for an entity (composed event crosses the shadow roots).
    _fireMoreInfo(id) {
      if (!id) return;
      fireEvent(this, "hass-more-info", { entityId: id });
    }
    // SPA navigation (mirrors HA's navigate handler).
    _navigate(path) {
      if (!path) return;
      history.pushState(null, "", path);
      fireEvent(window, "location-changed", { replace: false });
    }
    // Dispatch a standard HA action config (mirrors custom-card-helpers handleAction).
    // Supports both the new perform_action/data/target and legacy service shapes.
    _handleAction(cfg) {
      if (!cfg || !cfg.action || cfg.action === "none") return;
      if (cfg.confirmation && cfg.confirmation.text != null) {
        if (!window.confirm(cfg.confirmation.text)) return;
      } else if (cfg.confirmation === true) {
        if (!window.confirm("Are you sure?")) return;
      }
      const entity = cfg.entity || this._config.entity;
      switch (cfg.action) {
        case "more-info":
          this._fireMoreInfo(entity);
          break;
        case "toggle":
          if (this._hass) this._hass.callService("homeassistant", "toggle", { entity_id: entity });
          break;
        case "navigate":
          this._navigate(cfg.navigation_path);
          break;
        case "url":
          if (cfg.url_path) window.open(cfg.url_path);
          break;
        case "perform-action":
        case "call-service": {
          if (!this._hass) break;
          const svc = cfg.perform_action || cfg.service;
          if (!svc || svc.indexOf(".") < 0) break;
          const [d, sv] = svc.split(".");
          this._hass.callService(d, sv, cfg.data || cfg.service_data || {}, cfg.target);
          break;
        }
        case "fire-dom-event":
          fireEvent(this, "ll-custom", cfg);
          break;
        default:
          break;
      }
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
      // climate generic: resolve a REAL off-like member from the entity's own
      // swing_modes (case-insensitive match to "off", but send the entity's own
      // casing) and toggle against a real on member. With no off member (pure
      // vane-position lists like MelCloud ["Auto","1".."5","Swing"]) cycle to the
      // next real swing_mode. Never send a value outside swing_modes.
      const st = this._st(m.ref);
      const modes = (st && st.attributes && st.attributes.swing_modes) || [];
      const onMode = modes.find((x) => String(x).toLowerCase() !== "off") || modes[0] || "vertical";
      const cur = st && st.attributes && st.attributes.swing_mode;
      const offMode = modes.find((x) => String(x).toLowerCase() === "off");
      if (offMode) {
        this._svcSetSwingMode(this._swingIsOn() ? offMode : onMode);
      } else if (modes.length) {
        const i = modes.findIndex((x) => String(x) === String(cur));
        this._svcSetSwingMode(modes[(i + 1) % modes.length]);
      }
    }
    // Whether a feature has a backing source the card can auto-detect.
    _featureAvail(kind) {
      if (kind === "swing") return !!this._swingMode().kind;
      const ref = kind === "led" ? this._ledRef() : this._soundRef();
      return !!(ref && this._st(ref));
    }
    // Resolved (visible) for a feature, honoring the tri-state config like show_fan:
    // true = force shown, false = force hidden, "auto"/unset = show only if available.
    _featureResolved(kind) {
      const cfg = this._featureCfg(kind);
      return cfg === true ? true : cfg === false ? false : this._featureAvail(kind);
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
        this._announce(this._t("swing") + " " + this._t(this._optToggle.swing.val ? "on" : "off"));
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
      this._announce(this._t(kind) + " " + this._t(!on ? "on" : "off"));
      this._svc("switch", on ? "turn_off" : "turn_on", { entity_id: ref },
        () => this._revertToggle(kind));
    }

    // ---- USER EXTRA TOGGLES (issue #34): capability + resolution helpers ----
    _xDomain(it) { return String(it.entity).split(".")[0]; }
    _xIsSelect(it) { const d = this._xDomain(it); return d === "select" || d === "input_select"; }

    // null = missing/unavailable/unknown (chip renders disabled). Reads via _st (null-safe).
    _xAvail(it) {
      const st = this._st(it.entity);
      if (!st) return false;
      const s = String(st.state).toLowerCase();
      return s !== "unavailable" && s !== "unknown";
    }
    _xName(it) {
      if (it.name) return it.name;
      const st = this._st(it.entity);
      const fn = st && st.attributes && st.attributes.friendly_name;
      return fn || (String(it.entity).split(".")[1] || it.entity).replace(/_/g, " ");
    }
    _xIcon(it) {
      if (it.icon) return it.icon;
      const st = this._st(it.entity);
      const ic = st && st.attributes && st.attributes.icon;
      if (ic) return ic;
      return this._xIsSelect(it) ? "mdi:format-list-bulleted" : "mdi:toggle-switch-variant";
    }
    // TOGGLE live/optimistic state, keyed "x:<entity>" so it never collides with swing/led/sound.
    _xLiveOn(it) { const st = this._st(it.entity); return !!(st && String(st.state).toLowerCase() === "on"); }
    _xOn(it) {
      const o = this._optToggle && this._optToggle["x:" + it.entity];
      if (o && Date.now() < o.until) return o.val;
      return this._xLiveOn(it);
    }
    // SELECT readers (raw option strings; HA does not localize arbitrary options).
    _xCurOpt(it) { const st = this._st(it.entity); return st ? String(st.state) : null; }
    _xNextOpt(it) {
      const st = this._st(it.entity);
      const opts = st && st.attributes && st.attributes.options;
      if (!Array.isArray(opts) || !opts.length) return null;
      const i = opts.findIndex((o) => String(o) === String(st.state)); // -1 -> opts[0]
      return opts[(i + 1) % opts.length];
    }
    // Tap: switch/input_boolean/other -> optimistic on/off; select/input_select -> cycle.
    _xTap(idx) {
      const it = this._extraToggles[idx];
      if (!it || !this._hass || !this._xAvail(it)) return;   // missing/unavailable -> inert
      const dom = this._xDomain(it);
      if (this._xIsSelect(it)) {
        const next = this._xNextOpt(it);
        if (next == null) return;
        this._announce(this._xName(it) + " " + next);
        const sd = dom === "input_select" ? "input_select" : "select";
        this._svc(sd, "select_option", { entity_id: it.entity, option: next }, () => this._render());
        return;                                               // no optimistic hold; live state repaints
      }
      const on = this._xLiveOn(it);
      this._optToggle = this._optToggle || {};
      this._optToggle["x:" + it.entity] = { val: !on, until: Date.now() + OPT_HOLD_MS };
      this._paintPop();
      this._announce(this._xName(it) + " " + this._t(!on ? "on" : "off"));
      const sd = (dom === "switch" || dom === "input_boolean") ? dom : "homeassistant";
      this._svc(sd, on ? "turn_off" : "turn_on", { entity_id: it.entity }, () => this._revertExtra(it.entity));
    }
    _revertExtra(entityId) {
      if (this._optToggle) this._optToggle["x:" + entityId] = null;
      if (this._popOpen) this._paintPop();
      this._render();
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
        b.dataset.mode = m; // raw hvac_mode value (service payload), never localized
        b.textContent = this._modeName(m); // CSS uppercases; HA localizes the name
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
          '<span class="ct-tg-lb">' + this._t(t.kind) + "</span>"; // refreshed in _paintPop
        row.appendChild(b);
        this._refs.toggles[t.kind] = b;
      });
      // USER EXTRA TOGGLES (issue #34): one chip per configured entry, into the same
      // .ct-toggles row so they inherit the swing/led/sound chip styling. Built once;
      // icon/label/lit state are set in _paintPop. Arbitrary entities cannot use inline
      // SVG glyphs, so use <ha-icon> (HA-registered at runtime; empty if absent, chip
      // still works). Rebuilt when setConfig clears _popBuilt.
      this._refs.extra = [];
      this._extraToggles.forEach((it, idx) => {
        const b = document.createElement("button");
        b.className = "ct-toggle";
        b.dataset.xtoggle = String(idx);
        const icon = document.createElement("ha-icon");
        icon.className = "ct-tg-ic";
        const lb = document.createElement("span");
        lb.className = "ct-tg-lb";
        b.appendChild(icon);
        b.appendChild(lb);
        row.appendChild(b);
        this._refs.extra.push({ btn: b, icon, lb });
      });
      sheet.appendChild(row);
      if (!this._onPopClick) {
        this._onPopClick = (e) => {
          const b = e.target && e.target.closest ? e.target.closest("button") : null;
          if (!b) return;
          e.stopPropagation();
          // Toggle chips flip a feature and KEEP the popup open; mode buttons close it.
          if (b.dataset.toggle) { if (this._featureAvail(b.dataset.toggle)) this._featureToggle(b.dataset.toggle); return; }
          if (b.dataset.xtoggle != null) { this._xTap(+b.dataset.xtoggle); return; }
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
      this._announce(this._t("mode") + " " + this._modeName(mode));
      this._closePop();
    }
    _paintPop() {
      if (!this._popBuilt) return;
      const s = this._st(this._config.entity);
      const cur = s ? s.state : null;
      // Mode buttons only (scoped so the toggle chips never get the mode "active").
      this._refs.sheet.querySelectorAll("button[data-mode]").forEach((b) => {
        const active = b.dataset.mode === cur;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false"); // a11y (issue #5)
        b.textContent = this._modeName(b.dataset.mode); // keep localized on a language switch (issue #19)
      });
      // TOGGLES ROW: hide an unresolved chip; else lit ".on" = feature on.
      if (this._refs.toggles) {
        TOGGLE_DEFS.forEach((t) => {
          const b = this._refs.toggles[t.kind];
          if (!b) return;
          const lb = b.querySelector(".ct-tg-lb");
          if (lb) lb.textContent = this._t(t.kind); // localized chip label (issue #19)
          if (!this._featureResolved(t.kind)) { b.style.display = "none"; return; }
          b.style.display = "";
          // Forced-visible with no backing source -> inert, dimmed, not lit.
          const avail = this._featureAvail(t.kind);
          b.classList.toggle("disabled", !avail);
          b.setAttribute("aria-disabled", avail ? "false" : "true");
          const on = avail && this._featureOn(t.kind);
          b.classList.toggle("on", on);
          b.setAttribute("aria-pressed", on ? "true" : "false"); // a11y (issue #5)
        });
      }
      // USER EXTRA TOGGLES (issue #34): dim+inert when missing/unavailable; toggle chips
      // light ".on"; select chips are neutral (never lit) and show the current option.
      if (this._refs.extra) {
        this._refs.extra.forEach((ref, idx) => {
          const it = this._extraToggles[idx];
          const b = ref.btn;
          if (!it) { b.style.display = "none"; return; }
          b.style.display = "";
          ref.icon.setAttribute("icon", this._xIcon(it));   // live: reflects a late friendly icon
          const name = this._xName(it);
          b.title = name;
          if (!this._xAvail(it)) {                           // configured but missing/unavailable
            b.classList.add("disabled"); b.classList.remove("on");
            b.setAttribute("aria-disabled", "true");
            b.removeAttribute("aria-pressed");
            ref.lb.textContent = name;
            b.setAttribute("aria-label", name);
            return;
          }
          b.classList.remove("disabled");
          b.setAttribute("aria-disabled", "false");
          if (this._xIsSelect(it)) {
            const cur = this._xCurOpt(it);
            b.classList.remove("on");
            b.removeAttribute("aria-pressed");
            ref.lb.textContent = cur != null ? cur : name;
            b.setAttribute("aria-label", name + ": " + (cur != null ? cur : ""));
          } else {
            const on = this._xOn(it);
            b.classList.toggle("on", on);
            b.setAttribute("aria-pressed", on ? "true" : "false");
            ref.lb.textContent = name;
            b.setAttribute("aria-label", name + " " + this._t(on ? "on" : "off"));
          }
        });
      }
    }
    _openPop() {
      if (!this._refs.pop) return;
      this._popOpen = true;
      this._buildPop();
      this._paintPop();
      this._refs.pop.classList.add("open");
      // Catch Escape even when focus never made it into the dialog (dedup by the
      // DOM: re-adding the same listener is a no-op). Removed in _closePop.
      if (this._onDocKeydown) document.addEventListener("keydown", this._onDocKeydown, true);
      // a11y (issue #5): move focus into the dialog (active mode -> first mode ->
      // any button). rAF so the element is visible before we focus it.
      const target = this._refs.sheet.querySelector("button[data-mode].active")
        || this._refs.sheet.querySelector("button[data-mode]")
        || this._refs.sheet.querySelector("button");
      if (target) requestAnimationFrame(() => { try { target.focus(); } catch (err) {} });
    }
    _closePop() {
      this._popOpen = false;
      if (this._refs.pop) this._refs.pop.classList.remove("open");
      if (this._onDocKeydown) document.removeEventListener("keydown", this._onDocKeydown, true);
      // a11y (issue #5): return focus to the trigger (the center button).
      if (this._refs.centerHit) { try { this._refs.centerHit.focus(); } catch (err) {} }
    }

    // ============================================================================
    // PAINT HELPERS  (pure visual; optimistic-safe)
    // ============================================================================
    // Positive span between two temps. A degenerate (max == min) or inverted
    // (min > max) range yields a zero/negative denominator, which turns every
    // arc angle into NaN and blanks the whole gauge (issue #18). Substitute one
    // step (falling back to 1) so the dial renders a flat range instead.
    _tempSpan(lo, hi) {
      const span = hi - lo;
      if (span > 0) return span;
      const step = this._step();
      return (step > 0) ? step : 1;
    }
    _tempToAng(t) {
      const { lo, hi } = this._range();
      return START_ANG + SPAN * clamp((t - lo) / this._tempSpan(lo, hi), 0, 1);
    }
    _fanValToAng(v) {
      const r = this._fanNumRange() || { min: FAN_MIN, max: FAN_MAX };
      return START_ANG + SPAN * clamp((v - r.min) / ((r.max - r.min) || 1), 0, 1);
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
      const disp = this._fmtDisplay(t); // visible, locale-formatted (issue #19)
      this._refs.bigNum.textContent = disp;
      // shrink for "XX.5" / 3-digit so the decimal fits the center.
      this._refs.bigNum.setAttribute("font-size", disp.length > 2 ? "84" : "104");
      // a11y: keep the temp slider's reported value in sync (issue #5). The numeric
      // aria-value* stay on _fmt (dotted decimal) so they remain machine-parseable;
      // only the human aria-valuetext uses the locale-formatted string (issue #19).
      if (this._refs.drag) {
        const r = this._range();
        this._refs.drag.setAttribute("aria-valuemin", this._fmt(r.lo));
        this._refs.drag.setAttribute("aria-valuemax", this._fmt(r.hi));
        this._refs.drag.setAttribute("aria-valuenow", this._fmt(t));
        this._refs.drag.setAttribute("aria-valuetext", disp + "° " + this._unitWord());
      }
    }

    // Paint the dual-setpoint (heat_cool) view (issue #14): a comfort band on the
    // temp arc between the two setpoints (cyan near the low handle, warm near the
    // high), the cyan LOW + warm HIGH needles, and a two-tone "68 - 74" readout.
    // Only ever called when _isHeatCool() is true, so single-target dials are
    // entirely unaffected.
    _paintHeatCool(lo, hi) {
      if (lo == null || hi == null) return;
      const aLo = this._tempToAng(lo);
      const aHi = this._tempToAng(hi);
      const mid = (aLo + aHi) / 2;
      // band split at the midpoint: cyan from low->mid, warm from mid->high.
      const coldD = arcPath(CX, CY, R_TEMP, aLo, Math.max(aLo + 0.01, mid));
      const warmD = arcPath(CX, CY, R_TEMP, Math.min(mid, aHi - 0.01), aHi);
      this._refs.coldFill.setAttribute("d", coldD);
      this._refs.coldHalo.setAttribute("d", coldD);
      this._refs.warmFill.setAttribute("d", warmD);
      this._refs.warmHalo.setAttribute("d", warmD);
      const seatLo = polar(CX, CY, R_TEMP, aLo);
      this._refs.tempNeedleLo.setAttribute("transform",
        `translate(${seatLo[0].toFixed(1)},${seatLo[1].toFixed(1)}) rotate(${aLo.toFixed(1)})`);
      const seatHi = polar(CX, CY, R_TEMP, aHi);
      this._refs.tempNeedle.setAttribute("transform",
        `translate(${seatHi[0].toFixed(1)},${seatHi[1].toFixed(1)}) rotate(${aHi.toFixed(1)})`);
      const loTxt = this._fmtDisplay(lo), hiTxt = this._fmtDisplay(hi); // visible (issue #19)
      const plain = loTxt + " - " + hiTxt;
      // two-tone readout: low value cyan, high value warm, separator grey.
      this._refs.bigNum.innerHTML =
        '<tspan fill="#5CD6FF">' + loTxt + '</tspan>' +
        '<tspan fill="#8c99a7"> - </tspan>' +
        '<tspan fill="#F2933A">' + hiTxt + '</tspan>';
      this._refs.bigNum.setAttribute("font-size", plain.length > 8 ? "42" : "54");
      // a11y: the single temp slider reports the HIGH setpoint, with a paired
      // valuetext for both ends; keyboard nudges the HIGH handle (issue #5). Numeric
      // aria-value* stay on _fmt (dotted) so they remain machine-parseable (issue #19).
      if (this._refs.drag) {
        const r = this._range();
        this._refs.drag.setAttribute("aria-valuemin", this._fmt(r.lo));
        this._refs.drag.setAttribute("aria-valuemax", this._fmt(r.hi));
        this._refs.drag.setAttribute("aria-valuenow", this._fmt(hi));
        this._refs.drag.setAttribute("aria-valuetext", loTxt + " " + this._t("to") + " " + hiTxt + "° " + this._unitWord());
      }
    }

    // Paint the fan ring for a percent (number.* entity).
    _paintFanPct(p) {
      const r = this._fanNumRange() || { min: FAN_MIN, max: FAN_MAX, step: 1 };
      p = clamp(p, r.min, r.max);
      const ang = this._fanValToAng(p);
      this._refs.fanFill.setAttribute("d", arcPath(CX, CY, R_FAN, START_ANG, Math.max(START_ANG + 0.01, ang)));
      this._refs.fanFill.style.opacity = "1";
      const seat = polar(CX, CY, R_FAN + FAN_HANDLE_OFFSET, ang);
      this._refs.fanHandle.setAttribute("transform",
        `translate(${seat[0].toFixed(1)},${seat[1].toFixed(1)}) rotate(${ang.toFixed(1)})`);
      // 0..100 equivalent drives the clover spin and the "%" label for a 1..100 source.
      const pctEq = ((p - r.min) / ((r.max - r.min) || 1)) * 100;
      this._refs.fanPct.textContent = (r.max === 100) ? Math.round(pctEq) + "%" : this._fmtFan(p, r.step);
      const nm = this._nearestFanMode(p);
      this._refs.fanName.textContent = nm ? this._fanModeName(nm) : ""; // localized via HA (issue #19)
      this._applyFanSpin(pctEq, false);
      // a11y: report the fan slider against its REAL numeric range (issue #5/#8).
      if (this._refs.fanGrab) {
        this._refs.fanGrab.setAttribute("aria-valuemin", String(r.min));
        this._refs.fanGrab.setAttribute("aria-valuemax", String(r.max));
        this._refs.fanGrab.setAttribute("aria-valuenow", this._fmtFan(p, r.step));
        this._refs.fanGrab.setAttribute("aria-valuetext",
          (r.max === 100) ? Math.round(pctEq) + " " + this._t("percent") : this._fmtFan(p, r.step));
      }
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
      this._refs.fanPct.textContent = this._fanModeName(names[i]); // localized via HA (issue #19)
      this._refs.fanName.textContent = "";
      const pctEq = n <= 1 ? 100 : (i / (n - 1)) * 100;
      this._applyFanSpin(pctEq, false);
      // a11y: report the named stop as a 1..n slider position (issue #5).
      if (this._refs.fanGrab) {
        this._refs.fanGrab.setAttribute("aria-valuemin", "1");
        this._refs.fanGrab.setAttribute("aria-valuemax", String(n));
        this._refs.fanGrab.setAttribute("aria-valuenow", String(i + 1));
        this._refs.fanGrab.setAttribute("aria-valuetext", this._fanModeName(names[i]));
      }
    }

    // Paint the AUTO state (climate.fan_mode == "auto"): full ring, dim, "AUTO".
    _paintFanAuto() {
      this._refs.fanFill.setAttribute("d", arcPath(CX, CY, R_FAN, START_ANG, END_ANG));
      this._refs.fanFill.style.opacity = "0.45";
      const seat = polar(CX, CY, R_FAN + FAN_HANDLE_OFFSET, END_ANG);
      this._refs.fanHandle.setAttribute("transform",
        `translate(${seat[0].toFixed(1)},${seat[1].toFixed(1)}) rotate(${END_ANG.toFixed(1)})`);
      this._refs.fanPct.textContent = this._t("auto");
      this._refs.fanName.textContent = "";
      this._applyFanSpin(100, true);
      // a11y: AUTO is a state, not a ring position (issue #5).
      if (this._refs.fanGrab) {
        this._refs.fanGrab.removeAttribute("aria-valuenow");
        this._refs.fanGrab.setAttribute("aria-valuetext", this._t("automatic"));
      }
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
      // i18n (issue #19): (re)apply static localized strings once per language change,
      // so a runtime language switch updates the captions/aria-labels too.
      const lang = langOf(this._hass);
      if (this._i18nLang !== lang) { this._i18nLang = lang; this._applyStaticStrings(); }
      const s = this._st(this._config.entity);

      if (this._refs.title) this._refs.title.textContent = this._acName();
      // a11y: name the control group so it isn't read as one unlabeled graphic (issue #5).
      if (this._refs.svg) this._refs.svg.setAttribute("aria-label", this._acName() + " " + this._t("climate_control"));

      // scale: rebuild when range/unit/step changed; honor show_scale.
      {
        const rng = this._range(), stp = this._step();
        if (this._lo !== rng.lo || this._hi !== rng.hi || this._tickStep !== stp) this._buildTicks();
        if (this._refs.ticks) this._refs.ticks.style.display = (this._config.show_scale === false) ? "none" : "";
      }

      // Accent follows the theme: a configured accent always wins, else the
      // theme's --accent-color, else the signature cyan. Resolved to a CONCRETE
      // color (not a var() string) so every SVG consumer below keeps working, and
      // recomputed each render so it tracks live light/dark theme switches.
      const cfgA = toColor(this._config.accent);
      this._accent = cfgA || getComputedStyle(this).getPropertyValue("--accent-color").trim() || DEFAULT_ACCENT;

      // UI accent var (popup / chips inherit it through the DOM).
      card.style.setProperty("--ct-accent", this._accent);

      if (!s || s.state === "unavailable" || s.state === "unknown") {
        card.setAttribute("data-mode", "off");
        card.style.setProperty("--accent", this._modeColor("off"));
        this._refs.bigNum.textContent = "--";
        this._refs.bigNum.setAttribute("font-size", "104");
        this._refs.labelTop.textContent = s ? s.state.toUpperCase() : this._t("missing");
        this._refs.labelTop.style.fill = "var(--secondary-text-color, #6b7a88)";
        this._refs.nowCap.style.display = "none";
        this._refs.caret.style.display = "none";
        this._refs.curMarker.style.display = "none";
        if (this._refs.tempNeedleLo) this._refs.tempNeedleLo.style.display = "none";
        this._refs.clover.style.display = "none";
        this._refs.fanPct.style.display = "none";
        this._refs.fanName.style.display = "none";
        this._refs.fanIconHit.style.display = "none";
        this._refs.swingChip.style.display = "none";
        this._refs.swingCap.style.display = "none";
        this._refs.svg.style.opacity = "0.5";
        // a11y: nothing is settable while unavailable -> take the fan slider out of
        // the tab order (the temp slider's key handler already no-ops here, issue #5).
        if (this._refs.fanGrab) { this._refs.fanGrab.setAttribute("tabindex", "-1"); this._refs.fanGrab.setAttribute("aria-hidden", "true"); }
        if (this._refs.hints) this._refs.hints.style.display = "none"; // issue #15
        this._paintModeGlyph(s ? s.state : "off", this._modeColor("off"), true);
        return;
      }

      const attr = s.attributes || {};
      // Drop any optimistic hold the moment live state catches up (issue #9), so
      // the optimistic-vs-live checks below paint live as soon as it is real.
      this._reconcileOptimistic(attr);
      const mode = s.state;
      const off = mode === "off";
      const isHc = this._isHeatCool(); // dual-setpoint dial (issue #14)
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
      if (isHc) {
        // heat_cool: paint the low/high pair (optimistic-or-live) and show the
        // cyan LOW needle (issue #14).
        const hcOpt = this._optimisticHcUntil && Date.now() < this._optimisticHcUntil
          && this._optimisticLow != null && this._optimisticHigh != null;
        const lo = hcOpt ? this._optimisticLow : this._hcLow();
        const hi = hcOpt ? this._optimisticHigh : this._hcHigh();
        if (lo != null && hi != null) {
          this._refs.tempNeedleLo.style.display = "";
          this._paintHeatCool(lo, hi);
        } else {
          this._refs.tempNeedleLo.style.display = "none";
          this._refs.bigNum.textContent = "--"; this._refs.bigNum.setAttribute("font-size", "104");
        }
      } else {
        this._refs.tempNeedleLo.style.display = "none";
        const optActive = this._optimisticUntil && Date.now() < this._optimisticUntil
          && this._optimisticTarget != null;
        const target = optActive ? this._optimisticTarget : this._toDisplay(num(attr.temperature));
        if (target != null) this._paintTempArc(target);
        else { this._refs.bigNum.textContent = "--"; this._refs.bigNum.setAttribute("font-size", "104"); }
      }
      // ---- needle tint: the single-target needle follows the active mode color
      // (issue #21). In heat_cool the warm needle is the HIGH handle paired with
      // the cyan LOW twin, so restore its authored warm there and never touch the
      // LOW needle.
      if (this._refs.tempNeedleBody) {
        if (isHc) {
          this._refs.tempNeedleBody.setAttribute("fill", "#F2933A");
          this._refs.tempNeedleBody.setAttribute("stroke", "#FFB55E");
          this._refs.tempNeedleHi.setAttribute("fill", "rgba(255,225,170,.45)");
        } else {
          this._refs.tempNeedleBody.setAttribute("fill", accent);
          this._refs.tempNeedleBody.setAttribute("stroke", `color-mix(in srgb, ${accent} 62%, #ffffff)`);
          this._refs.tempNeedleHi.setAttribute("fill", `color-mix(in srgb, ${accent} 50%, transparent)`);
        }
      }
      this._refs.tempNeedle.style.opacity = off ? "0.45" : "1";
      this._refs.tempNeedleLo.style.opacity = off ? "0.45" : "1";
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
      this._refs.labelTop.textContent = this._modeName(mode).toUpperCase();
      this._refs.labelTop.style.fill = off ? "var(--disabled-text-color, #5e6b78)" : "var(--primary-text-color, rgba(234,235,238,.8))";
      if (cur != null && showCurrent) {
        this._refs.nowVal.textContent = this._fmtDisplay(cur) + "°";
        this._refs.nowVal.style.fill = off ? "var(--secondary-text-color, #8c99a7)" : accent;
        this._refs.nowCap.style.display = "";
        this._refs.nowCap.style.opacity = off ? "0.5" : "1";
      } else {
        this._refs.nowCap.style.display = "none";
      }

      // ---- caret (cooling = down, heating = up) ----
      // Hidden in heat_cool: the wider "68 - 74" readout sits where the caret
      // would, and the single up/down caret is ambiguous for dual setpoints.
      const action = attr.hvac_action;
      if (isHc) {
        this._refs.caret.style.display = "none";
      } else if (!off && action === "cooling") {
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

      // ---- FAN ring + clover (numeric number OR named fan_modes) ----
      const useNum = this._fanUsesNumber();
      const namedModes = this._fanNamedModes();
      const fanAvail = !!(useNum || namedModes.length);
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
        // a11y: fan slider operable; clover aria-pressed tracks the AUTO state (issue #5).
        if (this._refs.fanGrab) { this._refs.fanGrab.setAttribute("tabindex", "0"); this._refs.fanGrab.removeAttribute("aria-hidden"); }
        const isAutoNow = String(attr.fan_mode).toLowerCase() === "auto" && !fanOptPct && !fanOptName;
        this._refs.fanIconHit.setAttribute("aria-pressed", isAutoNow ? "true" : "false");
        if (useNum) {
          const r = this._fanNumRange();
          const fanIsAuto = String(attr.fan_mode).toLowerCase() === "auto";
          if (fanIsAuto && !fanOptPct) {
            this._paintFanAuto();
          } else {
            const liveP = num((this._fanNumState() || {}).state);
            const p = fanOptPct ? this._optimisticFanPct : (liveP != null ? liveP : r.min);
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
        // a11y: no fan source -> remove the fan slider from the tab order (issue #5).
        if (this._refs.fanGrab) { this._refs.fanGrab.setAttribute("tabindex", "-1"); this._refs.fanGrab.setAttribute("aria-hidden", "true"); }
      }

      // ---- face VERTICAL SWING chip ----
      if (this._featureResolved("swing")) {
        // Forced-visible with no backing source -> render an inert, dimmed OFF chip.
        const avail = this._featureAvail("swing");
        const on = avail && this._featureOn("swing");
        this._refs.swingChip.style.display = "";
        this._refs.swingCap.style.display = "";
        this._refs.swingIcon.setAttribute("stroke", on ? this._accent : "#8a98a6");
        this._refs.swingChipBg.setAttribute("stroke", on ? this._glow(55) : "rgba(234,235,238,.16)");
        this._refs.swingChipBg.setAttribute("fill", on ? this._glow(14) : "rgba(40,52,66,.45)");
        this._refs.swingChip.style.filter = on ? `drop-shadow(0 0 6px ${this._glow(55)})` : "none";
        this._refs.swingChip.removeAttribute("aria-hidden");
        if (!avail) {
          // a11y: a chip with no source is non-interactive (the pointer/keydown
          // handlers already no-op); make that honest to AT and dim it.
          this._refs.swingChip.style.opacity = "0.4";
          this._refs.swingChip.setAttribute("aria-disabled", "true");
          this._refs.swingChip.removeAttribute("aria-pressed");
          this._refs.swingChip.setAttribute("tabindex", "-1");
        } else {
          this._refs.swingChip.style.opacity = off ? "0.4" : "1";
          // a11y: toggle button state for screen readers (issue #5).
          this._refs.swingChip.setAttribute("aria-pressed", on ? "true" : "false");
          this._refs.swingChip.removeAttribute("aria-disabled");
          this._refs.swingChip.setAttribute("tabindex", "0");
        }
      } else {
        this._refs.swingChip.style.display = "none";
        this._refs.swingCap.style.display = "none";
        this._refs.swingChip.setAttribute("aria-hidden", "true");
        this._refs.swingChip.setAttribute("tabindex", "-1");
      }

      // ---- gesture HINT labels (issue #15) ----
      // MODE follows show_hints alone (the center is always interactive); FAN/AUTO
      // also require a fan source so they never point at an absent control. Dimmed
      // further when the unit is off, like the rest of the face.
      if (this._refs.hints) {
        const showHints = this._config.show_hints !== false;
        this._refs.hints.style.display = showHints ? "" : "none";
        this._refs.hints.style.opacity = off ? "0.5" : "1";
        if (this._refs.hintFan) this._refs.hintFan.style.display = haveFan ? "" : "none";
        if (this._refs.hintAuto) this._refs.hintAuto.style.display = haveFan ? "" : "none";
      }

      if (this._popOpen) this._paintPop();
    }

    // step-aware setpoint display (C -> one decimal, F -> whole).
    _fmt(v) {
      const st = this._step();
      const dec = st < 1 ? 1 : 0;
      let s = (Math.round(v / st) * st).toFixed(dec);
      // drop a trailing ".0" so whole degrees read "72" not "72.0"; keep real fractions (C 21.5)
      if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
      return s;
    }

    // ============================================================================
    // CSS  (.ct-card has NO backdrop-filter; .ct-frost is its own blur slab)
    // ============================================================================
    _css() {
      return `
:host{ display:block; -webkit-tap-highlight-color:transparent; }
/* The themed shell. ha-card already paints background / border / radius / shadow
   from the active theme; overflow:visible preserves the dial, temp needle, fan
   chevron, the :focus-visible ring, and the .ct-frost drop shadow that bleed past
   the inner .ct-card box. ha-card sets no transform / filter / contain, so it does
   NOT become the containing block for the fixed .ct-pop. */
ha-card{ position:relative; display:block; overflow:visible; }
/* Neutral structural text follows the theme (these are never runtime fill-patched).
   CSS fill overrides the SVG presentation attribute. labelTop / the NOW caption /
   nowVal are deliberately NOT listed here - they stay JS-driven so their off /
   unavailable dim + per-mode accent states still apply. The heat_cool bigNum tspans
   carry their OWN cyan/orange fill attrs, which beat this inherited .ct-big value. */
.ct-title{ fill:var(--primary-text-color, rgba(234,235,238,.92)); }
.ct-big{ fill:var(--primary-text-color, rgba(234,235,238,.98)); }
.ct-fanpct{ fill:var(--primary-text-color, rgba(234,235,238,.92)); }
.ct-fanname{ fill:var(--secondary-text-color, rgba(234,235,238,.7)); }
.ct-swingcap{ fill:var(--secondary-text-color, rgba(234,235,238,.7)); }
.ct-ticks text{ fill:var(--secondary-text-color, rgba(234,235,238,.88)); }
/* Tick HASH MARKS follow the theme too (they were a hardcoded near-white that
   vanished on a light theme); major/minor hierarchy kept via the mix amount. */
.ct-ticks .ct-tk-major{ stroke:color-mix(in srgb, var(--secondary-text-color, rgb(234,235,238)) 60%, transparent); }
.ct-ticks .ct-tk-minor{ stroke:color-mix(in srgb, var(--secondary-text-color, rgb(234,235,238)) 26%, transparent); }
.ct-card{
  position:relative; width:100%; margin:0 auto; overflow:visible;
  --ct-accent:${DEFAULT_ACCENT};
  --ct-font:${FONT_STACK};
  /* card-colored halo behind the gesture hint glyphs so they read over the fan-arc. */
  --ct-hint-knockout: var(--ha-card-background, var(--card-background-color, #16181d));
  /* pan-y (NOT none): a vertical swipe over the card still scrolls the dashboard;
     only the .ct-hit grab bands below opt out so a ring drag owns the gesture. */
  touch-action:pan-y;
  /* NEVER put backdrop-filter here or on :host: it would re-anchor the fixed .ct-pop. */
}
/* height-capped mode: width follows the arc viewBox aspect (600/392 = 1.5306), centered. */
.ct-card[data-capped]{ width:min(100%, calc(var(--ct-max-h) * 1.5306)); }
.ct-card[data-capped] .ct-svg{ max-height:var(--ct-max-h); }

/* Compact mode (narrow grid cell, set by the ResizeObserver below COMPACT_W): drop
   the per-degree tick scale and the tiny fan-name / SWING captions so they don't blur
   into illegibility. !important beats the inline display _render writes on these refs;
   leaving compact restores that last inline display. The focusable role=slider grab
   bands are untouched (ticks are .nope, non-interactive). */
.ct-card.ct-compact .ct-ticks,
.ct-card.ct-compact .ct-fanname,
.ct-card.ct-compact .ct-swingcap{ display:none !important; }

/* touch-action:pan-y on the dial (NOT none): a vertical swipe over the dial scrolls the
   dashboard by default. touch-action on the root svg IS honored by WebKit (only INNER svg
   nodes ignore it), so this one rule opens scrolling everywhere on the dial; the capturing
   touchmove guard (JS) preventDefaults ONLY while a ring drag owns the gesture, so the page
   still can't scroll mid-drag, and the center tap fires from touchend so iOS never drops it
   to a pointercancel (the old "focus square but no popup" bug). overflow:hidden clips the
   svg to its own 600x392 box so the arcs / caps / needle / fan chevron never bleed. */
.ct-svg{ display:block; width:100%; height:auto; position:relative; z-index:2; touch-action:pan-y; overflow:hidden; }
.ct-svg text{ font-family:var(--ct-font); }
.nope{ pointer-events:none; }
/* Interactive grab bands/buttons. touch-action:pan-y matches the root svg so a vertical
   swipe still scrolls the page on engines that honor touch-action on inner svg nodes
   (WebKit ignores it here anyway); a ring drag is held off scroll by the capturing
   touchmove preventDefault, and the JS tap-vs-drag threshold keeps a pure tap on a band
   from committing a value. */
.ct-hit{ cursor:pointer; touch-action:pan-y; -webkit-tap-highlight-color:transparent; -webkit-user-select:none; user-select:none; }
/* Center press-feedback disc (issue #15): faint accent fill flashed on a center
   pointerdown. Opacity-only transition so it survives prefers-reduced-motion and
   never clobbers a presentation transform. */
.ct-pressdisc{ fill:var(--ct-accent); transition:opacity .14s ease; }
/* Gesture hint labels (issue #15) never intercept a tap (also class .nope). Their
   fill follows the theme so the faint FAN / MODE / AUTO labels stay legible on a
   light theme (they were a hardcoded near-white that washed out on white); the
   color-mix keeps them faint on both themes. The card-colored knockout stroke
   (paint-order:stroke draws it BEHIND the fill) carves a halo around each glyph so
   the labels still read where they overlap the bright cyan fan-arc; the halo hue
   tracks the panel via --ct-hint-knockout (retinted per glass variant below). */
.ct-hints text{ pointer-events:none; fill:color-mix(in srgb, var(--secondary-text-color, rgb(234,235,238)) 55%, transparent); paint-order:stroke; stroke:var(--ct-hint-knockout, var(--ha-card-background, var(--card-background-color, #16181d))); stroke-width:3px; stroke-linejoin:round; }

/* Frosted-glass slab: dark translucent fill, 1px hairline outline, 14px radius. Its OWN
   backdrop-blur div BEHIND the svg, full-card inset; backdrop-filter kept for glass. */
.ct-frost{
  position:absolute; z-index:1; inset:6px; border-radius:14px;
  background:var(--ha-card-background, var(--card-background-color, rgba(18,22,30,.62)));
  backdrop-filter:blur(14px) saturate(1.1);
  -webkit-backdrop-filter:blur(14px) saturate(1.1);
  border:1px solid var(--divider-color, rgba(255,255,255,.16));
  box-shadow:
    inset 0 2px 10px rgba(255,255,255,.08),
    inset 0 -10px 28px rgba(0,0,0,.42),
    0 18px 50px rgba(0,0,0,.50);
  pointer-events:none;
}

/* ----------------------------------------------------------------------------
   GLASS appearance (config: appearance: glass-dark | glass-light). Forces a
   translucent frosted-glass panel on ANY Home Assistant theme. The attribute sits
   on <ha-card> so glass mode can (a) hide the themed card chrome -- a light theme
   would otherwise paint a ring around the slab; (b) override the theme
   text/divider/background CUSTOM PROPERTIES locally on .ct-card so every neutral
   text + the popup retints in one place (light text on the dark glass, dark text on
   the light glass); and (c) repaint .ct-frost as a full-bleed slab. The surface is
   kept SLIGHTLY TRANSLUCENT (alpha < 1) and the backdrop blur frosts the wallpaper
   behind, so the dashboard shows through. Accent / per-mode / arc-gradient colors
   are untouched. Default appearance ("theme") sets NO attribute (byte-unchanged).
   ---------------------------------------------------------------------------- */
ha-card[data-appearance^="glass"]{ background:transparent; border:none; box-shadow:none; }
ha-card[data-appearance^="glass"] .ct-frost{
  inset:0;
  background:
    radial-gradient(125% 110% at 50% -10%, var(--ct-glass-sheen, transparent), transparent 72%),
    rgba(var(--ct-glass-rgb, 20,24,46), var(--ct-glass-alpha, .66));
  backdrop-filter:blur(16px) saturate(1.25);
  -webkit-backdrop-filter:blur(16px) saturate(1.25);
}
/* In glass mode the hint-halo matches the (opaque) panel hue rather than the themed
   card background, so the knockout still reads against the frosted slab. */
ha-card[data-appearance^="glass"] .ct-card{ --ct-hint-knockout: rgb(var(--ct-glass-rgb)); }

/* DARK frosted glass: deep-indigo translucent panel, light neutral text. */
ha-card[data-appearance="glass-dark"] .ct-card{
  --primary-text-color:rgba(236,239,247,.98);
  --secondary-text-color:rgba(202,212,234,.80);
  --divider-color:rgba(150,170,255,.22);
  --ha-card-background:rgba(20,24,46,.72);
  --card-background-color:rgba(20,24,46,.72);
  --ct-glass-rgb:20,24,46; --ct-glass-alpha:.66; --ct-glass-sheen:rgba(150,165,235,.18);
}
ha-card[data-appearance="glass-dark"] .ct-frost{
  border:1px solid rgba(150,170,255,.24);
  box-shadow:
    inset 0 2px 14px rgba(170,185,255,.14),
    inset 0 -16px 38px rgba(0,0,0,.34),
    0 18px 52px rgba(0,0,0,.42);
}

/* LIGHT frosted glass: pale translucent panel, dark neutral text. */
ha-card[data-appearance="glass-light"] .ct-card{
  --primary-text-color:rgba(28,33,48,.96);
  --secondary-text-color:rgba(58,66,86,.82);
  --divider-color:rgba(40,52,90,.20);
  --ha-card-background:rgba(244,247,253,.60);
  --card-background-color:rgba(244,247,253,.60);
  --ct-glass-rgb:244,247,253; --ct-glass-alpha:.60; --ct-glass-sheen:rgba(255,255,255,.55);
}
ha-card[data-appearance="glass-light"] .ct-frost{
  border:1px solid rgba(255,255,255,.55);
  box-shadow:
    inset 0 2px 14px rgba(255,255,255,.60),
    inset 0 -16px 34px rgba(60,70,110,.14),
    0 18px 50px rgba(40,50,90,.22);
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
  background:var(--ha-card-background, var(--card-background-color, linear-gradient(180deg, rgba(24,31,40,.92), rgba(12,17,23,.94))));
  border:1px solid var(--divider-color, rgba(234,235,238,.12)); border-radius:22px; padding:22px;
  -webkit-backdrop-filter:blur(18px) saturate(120%); backdrop-filter:blur(18px) saturate(120%);
  box-shadow:0 24px 60px rgba(0,0,0,.6), inset 0 1px 1px rgba(255,255,255,.05);
  display:grid; grid-template-columns:repeat(3,1fr); gap:12px;
  transform:scale(.92); transition:transform .18s ease;
  font-family:var(--ct-font);
}
.ct-pop.open .ct-sheet{ transform:scale(1); }
.ct-sheet button{
  min-width:120px; padding:18px 14px; cursor:pointer;
  background:var(--secondary-background-color, rgba(30,40,52,.55)); color:var(--secondary-text-color, #9aa8b6);
  border:1px solid var(--divider-color, rgba(234,235,238,.14)); border-radius:12px;
  font:inherit; font-size:15px; letter-spacing:2px; text-transform:uppercase; transition:.15s;
}
.ct-sheet button:hover{ border-color:color-mix(in srgb, var(--ct-accent) 45%, transparent); color:var(--primary-text-color, #c6d3df); }
.ct-sheet button.active{
  background:color-mix(in srgb, var(--ct-accent) 16%, transparent); color:var(--primary-text-color, rgba(234,235,238,.98));
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
  background:var(--secondary-background-color, rgba(30,40,52,.45)); color:var(--secondary-text-color, #8a98a6);
  border:1px solid var(--divider-color, rgba(234,235,238,.14)); border-radius:12px;
  font-size:12px; letter-spacing:1.5px; line-height:1; transition:.15s;
}
.ct-sheet button.ct-toggle:hover{ border-color:color-mix(in srgb, var(--ct-accent) 45%, transparent); color:var(--primary-text-color, #c6d3df); }
.ct-sheet button.ct-toggle.on{
  color:var(--ct-accent);
  background:color-mix(in srgb, var(--ct-accent) 16%, transparent);
  border:1.5px solid var(--ct-accent);
  box-shadow:0 0 14px color-mix(in srgb, var(--ct-accent) 40%, transparent),
    inset 0 0 12px color-mix(in srgb, var(--ct-accent) 14%, transparent);
}
.ct-sheet button.ct-toggle.disabled{ opacity:.4; cursor:default; }
.ct-toggle .ct-tg-ic{ width:24px; height:24px; display:block; }
/* ha-icon paints in currentColor, so the .on accent lights a user chip like the inline-SVG ones. */
.ct-sheet button.ct-toggle ha-icon.ct-tg-ic{ --mdc-icon-size:24px; color:inherit; }
.ct-toggle .ct-tg-lb{ display:block; }
@media (max-width:480px){ .ct-sheet button.ct-toggle{ min-width:72px; padding:9px 8px; } }

/* ---- ACCESSIBILITY (issue #5) ---- */
/* Visually-hidden polite live region: announced by screen readers, never shown. */
.ct-sr{
  position:absolute; width:1px; height:1px; margin:-1px; padding:0; border:0;
  overflow:hidden; clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap;
}
/* High-contrast keyboard focus ring on every focusable control (center button,
   clover, swing chip, popup buttons). :focus-visible so a pointer click stays clean. */
.ct-card :focus-visible{ outline:3px solid var(--ct-accent); outline-offset:2px; }
/* The ring grab-bands span out to the card edge, so an outline rectangle would be
   clipped by .ct-svg overflow:hidden. Tint the band stroke instead so the focused
   slider lights up along the arc it actually controls. */
.ct-svg path[role="slider"]:focus-visible{
  outline:none;
  stroke:color-mix(in srgb, var(--ct-accent) 26%, transparent);
}
/* The center disc is a full-bleed SVG circle, so ANY focus outline boxes its square
   bounding box instead of the round dial. Focus lands on it when a tap/click opens the
   mode popup and again when the popup closes and hands focus back to its trigger, which
   flashed that square on pointer and touch. Scope the ring off the center hit only
   (Enter/Space still open the popup via the keydown handler; the ring-slider focus
   styling above is untouched). :focus, not :focus-visible, so the programmatic
   focus return on popup close never leaves a lingering outline either. */
.ct-card .ct-center-hit:focus{ outline:none; }
/* Respect the reduce-motion setting: stop the fan-clover spin and the popup
   open/close transitions. !important so it also beats the inline fanSpin animation. */
@media (prefers-reduced-motion: reduce){
  .ct-clover g{ animation:none !important; }
  .ct-pop, .ct-pop .ct-sheet{ transition:none !important; }
  .ct-pressdisc{ transition:none !important; } /* press feedback snaps, no fade (issue #15) */
}
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

  // Fields using the tri-state visibility select (fan / swing / LED / sound).
  // Seeded to "auto" for display when unset and pruned back out on save (the card
  // treats unset / "auto" as auto). The localized option list is built per-call in
  // _schema; the field labels/helpers live in LOCALE.<lang>.editorLabels/Helpers
  // (resolved via editorMap), with English as the fallback (issue #19).
  const TRISTATE_KEYS = ["show_fan", "show_swing", "show_led", "show_sound"];

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

    // Flat card string in the active language (English fallback) - issue #19.
    _t(key) { return tr(this._hass, key); }

    // The SELECTED entity's hvac_modes (or a sensible fallback when none is set).
    // Single source for both the Modes multi-select options and the display seed.
    _hvacModes(config) {
      const hass = this._hass;
      const st = hass && config && config.entity && hass.states ? hass.states[config.entity] : null;
      return (st && st.attributes && st.attributes.hvac_modes)
        || ["off", "cool", "heat", "heat_cool", "dry", "fan_only", "auto"];
    }

    // Build the ha-form schema. Re-derived on every change so the Modes multi-select
    // options track the SELECTED entity's live `hvac_modes`.
    _schema(hass, config) {
      const hvac = this._hvacModes(config);
      // Mode option labels localized THROUGH Home Assistant (issue #19); VALUE keys
      // stay the raw hvac_mode strings so prune/compare logic is unaffected.
      const modeOptions = hvac.map((m) => ({ value: m, label: modeName(this._hass, m) || String(m).toUpperCase() }));
      // Localized tri-state visibility options. VALUES (string "auto", boolean
      // true/false) are byte-identical to before so _valueChanged prune is unchanged.
      const autoTF = [
        { value: "auto", label: this._t("editor.opt.auto") },
        { value: true, label: this._t("editor.opt.show") },
        { value: false, label: this._t("editor.opt.hide") },
      ];

      return [
        { name: "entity", required: true, selector: { entity: { domain: "climate" } } },
        { name: "name", selector: { text: {} } },

        { type: "expandable", name: "", title: this._t("editor.section.appearance"), icon: "mdi:palette", schema: [
          { name: "appearance", selector: { select: { mode: "dropdown", options: [
            { value: "theme", label: this._t("editor.opt.appearance_theme") },
            { value: "glass-dark", label: this._t("editor.opt.appearance_glass_dark") },
            { value: "glass-light", label: this._t("editor.opt.appearance_glass_light") },
          ] } } },
          { name: "glass_color", selector: { color_rgb: {} } },
          { name: "glass_opacity", selector: { number: { min: 0, max: 1, step: 0.05, mode: "slider" } } },
          { name: "accent", selector: { color_rgb: {} } },
          { name: "font", selector: { text: {} } },
          { name: "font_url", selector: { text: {} } },
          { type: "grid", schema: [
            { name: "temperature_unit", selector: { select: { mode: "dropdown", options: [
              { value: "auto", label: this._t("editor.opt.auto") },
              { value: "F", label: this._t("editor.opt.unit_fahrenheit") },
              { value: "C", label: this._t("editor.opt.unit_celsius") },
            ] } } },
            { name: "temp_step", selector: { number: { min: 0.1, max: 5, step: 0.1, mode: "box" } } },
            { name: "min_temp", selector: { number: { min: -20, max: 120, step: 0.5, mode: "box" } } },
            { name: "max_temp", selector: { number: { min: -20, max: 120, step: 0.5, mode: "box" } } },
          ] },
          { type: "grid", schema: [
            { name: "show_scale", selector: { boolean: {} } },
            { name: "show_current", selector: { boolean: {} } },
            { name: "show_hints", selector: { boolean: {} } },
          ] },
          { type: "expandable", name: "mode_colors", title: this._t("editor.section.mode_colors"), icon: "mdi:format-color-fill",
            schema: MODE_KEYS.map((m) => ({ name: m, selector: { color_rgb: {} } })) },
        ] },

        { type: "expandable", name: "", title: this._t("editor.section.modes"), icon: "mdi:thermostat", schema: [
          { name: "modes", selector: { select: { multiple: true, mode: "list", options: modeOptions } } },
        ] },

        { type: "expandable", name: "", title: this._t("editor.section.fan"), icon: "mdi:fan", schema: [
          { name: "fan_entity", selector: { entity: { domain: "number" } } },
          { type: "grid", schema: [
            { name: "show_fan", selector: { select: { mode: "dropdown", options: autoTF } } },
            { name: "fan_animation", selector: { boolean: {} } },
          ] },
          { name: "fan_animation_speed", selector: { select: { mode: "dropdown", options: [
            { value: "dynamic", label: this._t("editor.opt.anim_dynamic") },
            { value: "constant", label: this._t("editor.opt.anim_constant") },
            { value: "off", label: this._t("editor.opt.anim_off") },
          ] } } },
        ] },

        { type: "expandable", name: "", title: this._t("editor.section.features"), icon: "mdi:tune", schema: [
          { name: "swing_entity", selector: { entity: { domain: "switch" } } },
          { name: "show_swing", selector: { select: { mode: "dropdown", options: autoTF } } },
          { name: "led_entity", selector: { entity: { domain: "switch" } } },
          { name: "show_led", selector: { select: { mode: "dropdown", options: autoTF } } },
          { name: "sound_entity", selector: { entity: { domain: "switch" } } },
          { name: "show_sound", selector: { select: { mode: "dropdown", options: autoTF } } },
        ] },

        { type: "expandable", name: "", title: this._t("editor.section.extra_toggles"), icon: "mdi:toggle-switch-variant", schema: [
          { name: "extra_toggles", selector: { entity: { multiple: true, domain: ["switch", "input_boolean", "select"] } } },
        ] },

        { type: "expandable", name: "", title: this._t("editor.section.layout"), icon: "mdi:arrange-bring-forward", schema: [
          { name: "max_height", selector: { text: {} } },
        ] },

        // Center-disc actions (issue #15). ui_action renders HA's standard action
        // picker; on an older frontend that key may not render, but the CARD still
        // honors any tap_action / hold_action / double_tap_action set in YAML.
        { type: "expandable", name: "", title: this._t("editor.section.actions"), icon: "mdi:gesture-tap", schema: [
          { name: "tap_action", selector: { ui_action: { default_action: "none" } } },
          { name: "hold_action", selector: { ui_action: { default_action: "more-info" } } },
          { name: "double_tap_action", selector: { ui_action: { default_action: "none" } } },
        ] },
      ];
    }

    _update() {
      if (!this._hass || !this._config) return;
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.addEventListener("value-changed", (e) => this._valueChanged(e));
        // Labels/helpers localized via editorMap (active language merged over
        // English); falls back to a localized mode name (per-mode color swatches),
        // then the field title, then a prettified key (issue #19).
        this._form.computeLabel = (s) => {
          const L = editorMap(this._hass, "editorLabels");
          return L[s.name] || modeName(this._hass, s.name) || s.title || prettifyName(s.name);
        };
        this._form.computeHelper = (s) => editorMap(this._hass, "editorHelpers")[s.name] || "";
        const root = this.shadowRoot || this.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = "ha-form{display:block;padding:8px 4px;}" +
          ".ct-editor-warn{display:block;margin:4px 4px 10px;padding:10px 12px;border-radius:8px;" +
          "background:rgba(255,80,80,.12);border:1px solid rgba(255,120,120,.5);color:#ffb3b3;" +
          "font-size:13px;line-height:1.35;}" +
          ".ct-reset-row{margin:10px 4px 4px;padding-top:8px;border-top:1px solid var(--divider-color, rgba(127,127,127,.2));}" +
          ".ct-reset-btn{display:inline-flex;align-items:center;padding:8px 16px;border-radius:10px;cursor:pointer;" +
          "font:inherit;font-size:14px;background:var(--secondary-background-color, rgba(120,130,145,.14));" +
          "color:var(--primary-text-color);border:1px solid var(--divider-color, rgba(127,127,127,.35));}" +
          ".ct-reset-btn:hover{border-color:var(--primary-color, #03a9f4);}" +
          ".ct-reset-caption{margin-top:6px;color:var(--secondary-text-color);font-size:12px;line-height:1.35;}";
        root.appendChild(style);
        root.appendChild(this._form);
        // "Reset styling to defaults": a real BUTTON (ha-form has no button field, and a
        // boolean renders as a misleading on/off toggle). Click clears the styling
        // overrides on the live config; label + caption are localized in the update below.
        this._resetRow = document.createElement("div");
        this._resetRow.className = "ct-reset-row";
        this._resetBtn = document.createElement("button");
        this._resetBtn.type = "button";
        this._resetBtn.className = "ct-reset-btn";
        this._resetBtn.addEventListener("click", () => this._resetStyling());
        this._resetCaption = document.createElement("div");
        this._resetCaption.className = "ct-reset-caption";
        this._resetRow.appendChild(this._resetBtn);
        this._resetRow.appendChild(this._resetCaption);
        root.appendChild(this._resetRow);
        // Inline range-validation banner (issue #18): shown when min >= max so the
        // editor explains the flat dial instead of leaving a confusing blank card.
        this._warn = document.createElement("div");
        this._warn.className = "ct-editor-warn";
        this._warn.setAttribute("role", "alert");
        this._warn.style.display = "none";
        root.insertBefore(this._warn, this._form);
      }
      this._form.hass = this._hass;
      // Feed the form a DISPLAY copy with the swatch/toggle defaults seeded so the
      // color_rgb swatches and default-on toggles reflect real state instead of
      // black / OFF (issues #12, #13). _valueChanged prunes the seeds back out so
      // the saved YAML still carries only user-changed keys.
      this._form.data = this._computeFormData(this._config);
      // Re-derive each time so the Modes options live-populate from the picked entity.
      this._form.schema = this._schema(this._hass, this._config);
      // Range sanity check against the RAW config (both authored in the display
      // unit, so the comparison is unit-agnostic). Only warn when BOTH bounds are
      // explicitly set and min >= max; an unset/half-set range uses entity
      // defaults and is fine (issue #18).
      if (this._warn) {
        const mn = num(this._config.min_temp), mx = num(this._config.max_temp);
        if (this._config.min_temp != null && this._config.max_temp != null && mn != null && mx != null && mn >= mx) {
          this._warn.textContent = this._t("editor.warn_range");
          this._warn.style.display = "";
        } else {
          this._warn.textContent = "";
          this._warn.style.display = "none";
        }
      }
      // Localize the reset button + caption, and only offer it when there is actually
      // styling to clear (otherwise it would be a dead no-op control at defaults).
      if (this._resetBtn) {
        const L = editorMap(this._hass, "editorLabels");
        const H = editorMap(this._hass, "editorHelpers");
        this._resetBtn.textContent = L.reset_styling || "Reset styling to defaults";
        this._resetCaption.textContent = H.reset_styling || "";
        const styled = ["appearance", "glass_color", "glass_opacity", "accent", "font", "font_url", "mode_colors"]
          .some((k) => this._config[k] != null);
        this._resetRow.style.display = styled ? "" : "none";
      }
    }

    // The reset BUTTON action: clear every styling override on the live (already lean)
    // config, emit config-changed, and re-render the form so swatches/sliders fall back
    // to their defaults. Non-styling options (entity, range, modes, actions) are kept.
    _resetStyling() {
      if (!this._config) return;
      const cfg = Object.assign({}, this._config);
      let changed = false;
      for (const k of ["appearance", "glass_color", "glass_opacity", "accent", "font", "font_url", "mode_colors"]) {
        if (k in cfg) { delete cfg[k]; changed = true; }
      }
      if (!changed) return;
      this._config = cfg;
      this.dispatchEvent(new CustomEvent("config-changed", {
        detail: { config: cfg }, bubbles: true, composed: true,
      }));
      this._update();
    }

    // Build the ha-form `data` from the real config, seeding display-only defaults:
    //   (1) accent  -> the card default #4fc3f7 as [r,g,b] when unset, else the
    //       stored value coerced to [r,g,b] (so the swatch never renders black);
    //   (2) mode_colors[*] -> the built-in MODE_COLORS default (as [r,g,b]) for
    //       any mode the user has not overridden (so no swatch renders black);
    //   (3) show_scale / show_current / fan_animation -> true when unset (the card
    //       treats them as on by default, so the toggle must read ON);
    //   (4) modes -> the entity's full hvac_modes when unset (the card shows every
    //       mode by default, so the multi-select must read all-checked);
    //   (5) show_fan / show_swing / show_led / show_sound -> "auto" when unset (the
    //       card auto-detects by default, so the tri-state select must read Auto).
    // This is DISPLAY ONLY; the seeds are removed again in _valueChanged.
    _computeFormData(config) {
      const data = Object.assign({}, config);

      data.accent = colorToRgb(config.accent) || DEFAULT_ACCENT_RGB.slice();

      const srcMc = (config.mode_colors && typeof config.mode_colors === "object"
        && !Array.isArray(config.mode_colors)) ? config.mode_colors : {};
      const mc = {};
      for (const m of MODE_KEYS) {
        mc[m] = colorToRgb(srcMc[m])
          || (MODE_COLORS_RGB[m] ? MODE_COLORS_RGB[m].slice() : null);
      }
      data.mode_colors = mc;

      for (const k of DEFAULT_ON_KEYS) {
        if (data[k] === undefined || data[k] === null) data[k] = true;
      }

      // Modes: unset means "all of the entity's hvac_modes", so seed the full list
      // and every checkbox renders CHECKED instead of all-unchecked.
      if (data.modes === undefined || data.modes === null) {
        const hvac = this._hvacModes(config);
        if (hvac && hvac.length) data.modes = hvac.slice();
      }

      // Tri-state visibility: unset means auto-detect, so the select reads "Auto".
      for (const k of TRISTATE_KEYS) {
        if (data[k] === undefined || data[k] === null) data[k] = "auto";
      }
      // Appearance: unset means "theme", so the select reads Theme instead of blank;
      // a legacy "glass" value maps to the dark variant so the select shows it.
      if (data.appearance === undefined || data.appearance === null) data.appearance = "theme";
      else if (data.appearance === "glass") data.appearance = "glass-dark";

      // Glass tint/opacity: seed the per-variant default so the color swatch shows the
      // real tint (not black) and the slider shows the real translucency (not 0). Theme
      // mode reads the dark base; it is ignored at render and pruned back out on save.
      const gb = GLASS_BASE[data.appearance === "glass-light" ? "glass-light" : "glass-dark"];
      if (data.glass_color === undefined || data.glass_color === null) data.glass_color = gb.rgb.slice();
      else data.glass_color = colorToRgb(data.glass_color) || gb.rgb.slice();
      if (data.glass_opacity === undefined || data.glass_opacity === null) data.glass_opacity = gb.alpha;

      // Extra toggles: the multiple-entity picker understands only an array of entity ids,
      // so flatten object rows to their id for display. Per-row name/icon overrides are
      // re-attached in _valueChanged. Unset seeds [] (clean empty add-control); [] is
      // pruned back out on save.
      data.extra_toggles = normalizeExtra(config.extra_toggles).map((t) => t.entity);
      return data;
    }

    // ha-form fires `value-changed` with the FULL merged config. Prune empties and
    // re-emit the card-standard `config-changed` (the HA editor contract).
    _valueChanged(ev) {
      ev.stopPropagation();
      const cfg = Object.assign({}, ev.detail.value);

      // Undo the display seeding (issues #12, #13): the form re-emits the FULL
      // value including the seeded accent / per-mode colors / default-on toggles,
      // so drop any field still sitting at its seeded default and persist only
      // what the user actually changed (keeps the YAML lean; unset still = default).
      if (rgbEq(cfg.accent, DEFAULT_ACCENT_RGB)) delete cfg.accent;
      if (cfg.mode_colors && typeof cfg.mode_colors === "object" && !Array.isArray(cfg.mode_colors)) {
        const mc = {};
        for (const m of Object.keys(cfg.mode_colors)) {
          const v = cfg.mode_colors[m];
          if (v == null) continue;
          if (rgbEq(v, MODE_COLORS_RGB[m])) continue; // unchanged default -> drop
          mc[m] = v;
        }
        if (Object.keys(mc).length) cfg.mode_colors = mc; else delete cfg.mode_colors;
      }
      for (const k of DEFAULT_ON_KEYS) {
        if (cfg[k] === true) delete cfg[k]; // true is the default -> only persist explicit false
      }
      // Tri-state selects: "auto" is the default -> only persist an explicit Show/Hide.
      for (const k of TRISTATE_KEYS) {
        if (cfg[k] === "auto") delete cfg[k];
      }
      // Appearance: "theme" is the default -> only persist an explicit "glass".
      if (cfg.appearance === "theme") delete cfg.appearance;
      // Modes: a selection equal to the entity's full hvac_modes is the default ->
      // drop it so an unchanged all-checked list is not persisted (only save subsets).
      if (Array.isArray(cfg.modes) && arrSetEq(cfg.modes, this._hvacModes(cfg))) delete cfg.modes;
      // Extra toggles: the picker emits an array of entity-id strings. Re-attach any per-row
      // override (name/icon or a future key) the PRIOR config carried for a still-selected
      // entity, so a membership edit never destroys a YAML-authored name/icon; keep new picks
      // as bare strings; drop the key entirely when empty. this._config here is still the
      // PRIOR saved config (reassigned at the method tail), which is the diff base we need.
      if ("extra_toggles" in cfg) {
        const picked = Array.isArray(cfg.extra_toggles) ? cfg.extra_toggles : [];
        const prev = {};
        const prevList = Array.isArray(this._config && this._config.extra_toggles) ? this._config.extra_toggles : [];
        for (const row of prevList) {
          const id = typeof row === "string" ? row : (row && typeof row === "object" ? row.entity : null);
          if (typeof id === "string" && id.trim()) prev[id.trim()] = row; // RAW row, keeps overrides
        }
        const rows = [];
        for (const sel of picked) {
          const id = typeof sel === "string" ? sel.trim() : (sel && sel.entity);
          if (!id) continue;
          const prior = prev[id];
          rows.push(prior && typeof prior === "object" ? prior : id);
        }
        if (rows.length) cfg.extra_toggles = rows; else delete cfg.extra_toggles;
      }
      // Glass tint/opacity: drop when still at the per-variant default so an unchanged
      // glass keeps a lean YAML (theme mode, where appearance is already deleted above,
      // compares against the dark base and prunes the seeded values out).
      const gbase = GLASS_BASE[cfg.appearance === "glass-light" ? "glass-light" : "glass-dark"];
      if (rgbEq(cfg.glass_color, gbase.rgb)) delete cfg.glass_color;
      if (typeof cfg.glass_opacity === "number" && Math.abs(cfg.glass_opacity - gbase.alpha) < 1e-6) delete cfg.glass_opacity;

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
