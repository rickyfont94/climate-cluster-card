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
  const VERSION = "2.2.1";
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
      close: "Close",
      unavailable: "UNAVAILABLE",
      preset: "Preset",
      swing_h: "SWING H",
      increase_temp: "Increase temperature",
      decrease_temp: "Decrease temperature",
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
      "editor.section.presets": "Presets",
      "editor.section.fan": "Fan",
      "editor.section.features": "Features",
      "editor.section.extra_toggles": "Extra toggles",
      "editor.section.layout": "Layout",
      "editor.section.actions": "Actions",
      "editor.section.mode_colors": "Per-mode colors",
      "editor.section.mode_names": "Mode labels (rename the mode buttons)",
      "editor.opt.auto": "Auto",
      "editor.opt.show": "Show",
      "editor.opt.hide": "Hide",
      "editor.opt.unit_fahrenheit": "Fahrenheit",
      "editor.opt.unit_celsius": "Celsius",
      "editor.opt.anim_dynamic": "Dynamic (scale with speed)",
      "editor.opt.anim_constant": "Constant",
      "editor.opt.anim_off": "Off",
      "editor.opt.fan_style_original": "Original (no animation)",
      "editor.opt.fan_style_breeze": "Breeze (drifting ribbons)",
      "editor.opt.fan_style_silk": "Silk (travelling puffs)",
      "editor.section.rail": "Buttons under the dial",
      "editor.opt.rail_fan": "Fan",
      "editor.opt.rail_swing": "Swing",
      "editor.opt.rail_led": "LED",
      "editor.opt.rail_sound": "Sound",
      "editor.opt.rail_extra": "Your own toggle",
      "editor.opt.appearance_theme": "Theme (follows Home Assistant)",
      "editor.opt.appearance_glass_dark": "Frosted glass (dark)",
      "editor.opt.appearance_glass_light": "Frosted glass (light)",
      "editor.warn_range": "Minimum temperature must be below maximum temperature. The dial uses a flat range until this is fixed.",
      editorLabels: {
        entity: "Climate entity",
        name: "Name",
        fan_style: "Fan ring",
        rail: "Buttons and their order",
        fan_clover: "Spinning fan glyph",
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
        __advanced: "Show all options",
        show_fan: "Fan ring and button",
        show_presets: "Show preset row",
        show_humidity: "Show humidity",
        zone_rows: "Zone rows",
        action_rows: "Button rows",
        show_swing_h: "Show horizontal swing chip",
        swing_h_entity: "Horizontal swing entity (switch.*)",
        show_steppers: "Show plus / minus buttons",
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
        fan_style: "Silk and breeze animate; original is the smooth ring every card installed before this release draws. Both animated ones cost more on a wall tablet that never sleeps.",
        fan_clover: "Brings back the small spinning fan from the original face, beside the status line.",
        rail: "Leave empty for the usual set. Ticking them one at a time sets the order they appear in. A button for something this unit does not have is skipped.",
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
        __advanced: "Modes, presets, fan, feature chips, layout and tap actions. Everything here has a sensible default, so you can leave it closed.",
        show_fan: "Hides the ring and its button together. Auto shows them when a fan source resolves.",
        show_presets: "Force the preset row on or off. Auto shows it when the entity advertises preset_modes.",
        show_humidity: "Force the humidity line on or off. Auto shows it when the entity reports current_humidity.",
        zone_rows: "How many rows the zone tiles are laid out in. Leave empty to let them reflow with the card width.",
        action_rows: "How many rows the group buttons are laid out in. Leave empty to let them wrap on their own.",
        show_swing_h: "Force the horizontal swing chip on or off. Auto shows it when a horizontal axis resolves, from a switch entity or the entity's own swing_horizontal_modes.",
        show_steppers: "Force the plus and minus buttons on or off. Auto shows them on a single-setpoint dial and hides them on a heat_cool dial, where two setpoints would make a bare plus ambiguous.",
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
      close: "Cerrar",
      unavailable: "NO DISPONIBLE",
      preset: "Preajuste",
      swing_h: "OSCILAR H",
      increase_temp: "Subir la temperatura",
      decrease_temp: "Bajar la temperatura",
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
      "editor.section.presets": "Preajustes",
      "editor.section.fan": "Ventilador",
      "editor.section.features": "Funciones",
      "editor.section.extra_toggles": "Controles adicionales",
      "editor.section.layout": "Diseno",
      "editor.section.actions": "Acciones",
      "editor.section.mode_colors": "Colores por modo",
      "editor.section.mode_names": "Etiquetas de modo (renombrar los botones)",
      "editor.opt.auto": "Auto",
      "editor.opt.show": "Mostrar",
      "editor.opt.hide": "Ocultar",
      "editor.opt.unit_fahrenheit": "Fahrenheit",
      "editor.opt.unit_celsius": "Celsius",
      "editor.opt.anim_dynamic": "Dinamica (escala con la velocidad)",
      "editor.opt.anim_constant": "Constante",
      "editor.opt.anim_off": "Apagada",
      "editor.opt.fan_style_original": "Original (sin animacion)",
      "editor.opt.fan_style_breeze": "Breeze (cintas que van y vienen)",
      "editor.opt.fan_style_silk": "Silk (soplos que viajan)",
      "editor.section.rail": "Botones debajo del dial",
      "editor.opt.rail_fan": "Ventilador",
      "editor.opt.rail_swing": "Swing",
      "editor.opt.rail_led": "LED",
      "editor.opt.rail_sound": "Sonido",
      "editor.opt.rail_extra": "Tu propio interruptor",
      "editor.opt.appearance_theme": "Tema (sigue a Home Assistant)",
      "editor.opt.appearance_glass_dark": "Vidrio esmerilado (oscuro)",
      "editor.opt.appearance_glass_light": "Vidrio esmerilado (claro)",
      "editor.warn_range": "La temperatura minima debe ser menor que la maxima. El dial usa un rango plano hasta que se corrija.",
      editorLabels: {
        entity: "Entidad de clima",
        name: "Nombre",
        fan_style: "Anillo del ventilador",
        rail: "Botones y su orden",
        fan_clover: "Ventilador que gira",
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
        __advanced: "Mostrar todas las opciones",
        show_fan: "Anillo y boton del ventilador",
        show_presets: "Mostrar fila de preajustes",
        show_humidity: "Mostrar humedad",
        zone_rows: "Filas de zonas",
        action_rows: "Filas de botones",
        show_swing_h: "Mostrar chip de oscilacion horizontal",
        swing_h_entity: "Entidad de oscilacion horizontal (switch.*)",
        show_steppers: "Mostrar botones mas / menos",
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
        fan_style: "Silk y breeze se animan; original es el anillo suave que dibuja toda tarjeta instalada antes de este release. Los dos animados cuestan mas en una tablet de pared que nunca duerme.",
        fan_clover: "Trae de vuelta el ventilador pequeno que gira de la cara original, al lado de la linea de estado.",
        rail: "Dejalo vacio para el set de siempre. Marcandolos uno por uno defines el orden. Un boton para algo que esta unidad no tiene se salta.",
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
        __advanced: "Modos, preajustes, ventilador, controles, diseno y acciones. Todo aqui tiene un valor por defecto razonable, asi que puedes dejarlo cerrado.",
        show_fan: "Oculta el anillo y su boton juntos. Auto los muestra cuando hay una fuente de ventilador.",
        show_presets: "Forzar la fila de preajustes encendida o apagada. Auto la muestra cuando la entidad expone preset_modes.",
        show_humidity: "Forzar la linea de humedad. Auto la muestra cuando la entidad reporta current_humidity.",
        zone_rows: "En cuantas filas se acomodan las zonas. Vacio deja que fluyan con el ancho de la tarjeta.",
        action_rows: "En cuantas filas se acomodan los botones de grupo. Vacio deja que se acomoden solos.",
        show_swing_h: "Forzar el chip de oscilacion horizontal. Auto lo muestra cuando se resuelve un eje horizontal.",
        show_steppers: "Forzar los botones mas y menos. Auto los muestra en un dial de un solo punto y los oculta en heat_cool, donde dos puntos harian ambiguo un mas solitario.",
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

  /* ---------------------------------------------------------------------------
     The mode sheet, shared. Both cards present the same object, so they cannot
     have two copies of its stylesheet that drift: the group card was growing a
     second, plainer sheet with the same job.
     ------------------------------------------------------------------------- */
  const POPUP_CSS = `
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
  border:1px solid var(--divider-color, rgba(234,235,238,.12)); border-radius:16px; padding:14px;
  -webkit-backdrop-filter:blur(18px) saturate(120%); backdrop-filter:blur(18px) saturate(120%);
  box-shadow:0 24px 60px rgba(0,0,0,.6), inset 0 1px 1px rgba(255,255,255,.05);
  display:grid; grid-template-columns:repeat(3,1fr); gap:8px;
  transform:scale(.92); transition:transform .18s ease;
  font-family:var(--ct-font);
}
.ct-pop.open .ct-sheet{ transform:scale(1); }
.ct-sheet button{
  min-width:74px; padding:9px 10px; cursor:pointer;
  background:var(--secondary-background-color, rgba(30,40,52,.55)); color:var(--secondary-text-color, #9aa8b6);
  border:1px solid var(--divider-color, rgba(234,235,238,.14)); border-radius:12px;
  font:inherit; font-size:13px; letter-spacing:1.4px; text-transform:uppercase; transition:.15s;
}
.ct-sheet button:hover{ border-color:color-mix(in srgb, var(--ct-lit, var(--ct-accent)) 45%, transparent); color:var(--primary-text-color, #c6d3df); }
/* The lit mode button wears its OWN mode color (--ct-lit, set per button in
   _buildPop) and falls back to the UI accent for any button without one, so the
   popup belongs to the same instrument as the arc instead of going one flat blue. */
.ct-sheet button.active{
  background:color-mix(in srgb, var(--ct-lit, var(--ct-accent)) 16%, transparent); color:var(--primary-text-color, rgba(234,235,238,.98));
  border:1.5px solid var(--ct-lit, var(--ct-accent));
  box-shadow:0 0 14px color-mix(in srgb, var(--ct-lit, var(--ct-accent)) 40%, transparent),
    inset 0 0 12px color-mix(in srgb, var(--ct-lit, var(--ct-accent)) 14%, transparent);
}
/* Close button: pinned to the sheet corner, never a grid cell. The extra top
   padding is the band it sits in, so it never covers the first row of modes. */
.ct-sheet{ position:relative; padding-top:38px; }
.ct-sheet button.ct-popclose{
  position:absolute; top:10px; right:10px;
  min-width:0; width:36px; height:36px; padding:0;
  display:grid; place-items:center; border-radius:50%;
  background:var(--secondary-background-color, rgba(30,40,52,.55));
  color:var(--secondary-text-color, #9aa8b6);
  border:1px solid var(--divider-color, rgba(234,235,238,.14));
}
.ct-sheet button.ct-popclose:hover{ color:var(--primary-text-color, #c6d3df); }
.ct-popclose svg{ width:18px; height:18px; display:block; }

/* Respect the OS "reduce motion" setting: kill the clover spin, the popup scale-in
   and every hover/press transition. A wall tablet left running should not animate
   for someone who asked the platform not to. */
@media (prefers-reduced-motion: reduce){
  .ct-clover g, .ct-pop, .ct-sheet, .ct-sheet button, .ct-hit, .ct-pressdisc{
    animation:none !important; transition:none !important;
  }
  .ct-pop.open .ct-sheet{ transform:none; }
  .ct-sheet{ transform:none; }
}
@media (max-width:480px){ .ct-sheet button{ min-width:88px; padding:14px 8px; font-size:13px; } }

/* PRESET ROW: full-width strip between the modes and the feature chips. Pill
   shaped so it never reads as another mode button, and it wraps on a phone. */
.ct-presets{
  grid-column:1 / -1;
  display:flex; flex-wrap:wrap; gap:10px; justify-content:center;
  margin-top:6px; padding-top:16px;
  border-top:1px solid rgba(234,235,238,.12);
}
.ct-sheet button.ct-preset{
  min-width:0; padding:7px 13px; border-radius:999px;
  font-size:12px; letter-spacing:1.2px; line-height:1;
  background:var(--secondary-background-color, rgba(30,40,52,.45));
  color:var(--secondary-text-color, #8a98a6);
  border:1px solid var(--divider-color, rgba(234,235,238,.14));
}
.ct-sheet button.ct-preset:hover{ border-color:color-mix(in srgb, var(--ct-accent) 45%, transparent); color:var(--primary-text-color, #c6d3df); }
/* Lit state on this sheet wears the MODE's ink, not the fixed UI accent. The face
   already does: a lit rail cell and the popup toggle are the same feature on two
   surfaces, so with the accent pinned to cyan a DRY card showed a teal dial above a
   cyan sheet. --ct-mode-ink is published per paint on .ct-card, and falls back to
   the accent for the one state that does not paint the face. */
.ct-sheet button.ct-preset.active{
  color:var(--ct-mode-ink, var(--ct-accent));
  background:color-mix(in srgb, var(--ct-mode-ink, var(--ct-accent)) 16%, transparent);
  border:1.5px solid var(--ct-mode-ink, var(--ct-accent));
  box-shadow:0 0 14px color-mix(in srgb, var(--ct-mode-ink, var(--ct-accent)) 34%, transparent);
}

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
  min-width:64px; padding:7px 10px;
  display:flex; flex-direction:column; align-items:center; gap:4px;
  background:var(--secondary-background-color, rgba(30,40,52,.45)); color:var(--secondary-text-color, #8a98a6);
  border:1px solid var(--divider-color, rgba(234,235,238,.14)); border-radius:12px;
  font-size:12px; letter-spacing:1.5px; line-height:1; transition:.15s;
}
.ct-sheet button.ct-toggle:hover{ border-color:color-mix(in srgb, var(--ct-accent) 45%, transparent); color:var(--primary-text-color, #c6d3df); }
.ct-sheet button.ct-toggle.on{
  color:var(--ct-mode-ink, var(--ct-accent));
  background:color-mix(in srgb, var(--ct-mode-ink, var(--ct-accent)) 16%, transparent);
  border:1.5px solid var(--ct-mode-ink, var(--ct-accent));
  box-shadow:0 0 14px color-mix(in srgb, var(--ct-mode-ink, var(--ct-accent)) 40%, transparent),
    inset 0 0 12px color-mix(in srgb, var(--ct-mode-ink, var(--ct-accent)) 14%, transparent);
}
.ct-sheet button.ct-toggle.disabled{ opacity:.4; cursor:default; }
.ct-toggle .ct-tg-ic{ width:24px; height:24px; display:block; }
/* ha-icon paints in currentColor, so the .on accent lights a user chip like the inline-SVG ones. */
.ct-sheet button.ct-toggle ha-icon.ct-tg-ic{ --mdc-icon-size:24px; color:inherit; }
.ct-toggle .ct-tg-lb{ display:block; }
@media (max-width:480px){ .ct-sheet button.ct-toggle{ min-width:72px; padding:9px 8px; } }
/* The group sheet names the room it belongs to. The dial has one entity and
   needs no title, so this row simply never appears there. */
.ct-sheet .ct-poptitle{
  grid-column:1 / -1; text-align:center; margin:-4px 0 2px;
  font-size:19px; letter-spacing:1.2px; font-weight:600;
  color:var(--secondary-text-color, rgba(236,239,247,.62));
}
`;

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
  // ==========================================================================
  // DIAL FACE GEOMETRY
  // ==========================================================================
  // Pasted verbatim from the design handoff's dial-face.js and wrapped in an IIFE.
  // It is the source of truth for every shape on the face: where the card and this
  // module disagree, the module is right. It keeps its own CX / arcPath / clamp,
  // which is why it is scoped rather than merged, since the card already has its
  // own polar() with the same convention but a different signature.
  // Do not re-derive the geometry here. Change it in the handoff and re-paste.
  const FACE = (function () {
  /* Dial face geometry for climate-cluster-card.
     Pure functions, no dependencies, no build step. Every function returns an SVG
     string ready to drop into the card's template. Import or paste wholesale.

     Coordinate system: viewBox 600 x 392, centre (300, 284). Zero degrees is twelve
     o'clock and angles increase clockwise. The arc starts at 250 and spans 220. */

  var CX = 300, CY = 284, RT = 200, RF = 226, A0 = 250, SPAN = 220;

  function P(r, a, cx, cy) {
    var t = (a - 90) * Math.PI / 180;
    return [(cx === undefined ? CX : cx) + r * Math.cos(t),
            (cy === undefined ? CY : cy) + r * Math.sin(t)];
  }
  function f(n) { return Math.round(n * 10) / 10; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function arcPath(r, a0, a1, cx, cy) {
    if (a1 <= a0 + 0.01) a1 = a0 + 0.01;
    var p = P(r, a0, cx, cy), q = P(r, a1, cx, cy);
    return 'M' + f(p[0]) + ' ' + f(p[1]) + 'A' + r + ' ' + r + ' 0 ' +
           ((a1 - a0) > 180 ? 1 : 0) + ' 1 ' + f(q[0]) + ' ' + f(q[1]);
  }

  /* value -> angle. min/max are the entity's min_temp / max_temp. */
  function angleOf(v, min, max) { return A0 + SPAN * (clamp(v, min, max) - min) / (max - min); }

  /* ---------------------------------------------------------------- modes ---- */

  var MODES = {
    cool:     { ink: '#5CD6FF', light: '#bfeeff', word: 'COOL',     status: 'COOLING' },
    heat:     { ink: '#F2933A', light: '#FFD3A1', word: 'HEAT',     status: 'HEATING' },
    dry:      { ink: '#FFD166', light: '#FFE8AE', word: 'DRY',      status: 'DRYING' },
    fan_only: { ink: '#9FB3C8', light: '#D5E1EC', word: 'FAN', status: 'CIRCULATING' },
    off:      { ink: '#6A7480', light: '#9AA5B1', word: 'OFF',      status: 'IDLE' },
    auto:     { ink: '#7CE0B0', light: '#C8F3E2', word: 'AUTO',     status: 'BALANCING' }
  };

  /* mode ink is used for EXACTLY five things: the mode word, the status dot and word,
     the lit rail cell, the fan ring stroke, and the COMFORT glyph. Nothing else. It
     never touches the two arc gradients, the needle, the room pin, the delta segment
     or the steppers. */

  function rgba(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* --------------------------------------------------------- the temp band ---- */
  /* Identity. Shared with the group card. Never varies by mode. */

  var DEFS =
    '<linearGradient id="dCold" x1="0" y1="1" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#2f7fb8"></stop>' +
      '<stop offset=".55" stop-color="#5CD6FF"></stop>' +
      '<stop offset="1" stop-color="#bfeeff"></stop></linearGradient>' +
    '<linearGradient id="dWarm" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#FFC98A"></stop>' +
      '<stop offset=".6" stop-color="#F2933A"></stop>' +
      '<stop offset="1" stop-color="#E8862A"></stop></linearGradient>' +
    '<filter id="dGlow" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feGaussianBlur stdDeviation="7"></feGaussianBlur></filter>' +
    '<filter id="dPinSh" x="-160%" y="-160%" width="420%" height="420%">' +
      '<feDropShadow dx="0" dy="0.7" stdDeviation="0.7" flood-color="#04080f" ' +
      'flood-opacity=".9"></feDropShadow></filter>';

  function band(setAngle) {
    return '' +
      '<path d="' + arcPath(RT, A0, A0 + SPAN) + '" fill="none" ' +
        'stroke="rgba(154,175,210,.11)" stroke-width="21" stroke-linecap="round"></path>' +
      /* glow on the COLD portion only, drawn under the gradient */
      '<path d="' + arcPath(RT, A0, setAngle) + '" fill="none" stroke="#5CD6FF" ' +
        'stroke-width="21" stroke-linecap="round" opacity=".30" filter="url(#dGlow)"></path>' +
      '<path d="' + arcPath(RT, A0, setAngle) + '" fill="none" stroke="url(#dCold)" ' +
        'stroke-width="21" stroke-linecap="round"></path>' +
      '<path d="' + arcPath(RT, setAngle, A0 + SPAN) + '" fill="none" stroke="url(#dWarm)" ' +
        'stroke-width="21" stroke-linecap="round"></path>';
  }

  /* ticks sit just inside the band and stop well clear of the numerals */
  function ticks(min, max) {
    var minor = '', major = '';
    for (var v = min; v <= max + 1e-6; v++) {
      var a = angleOf(v, min, max), isMaj = v % 5 === 0;
      var p = P(isMaj ? 181 : 188, a), q = P(195, a);
      var seg = 'M' + f(p[0]) + ' ' + f(p[1]) + 'L' + f(q[0]) + ' ' + f(q[1]);
      if (isMaj) major += seg; else minor += seg;
    }
    return '<path d="' + minor + '" fill="none" style="stroke:var(--ct-face-tick, rgba(200,215,235,.26))" ' +
             'stroke-width="1.4" stroke-linecap="round"></path>' +
           '<path d="' + major + '" fill="none" style="stroke:var(--ct-face-tick-major, rgba(200,215,235,.60))" ' +
             'stroke-width="2.2" stroke-linecap="round"></path>';
  }

  /* five numerals, one radius. No 61 / 86 end caps. */
  function scaleNumerals(min, max) {
    var out = '', step = 5;
    var first = Math.ceil((min + 3) / step) * step, last = Math.floor((max - 1) / step) * step;
    for (var v = first; v <= last; v += step) {
      var p = P(162, angleOf(v, min, max));
      out += '<text x="' + f(p[0]) + '" y="' + f(p[1]) + '" text-anchor="middle" ' +
        'dominant-baseline="central" font-size="12.5" font-weight="600" ' +
        'letter-spacing=".6" style="fill:var(--ct-face-dim, rgba(200,215,235,.52))">' + v + '</text>';
    }
    return out;
  }

  /* ------------------------------------------------------------- the needle ---- */
  /* Identity. Never changes colour with mode. No scale transform. */

  function needle(setAngle) {
    var s = P(RT, setAngle);
    return '<g transform="translate(' + f(s[0]) + ',' + f(s[1]) + ') rotate(' + f(setAngle) + ')" ' +
        'style="pointer-events:none">' +
      '<path d="M 0 20 Q 7.4 13 9.6 3.4 Q 10.9 -6 5.6 -12.6 Q 2.9 -15.3 0 -13.3 ' +
        'Q -2.9 -15.3 -5.6 -12.6 Q -10.9 -6 -9.6 3.4 Q -7.4 13 0 20 Z" ' +
        'fill="#5CD6FF" stroke="#bfeeff" stroke-width="1.2" stroke-opacity=".6" ' +
        'stroke-linejoin="round"></path>' +
      '<path d="M 0 12 Q 4 7 5 0 Q 5.4 -6 2.6 -9.6 Q 1.2 -11 0 -10 Q -1.2 -11 -2.6 -9.6 ' +
        'Q -5.4 -6 -5 0 Q -4 7 0 12 Z" fill="rgba(255,255,255,.35)"></path></g>';
  }

  /* ---------------------------------------------------- room pin and label ---- */

  function roomPin(roomAngle) {
    var s = P(RT, roomAngle);
    var outline = 'M 0 10.6 L 4.7 -1.1 L 4.7 -6.6 L -4.7 -6.6 L -4.7 -1.1 Z';
    return '<g transform="translate(' + f(s[0]) + ',' + f(s[1]) + ') rotate(' + f(roomAngle) + ')" ' +
        'filter="url(#dPinSh)" shape-rendering="geometricPrecision">' +
      '<path d="M 0 10.6 L -4.7 -1.1 L -4.7 -6.6 L 0 -6.6 Z" fill="#ffffff"></path>' +
      '<path d="M 0 10.6 L 4.7 -1.1 L 4.7 -6.6 L 0 -6.6 Z" fill="#9db0c8"></path>' +
      '<path d="M 0 9.6 L 0 -6.6" stroke="#ffffff" stroke-width="1.1" opacity=".95"></path>' +
      '<path d="' + outline + '" fill="none" stroke="rgba(4,8,14,.92)" stroke-width="0.9" ' +
        'stroke-linejoin="miter" vector-effect="non-scaling-stroke"></path></g>';
  }

  /* seated on the pin's own radial at r=173 so it stays clear at any room temperature.
     The caption backs off 3.6 on x because the value is centred as "78 degrees", so the
     digits sit left of the string centre by half the degree glyph. */
  function roomLabel(room, roomAngle) {
    var v = P(173, roomAngle);
    /* The caption sits straight below the value in SCREEN space rather than further
       along the radial. Riding the radial pulls it toward the centre of the dial, so
       anywhere off twelve o'clock the two stop reading as one stacked pair: the
       caption drifts left of the digits on the right half of the arc and right of them
       on the left half.

       The degree sign is its own tspan so the card can measure it and centre the
       caption under the DIGITS. Centring under the whole string leaves the caption
       half a degree glyph left of where the eye puts the number. */
    return '<text class="ct-roomtxt" x="' + f(v[0]) + '" y="' + f(v[1]) + '" text-anchor="middle" ' +
        'dominant-baseline="central" font-size="21" style="fill:var(--ct-face-ink, #eceff7)">' + room + '<tspan class="ct-deg">\u00b0</tspan></text>' +
      '<text class="ct-roomtxt" x="' + f(v[0]) + '" y="' + f(v[1] + 15) + '" text-anchor="middle" ' +
        'dominant-baseline="central" font-size="9.5" font-weight="600" letter-spacing="1.6" ' +
        'style="fill:var(--ct-face-sub, rgba(200,215,235,.55))">ROOM</text>';
  }

  /* ---------------------------------------------------------- delta segment ---- */
  /* r=216 sits in the 26 unit gap between the band at 200 and the fan ring at 226,
     where the fan handle floats at 229. Stays thin; the handle wins the overlap. */

  function deltaSegment(setAngle, roomAngle, delta) {
    if (Math.abs(delta) < 0.5) return '';
    var lo = Math.min(setAngle, roomAngle), hi = Math.max(setAngle, roomAngle);
    var d = P(216, setAngle);
    return '<path d="' + arcPath(216, lo, hi) + '" fill="none" style="stroke:var(--ct-face-delta, #ffffff)" ' +
        'stroke-width="4.5" stroke-linecap="round" opacity=".5"></path>' +
      '<circle cx="' + f(d[0]) + '" cy="' + f(d[1]) + '" r="3.4" opacity=".72" style="fill:var(--ct-face-delta, #ffffff)"></circle>' +
      '<text x="470" y="112" text-anchor="start" font-size="13" font-weight="600" ' +
        'letter-spacing="1.4" style="fill:var(--ct-face-ink, #eceff7)">' + (delta >= 0 ? '+' : '') + Math.round(delta) + '</text>';
  }

  /* ---------------------------------------------------------------- centre ---- */

  function modeWord(mode) {
    return '<text x="300" y="176" text-anchor="middle" font-size="25" font-weight="600" ' +
      'letter-spacing="7" style="fill:var(--ct-face-mode-text, ' + MODES[mode].ink + ')">' +
      MODES[mode].word + '</text>';
  }

  function bigNumeral(set) {
    return '<text x="300" y="272" text-anchor="middle" font-size="104" ' +
      'style="fill:var(--ct-face-hero, #f7f9fc)">' + set + '</text>';
  }

  /* the cluster centres itself as a unit so it stays on the vertical axis whatever the
     status word and the preset are */
  function statusLine(mode, action, preset) {
    var ink = MODES[mode].ink;
    var word = action || MODES[mode].status;
    var tw = word.length * 11.6;
    var pad = preset ? (preset === 'SLEEP' ? 38 : 26) : 0;
    var x0 = 300 - (tw + 21 + pad) / 2;
    return '<g style="pointer-events:none">' +
      '<circle cx="' + f(x0 + 5) + '" cy="303" r="4.5" fill="' + ink + '" ' +
        'style="animation:pulse 1.9s ease-in-out infinite"></circle>' +
      '<text x="' + f(x0 + 21) + '" y="309" font-size="16" font-weight="600" ' +
        'letter-spacing="3.4" style="fill:var(--ct-face-mode-text, ' + ink + ')">' + word + '</text>' +
      presetGlyph(preset, ink, x0 + 21 + tw + 12, 303) + '</g>';
  }

  /* --------------------------------------------------------- preset glyphs ---- */
  /* Each preset keeps its own colour so it reads the same in any mode. Only COMFORT
     borrows the mode ink, because it means the normal state of that mode. */

  function presetGlyph(name, modeInk, x, y) {
    if (!name || name === 'NONE') return '';
    var at = '<g transform="translate(' + f(x) + ',' + f(y) + ')">';
    var seq = function (d) { return 'style="animation:wink 1.9s ease-in-out ' + d + 's infinite"'; };

    if (name === 'ECO') {
      return at +
        '<path d="M -5 6 Q 8 1 5 -8 Q -8 -3 -5 6 Z" fill="#5FD69A" opacity=".95"></path>' +
        '<path d="M -4 5 L 4 -6" stroke="#0b1017" stroke-width="1.1" opacity=".5"></path></g>';
    }
    if (name === 'SLEEP') {
      var z = [[-15, 6, 9, 0], [-7, 1, 12.5, 0.34], [3, -6, 16.5, 0.68]], out = at;
      for (var i = 0; i < 3; i++) {
        out += '<text x="' + z[i][0] + '" y="' + z[i][1] + '" font-size="' + z[i][2] + '" ' +
          'font-weight="700" fill="#B388FF" ' + seq(z[i][3]) + '>z</text>';
      }
      return out + '</g>';
    }
    if (name === 'BOOST') {
      var dy = [9, 3, -3], del = [0, 0.26, 0.52], o = at;
      for (var k = 0; k < 3; k++) {
        o += '<path d="M -6 ' + dy[k] + ' L 0 ' + (dy[k] - 6) + ' L 6 ' + dy[k] + '" ' +
          'fill="none" stroke="#FF8A3D" stroke-width="2.2" stroke-linecap="round" ' +
          'stroke-linejoin="round" ' + seq(del[k]) + '></path>';
      }
      return o + '</g>';
    }
    if (name === 'COMFORT') {
      return at +
        '<circle cx="0" cy="-1" r="6" fill="none" stroke="' + modeInk + '" stroke-width="1.8"></circle>' +
        '<circle cx="0" cy="-1" r="2.2" fill="' + modeInk + '"></circle></g>';
    }
    /* preset names are arbitrary strings outside the standard set */
    return at + '<text x="0" y="4" text-anchor="middle" font-size="12" font-weight="700" ' +
      'fill="' + modeInk + '">' + String(name).charAt(0) + '</text></g>';
  }

  /* -------------------------------------------------------------- steppers ---- */
  /* Cyan. Nothing on this card is green. */

  function steppers() {
    var c = 'fill="rgba(154,175,210,.10)" stroke="rgba(92,214,255,.5)" stroke-width="1.6"';
    var g = 'style="stroke:var(--ct-face-ink, #eceff7)" stroke-width="2.6" stroke-linecap="round"';
    return '<g data-act="down" style="cursor:pointer">' +
        '<circle cx="186" cy="250" r="27" ' + c + '></circle>' +
        '<path d="M 172 250 H 200" ' + g + '></path></g>' +
      '<g data-act="up" style="cursor:pointer">' +
        '<circle cx="414" cy="250" r="27" ' + c + '></circle>' +
        '<path d="M 400 250 H 428 M 414 236 V 264" ' + g + '></path></g>';
  }

  /* ------------------------------------------------------------ the rail ---- */
  /* cells is [{ value, caption, lit, widest }]. `widest` is the widest string the cell
     can EVER show, not the current one, or the row reflows on every state change. */

  function rail(cells, mode, y) {
    y = y || 321;
    var ink = MODES[mode].ink, light = MODES[mode].light;
    var w = 46;
    cells.forEach(function (c) {
      var widest = c.widest || c.value;
      w = Math.max(w, widest.length * 9.4 + 11, c.caption.length * 6.1 + 11);
    });
    w = Math.round(w);
    var gap = 6, x0 = 300 - (cells.length * w + (cells.length - 1) * gap) / 2, out = '';
    cells.forEach(function (c, i) {
      var x = Math.round(x0 + i * (w + gap)), tx = x + w / 2;
      var fill = c.lit ? rgba(ink, .14) : 'rgba(154,175,210,.09)';
      var stroke = c.lit ? ink : 'rgba(154,175,210,.20)';
      var tint = c.lit ? 'var(--ct-face-lit, ' + light + ')' : 'var(--ct-face-ink, #eceff7)';
      out += '<g data-cell="' + i + '" style="cursor:pointer">' +
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="27" rx="8" ' +
          'fill="' + fill + '" stroke="' + stroke + '"></rect>' +
        '<text x="' + f(tx) + '" y="' + (y + 14) + '" text-anchor="middle" font-size="14" ' +
          'font-weight="600" letter-spacing="1.1" style="fill:' + tint + '">' + c.value + '</text>' +
        '<text x="' + f(tx) + '" y="' + (y + 23.5) + '" text-anchor="middle" font-size="8" ' +
          'font-weight="600" letter-spacing="1.5" style="fill:var(--ct-face-sub, rgba(200,215,235,.55))">' +
          c.caption + '</text></g>';
    });
    return out;
  }

  /* --------------------------------------------------------- fan ring ---- */
  /* fanPct is 1..100, or null for AUTO. AUTO is the absence of a value.
     Every style lives in a 12 unit envelope, r220 to r232. It never crosses the temp
     band, never leaves the viewBox, and never runs past the arc ends. */

  function fanPeriod(fanPct) {
    return fanPct == null ? 3.4 : Math.max(0.85, 3.4 - (fanPct / 100) * 2.5);
  }
  function fanAngle(fanPct) {
    return fanPct == null ? A0 + SPAN : A0 + SPAN * (fanPct / 100);
  }

  function fanTrack() {
    return '<path d="' + arcPath(RF, A0, A0 + SPAN) + '" fill="none" ' +
      'stroke="rgba(154,175,210,.10)" stroke-width="7" stroke-linecap="round"></path>';
  }

  /* the handle is drawn ONLY when a speed is set. AUTO has no handle. */
  function fanHandle(fanPct) {
    if (fanPct == null) return '';
    var a = fanAngle(fanPct), h = P(RF + 3, a);
    return '<g transform="translate(' + f(h[0]) + ',' + f(h[1]) + ') rotate(' + f(a) + ')">' +
      '<path d="M 0 11.5 L 10.2 -4.25 L 5.95 -7.9 L 0 3.6 L -5.95 -7.9 L -10.2 -4.25 Z" ' +
        'fill="rgba(79,195,247,.34)" stroke="#4fc3f7" stroke-width="1.8" ' +
        'stroke-linejoin="round"></path>' +
      '<path d="M 0 7.5 L 4.6 -2.9 L -4.6 -2.9 Z" fill="rgba(207,244,255,.40)"></path></g>';
  }

  /* style 0: original. What the released card actually draws: one smooth gradient
     arc, no dashes and no motion. The handoff's dash style adds travelling dashes,
     which has never shipped, so it cannot be offered as the unchanged option. */
  function fanPlain(fanPct, mode, noHandle) {
    var end = fanAngle(fanPct), out = fanTrack();
    out += '<path d="' + arcPath(RF, A0, end) + '" fill="none" stroke="url(#aFanGrad)" ' +
      'stroke-width="7" stroke-linecap="round"' +
      (fanPct == null ? ' opacity=".45"' : '') + '></path>';
    return out + fanHandle(noHandle ? null : fanPct);
  }

  /* style 1: dash, what ships today */
  function fanDash(fanPct, mode, noHandle) {
    var ink = MODES[mode].ink, end = fanAngle(fanPct), out = fanTrack();
    if (fanPct == null) {
      out += '<path d="' + arcPath(RF, A0, A0 + SPAN) + '" fill="none" stroke="' + rgba(ink, .26) +
        '" stroke-width="5" stroke-linecap="round" stroke-dasharray="3 11" ' +
        'style="animation:creep 2.4s linear infinite"></path>';
    } else {
      var dur = Math.min(3.2, Math.max(0.55, 70 / fanPct));
      out += '<path d="' + arcPath(RF, A0, end) + '" fill="none" stroke="' + rgba(ink, .55) +
          '" stroke-width="7" stroke-linecap="round"></path>' +
        '<path d="' + arcPath(RF, A0, end) + '" fill="none" stroke="' + MODES[mode].light +
          '" stroke-width="7" stroke-linecap="butt" stroke-dasharray="3 11" opacity=".55" ' +
          'style="animation:creep ' + dur.toFixed(2) + 's linear infinite"></path>';
    }
    return out + fanHandle(noHandle ? null : fanPct);
  }

  /* a sine wrapped around the ring, sampled every 4 degrees */
  function wavyArc(r, a0, a1, amp, waveDeg, phase) {
    if (a1 <= a0 + 0.5) return '';
    var d = '';
    for (var a = a0; a <= a1 + 1e-6; a += 4) {
      var rr = r + amp * Math.sin((a - a0) / waveDeg * Math.PI * 2 + (phase || 0));
      var p = P(rr, a);
      d += (d ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1]);
    }
    return d;
  }

  /* style 2: breeze. Four wave ribbons. Every dash cycle divides 120 evenly (40, 60,
     30, 24) so @keyframes drift loops seamlessly. */
  var BREEZE = [
    { r: RF - 6, amp: 2.4, wave: 26, dash: '24 16', w: 1.8, lit: .34, dim: .15, k: 1.22 },
    { r: RF,     amp: 3.4, wave: 34, dash: '34 26', w: 2.8, lit: .58, dim: .24, k: 1.00 },
    { r: RF,     amp: 1.8, wave: 19, dash: '18 12', w: 1.4, lit: .40, dim: .17, k: 0.78 },
    { r: RF + 6, amp: 2.8, wave: 22, dash: '14 10', w: 1.5, lit: .26, dim: .13, k: 1.45 }
  ];

  function fanBreeze(fanPct, mode, noHandle) {
    var set = fanPct != null, end = fanAngle(fanPct), base = fanPeriod(fanPct);
    var stroke = set ? MODES[mode].light : rgba(MODES[mode].ink, .9);
    var out = fanTrack();
    BREEZE.forEach(function (v) {
      out += '<path d="' + wavyArc(v.r, A0, end, v.amp, v.wave) + '" fill="none" ' +
        'stroke="' + stroke + '" stroke-width="' + v.w + '" stroke-linecap="round" ' +
        'stroke-dasharray="' + v.dash + '" opacity="' + (set ? v.lit : v.dim) + '" ' +
        'style="animation:drift ' + (base * v.k).toFixed(2) + 's linear infinite"></path>';
    });
    return out + fanHandle(noHandle ? null : fanPct);
  }

  /* style 3: silk. Short tapered puffs that TRAVEL. One band is not one ribbon across
     the whole arc: it is a run of segments on a repeating pitch. */
  var SILK = [
    { r: RF,     amp: 3.2, wave: 130, thick: 8, seg: 22, pitch: 34, lit: .85, dim: .34, blur: true,  k: 1.00 },
    { r: RF + 2, amp: 2.4, wave: 96,  thick: 5, seg: 15, pitch: 26, lit: .55, dim: .22, blur: true,  k: 1.46 },
    { r: RF - 4, amp: 4,   wave: 160, thick: 3, seg: 28, pitch: 44, lit: .45, dim: .18, blur: false, k: 0.74 }
  ];
  var SILK_VAR = [1, 0.66, 1.28, 0.84, 1.12, 0.74];

  /* Fixed sample count so every animation frame has an IDENTICAL point count. Path
     animation only interpolates smoothly when the shapes match. Samples outside the
     visible window collapse onto the boundary, which cuts a puff flat at the arc end
     instead of shrinking it; a puff entirely outside becomes a zero area path. */
  function ribbonSeg(r, t0, t1, v0, v1, amp, waveDeg, thick, phase) {
    var N = 16, span = t1 - t0, out = [], back = [], i, u, a, w, c, ca;
    for (i = 0; i <= N; i++) {
      u = i / N; a = t0 + span * u;
      w = thick * Math.sin(Math.PI * u);
      c = r + amp * Math.sin(span * u / waveDeg * Math.PI * 2 + phase);
      ca = a < v0 ? v0 : a > v1 ? v1 : a;
      out.push(P(c + w / 2, ca));
      back.push(P(c - w / 2, ca));
    }
    var d = 'M' + f(out[0][0]) + ' ' + f(out[0][1]);
    for (i = 1; i <= N; i++) d += 'L' + f(out[i][0]) + ' ' + f(out[i][1]);
    for (i = N; i >= 0; i--) d += 'L' + f(back[i][0]) + ' ' + f(back[i][1]);
    return d + 'Z';
  }

  /* over one cycle a segment advances exactly one pitch, so when it lands on the next
     slot the loop is seamless, and the wave travels through it as it goes */
  function segFrames(band, slot, seg, v0, v1) {
    var frames = [], steps = 6, i, t0;
    for (i = 0; i < steps; i++) {
      t0 = slot + (i / steps) * band.pitch;
      frames.push(ribbonSeg(band.r, t0, t0 + seg, v0, v1, band.amp, band.wave,
                            band.thick, -i * 2 * Math.PI / steps));
    }
    frames.push(ribbonSeg(band.r, slot + band.pitch, slot + band.pitch + seg,
                          v0, v1, band.amp, band.wave, band.thick, 0));
    return frames;
  }

  function fanSilk(fanPct, mode, noHandle) {
    var set = fanPct != null, end = fanAngle(fanPct), base = fanPeriod(fanPct);
    var out = '<path d="' + arcPath(RF, A0, A0 + SPAN) + '" fill="none" ' +
      'stroke="rgba(154,175,210,.07)" stroke-width="6" stroke-linecap="round"></path>';
    SILK.forEach(function (v, bi) {
      var n = 0, dur = (base * v.k * 1.6).toFixed(2);
      /* start a pitch early and finish a pitch late so puffs enter and leave */
      for (var slot = A0 - v.pitch; slot < end + v.pitch; slot += v.pitch, n++) {
        var seg = v.seg * SILK_VAR[(n + bi) % SILK_VAR.length];
        var frames = segFrames(v, slot, seg, A0, end);
        out += '<path d="' + frames[0] + '" fill="url(#bSilk)" ' +
          'opacity="' + (set ? v.lit : v.dim) + '"' +
          (v.blur ? ' filter="url(#bSoft)"' : '') + '>' +
          '<animate attributeName="d" values="' + frames.join(';') + '" dur="' + dur + 's" ' +
          'calcMode="linear" repeatCount="indefinite"></animate></path>';
      }
    });
    return out + fanHandle(noHandle ? null : fanPct);
  }

  var SILK_DEFS =
    '<linearGradient id="bSilk" x1="0" y1="1" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#5CD6FF" stop-opacity="0"></stop>' +
      '<stop offset=".32" stop-color="#dff4ff" stop-opacity=".9"></stop>' +
      '<stop offset=".62" stop-color="#8FC7FF" stop-opacity=".6"></stop>' +
      '<stop offset="1" stop-color="#5CD6FF" stop-opacity="0"></stop></linearGradient>' +
    '<filter id="bSoft" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feGaussianBlur stdDeviation="1.7"></feGaussianBlur></filter>';

  // `dash` is kept as an alias so a config written against the branch keeps working,
  // but it is not offered in the editor and it is not the default.
  var FAN_STYLES = { original: fanPlain, dash: fanPlain, breeze: fanBreeze, silk: fanSilk };
  var FAN_DASH_UNUSED = fanDash;   // the handoff's dashed ring, retained, never selected

  var KEYFRAMES =
    '@keyframes pulse { 0%, 100% { opacity: .3 } 50% { opacity: 1 } }' +
    '@keyframes creep { to { stroke-dashoffset: -28 } }' +
    '@keyframes drift { to { stroke-dashoffset: -120 } }' +
    '@keyframes wink { 0%, 100% { opacity: .10 } 18%, 44% { opacity: 1 } }';

  /* ------------------------------------------------------------ whole face ---- */
  /* s = { mode, action, set, room, min, max, fanPct, preset, fanStyle, cells } */

  function face(s) {
    var min = s.min == null ? 61 : s.min, max = s.max == null ? 86 : s.max;
    var setA = angleOf(s.set, min, max), roomA = angleOf(s.room, min, max);
    var style = FAN_STYLES[s.fanStyle || 'dash'];
    return '' +
      '<defs>' + DEFS + SILK_DEFS + '</defs>' +
      style(s.fanPct, s.mode) +
      band(setA) +
      deltaSegment(setA, roomA, s.room - s.set) +
      ticks(min, max) +
      scaleNumerals(min, max) +
      roomPin(roomA) +
      roomLabel(s.room, roomA) +
      needle(setA) +
      modeWord(s.mode) +
      bigNumeral(s.set) +
      statusLine(s.mode, s.action, s.preset) +
      steppers() +
      rail(s.cells || [], s.mode);
  }

    return { face: face, FAN_STYLES: FAN_STYLES, MODES: MODES, KEYFRAMES: KEYFRAMES, DEFS: DEFS, SILK_DEFS: SILK_DEFS, band: band, ticks: ticks, scaleNumerals: scaleNumerals, needle: needle, roomPin: roomPin, roomLabel: roomLabel, deltaSegment: deltaSegment, modeWord: modeWord, bigNumeral: bigNumeral, statusLine: statusLine, presetGlyph: presetGlyph, steppers: steppers, rail: rail, fanPlain: fanPlain, fanDash: fanDash, fanBreeze: fanBreeze, fanSilk: fanSilk, angleOf: angleOf, arcPath: arcPath, P: P };
  })();

  /* Everything the original face paints that the handoff face repaints itself.
     One list, used by both _hideLegacyFace and _showLegacyFace, so the two cannot
     drift apart and strand a node switched off with nothing drawing over it. */
  const LEGACY_FACE_NODES = ["coldHalo", "warmHalo", "coldFill", "warmFill", "track",
    "fanTrack", "fanFill", "ticks", "curMarker", "tempNeedle", "tempNeedleLo",
    "fanHandle", "modeGlyph", "labelTop", "nowCap", "bigNum", "caret",
    "clover", "fanPct", "fanName", "swingChip", "swingHChip", "swingCap",
    "swingHCap", "hints"];

  /* ---------------------------------------------------------------------------
     ZONE: handoff_zone_card/zone-card.js, pasted whole and wrapped so its own P,
     f, clamp, arcPath, A0 and SPAN cannot collide with the ones this file already
     has under different signatures. Same treatment the dial face gets, and for the
     same reason: the module is the geometry, the card is the wiring.

     Every deviation from the handoff is marked CARD ADDITION in place, and each one
     is a state a real house produces that the module threw on rather than drew.
     ------------------------------------------------------------------------- */
  const ZONE = (function () {
  /* Zone card geometry and markup for climate-cluster-group-card, direction B,
     "one shared scale, hero kept".

     Pure functions, no dependencies, no build step. Every function returns a string
     ready to drop into the card. The hero is SVG; the tiles, footer and sheet are HTML.

     Hero coordinate system: viewBox "44 71 256 206", centre (168, 208), arc radius 104,
     band stroke 13. Zero degrees is twelve o'clock, angles increase clockwise, the arc
     starts at 250 and spans 220. The viewBox is centred on the ARC, not on the drawing,
     which is what lets a tile stand exactly as tall as the arc. Do not re-centre it. */

  var HX = 168, HY = 208, HR = 104, HW = 13, A0 = 250, SPAN = 220;

  function P(r, a, cx, cy) {
    var t = (a - 90) * Math.PI / 180;
    return [(cx === undefined ? HX : cx) + r * Math.cos(t),
            (cy === undefined ? HY : cy) + r * Math.sin(t)];
  }
  function f(n) { return Math.round(n * 10) / 10; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function arcPath(r, a0, a1) {
    if (a1 <= a0 + 0.01) a1 = a0 + 0.01;
    var p = P(r, a0), q = P(r, a1);
    return 'M' + f(p[0]) + ' ' + f(p[1]) + 'A' + r + ' ' + r + ' 0 ' +
           ((a1 - a0) > 180 ? 1 : 0) + ' 1 ' + f(q[0]) + ' ' + f(q[1]);
  }
  function angleOf(v, min, max) { return A0 + SPAN * (clamp(v, min, max) - min) / (max - min); }

  /* ------------------------------------------------------------------ modes ---- */
  /* Same table as the single dial. Mode ink is used for the tile dot, the tile tint,
     the tile action word and the COMFORT glyph. Nothing else. */

  var MODES = {
    cool:     { ink: '#5CD6FF', light: '#bfeeff', word: 'COOL',     status: 'COOLING' },
    heat:     { ink: '#F2933A', light: '#FFD3A1', word: 'HEAT',     status: 'HEATING' },
    dry:      { ink: '#2fe0c4', light: 'rgb(161,241,228)', word: 'DRY', status: 'DRYING' },
    fan_only: { ink: '#9FB3C8', light: '#D5E1EC', word: 'FAN ONLY', status: 'CIRCULATING' },
    off:      { ink: '#6A7480', light: '#9AA5B1', word: 'OFF',      status: 'IDLE' },
    auto:     { ink: 'rgb(255,220,90)', light: 'rgb(255,239,181)', word: 'AUTO', status: 'BALANCING' },
    /* CARD ADDITIONS. Three rows the module has none for, and every one is a state a
       real house produces. MODES[z.mode] is dereferenced unguarded, so a missing row
       is not a degraded tile, it is the whole card gone. heat_cool shares AUTO's ink
       because it is the same intent with a different word; unavailable and unknown
       wear the off grey. DRY and AUTO also take the colours THIS CARD has always
       drawn: the module's mint auto is green, which its own rules forbid, and its
       amber dry became indistinguishable from that once auto was corrected. */
    heat_cool:   { ink: 'rgb(255,220,90)', light: 'rgb(255,239,181)', word: 'HEAT COOL', status: 'BALANCING' },
    unavailable: { ink: '#6A7480', light: '#9AA5B1', word: 'OFFLINE', status: 'OFFLINE' },
    unknown:     { ink: '#6A7480', light: '#9AA5B1', word: 'UNKNOWN', status: 'OFFLINE' }
  };
  var MODE_ORDER = ['off', 'auto', 'cool', 'heat', 'dry', 'fan_only'];

  /* presets carry their own colour so they read the same in any mode. Only COMFORT
     borrows the mode ink. PREMAP is the setpoint each preset implies; in the card call
     climate.set_preset_mode and let the device report its own setpoint back. */
  var PRESETS = ['NONE', 'COMFORT', 'ECO', 'BOOST', 'SLEEP'];
  var PREMAP = { COMFORT: 74, BOOST: 72, SLEEP: 76, ECO: 78 };

  function rgba(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* --------------------------------------------------------------- derive ---- */
  /* A zone is { name, room, set, mode, preset, fan, swing, led, sound }.
     Everything the card shows is computed from the zone list. Nothing is a literal:
     an earlier build hardcoded "5 ON" and a 76.4 room average, and both went stale. */

  function derive(s) {
    var zones = s.zones, live = [], on = 0, cooling = 0, i, z;
    /* CARD ADDITION: a zone that is not reporting is not a reading. The module pooled
       every non-off zone, so one unavailable AC put undefined into the room list, and
       Math.min returned NaN, and rooms.indexOf(NaN) returned -1, and pool[-1].name
       threw. An offline room cannot set the house's coldest end any more than an off
       one can. */
    var real = zones.filter(function (x) { return !x.dead && x.room != null && x.set != null; });
    for (i = 0; i < real.length; i++) {
      z = real[i];
      if (z.mode !== 'off') { on++; live.push(z); if (z.room > z.set) cooling++; }
    }
    var pool = live.length ? live : real;
    /* every zone offline is a real state and it has to render, so hand the rest of the
       card a coherent zero rather than a NaN. */
    if (!pool.length) {
      var base = s.min == null ? 61 : s.min;
      var fb = { name: '', room: base, set: base };
      return { on: 0, cooling: 0, roomMin: base, roomMax: base, roomAvg: base,
        target: s.target == null ? base : s.target, coldestSet: base,
        warmest: fb, coldestRoom: fb, lo: base - 1, hi: base + 1, spread: 0,
        min: base, max: s.max == null ? 86 : s.max };
    }
    var rooms = pool.map(function (x) { return x.room; });
    var roomMin = Math.min.apply(null, rooms), roomMax = Math.max.apply(null, rooms);
    var warmest = pool[rooms.indexOf(roomMax)], coldestRoom = pool[rooms.indexOf(roomMin)];
    var sum = 0;
    for (i = 0; i < pool.length; i++) sum += pool[i].room;
    /* whole degrees everywhere. A tenth is below what these units report reliably and it
       makes the pin read as a more precise instrument than it is. */
    var roomAvg = Math.round(sum / pool.length);
    var coldestSet = Math.min.apply(null, real.map(function (x) { return x.set; }));
    /* the hero is the house TARGET, not an average: an average is the one number in the
       house nobody set and no room is at. It defaults to the coldest zone setpoint, it
       is draggable, and it is what Sync all writes. */
    var target = s.target == null ? coldestSet : s.target;

    /* one shared window for every strip, derived from the data so dot position is
       absolute across tiles and bar length is deviation */
    var lo = Infinity, hi = -Infinity;
    for (i = 0; i < real.length; i++) {
      lo = Math.min(lo, real[i].room, real[i].set);
      hi = Math.max(hi, real[i].room, real[i].set);
    }
    lo = Math.floor(Math.min(lo, target) - 1);
    hi = Math.ceil(Math.max(hi, target) + 1);

    return { on: on, cooling: cooling, roomMin: roomMin, roomMax: roomMax,
      roomAvg: roomAvg, target: target, coldestSet: coldestSet,
      warmest: warmest, coldestRoom: coldestRoom, lo: lo, hi: hi,
      spread: roomMax - roomMin,
      min: s.min == null ? 61 : s.min, max: s.max == null ? 86 : s.max };
  }

  /* ----------------------------------------------------------------- hero ---- */

  var HERO_DEFS =
    '<linearGradient id="mCold" x1="0" y1="1" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#2aa7d6"></stop>' +
      '<stop offset="1" stop-color="#7fe4ff"></stop></linearGradient>' +
    '<linearGradient id="mWarm" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#FFC98A"></stop>' +
      '<stop offset="1" stop-color="#F2933A"></stop></linearGradient>' +
    '<filter id="mGlow" x="-60%" y="-60%" width="220%" height="220%">' +
      '<feGaussianBlur stdDeviation="5"></feGaussianBlur></filter>' +
    '<filter id="mPinSh" x="-160%" y="-160%" width="420%" height="420%">' +
      '<feDropShadow dx="0" dy="0.7" stdDeviation="0.7" flood-color="#04080f" ' +
      'flood-opacity=".9"></feDropShadow></filter>';

  /* the arc's outer height as a share of the hero viewBox. The tile row uses this as
     its height with align-self:center, so a tile is exactly as tall as the arc rather
     than as tall as the drawing that contains it. Derived, so changing HR or HW moves
     the tiles with it. */
  function arcRatio() {
    var half = HW / 2 + 4;
    var top = HY - HR - half;
    var bottom = HY + HR * Math.sin(160 * Math.PI / 180) + half;
    return ((bottom - top) / 206 * 100).toFixed(2) + '%';
  }

  function heroTicks(min, max) {
    var minor = '', major = '', v, a, len, p, q, seg;
    for (v = min; v <= max + 1e-6; v++) {
      a = angleOf(v, min, max);
      len = v % 5 === 0 ? 7 : 3.5;
      p = P(HR - 11 - len, a); q = P(93, a);
      seg = 'M' + f(p[0]) + ' ' + f(p[1]) + 'L' + f(q[0]) + ' ' + f(q[1]);
      if (v % 5 === 0) major += seg; else minor += seg;
    }
    return '<path d="' + minor + '" fill="none" stroke="rgba(154,165,177,.45)" ' +
             'stroke-width="1.2" stroke-linecap="round"></path>' +
           '<path d="' + major + '" fill="none" stroke="#9aa5b1" ' +
             'stroke-width="2" stroke-linecap="round"></path>';
  }

  /* identity needle, same silhouette and colours as the single dial, scaled to the
     hero's smaller band. Never varies by mode. */
  function heroNeedle(a) {
    var s = P(HR, a);
    return '<g transform="translate(' + f(s[0]) + ',' + f(s[1]) + ') rotate(' + f(a) + ') scale(0.62)">' +
      '<path d="M 0 20 Q 7.4 13 9.6 3.4 Q 10.9 -6 5.6 -12.6 Q 2.9 -15.3 0 -13.3 ' +
        'Q -2.9 -15.3 -5.6 -12.6 Q -10.9 -6 -9.6 3.4 Q -7.4 13 0 20 Z" fill="#5CD6FF" ' +
        'stroke="#bfeeff" stroke-width="1.2" stroke-opacity=".6" stroke-linejoin="round"></path>' +
      '<path d="M 0 12 Q 4 7 5 0 Q 5.4 -6 2.6 -9.6 Q 1.2 -11 0 -10 Q -1.2 -11 -2.6 -9.6 ' +
        'Q -5.4 -6 -5 0 Q -4 7 0 12 Z" fill="rgba(255,255,255,.35)"></path></g>';
  }

  /* the average room temperature, as a faceted pin on the scale plus its own reading.
     The caption says AVG ROOM, not ROOM: without it the value reads as a second target. */
  function heroPin(roomAvg, a) {
    var s = P(HR, a), v = P(86, a);
    var outline = 'M 0 10.6 L 4.7 -1.1 L 4.7 -6.6 L -4.7 -6.6 L -4.7 -1.1 Z';
    return '<g transform="translate(' + f(s[0]) + ',' + f(s[1]) + ') rotate(' + f(a) + ') scale(0.62)" ' +
        'filter="url(#mPinSh)" shape-rendering="geometricPrecision">' +
      '<path d="M 0 10.6 L -4.7 -1.1 L -4.7 -6.6 L 0 -6.6 Z" fill="#ffffff"></path>' +
      '<path d="M 0 10.6 L 4.7 -1.1 L 4.7 -6.6 L 0 -6.6 Z" fill="#9db0c8"></path>' +
      '<path d="' + outline + '" fill="none" stroke="rgba(4,8,14,.92)" stroke-width="0.9" ' +
        'stroke-linejoin="miter" vector-effect="non-scaling-stroke"></path></g>' +
      '<text x="' + f(v[0]) + '" y="' + f(v[1]) + '" text-anchor="middle" ' +
        'dominant-baseline="central" font-size="13" fill="#e1e5ea">' + roomAvg + '\u00b0</text>' +
      '<text x="' + f(v[0] - 2.2) + '" y="' + f(v[1] + 15) + '" text-anchor="middle" ' +
        'dominant-baseline="central" font-size="9" font-weight="600" letter-spacing="1.2" ' +
        'fill="rgba(200,215,235,.55)">AVG ROOM</text>';
  }

  /* CARD ADDITION. A label seated on the spread ring at `a`, pushed clear of it and
     anchored so the text runs away from the dial rather than across it. */
  function ringLabel(text, a, ink) {
    var p = P(130, a), left = ((a % 360) + 360) % 360 > 180;
    /* Grow AWAY from the dial by preference, because that is the empty side. Near
       either end of the range the ring end swings low and outward runs the label off
       the card, so it flips and grows back across the arc instead; the knockout is
       what keeps it readable when it does. The width is estimated rather than
       measured because this returns a string, and 5.6 per character at 9.5px with
       this tracking is close enough to decide which way is safe. */
    var w = String(text).length * 5.6;
    var anchor = left ? 'end' : 'start', dy = 0;
    /* Flipped, the label runs back across its own ring end, and at the low end of
       the range that is exactly where the needle stands. Lift it clear. */
    if (left && p[0] - w < 48) { anchor = 'start'; dy = -11; }
    if (!left && p[0] + w > 296) { anchor = 'end'; dy = -11; }
    return '<text class="cg-ringlab" x="' + f(p[0]) + '" y="' + f(p[1] + dy) + '" text-anchor="' +
      anchor + '" dominant-baseline="central" font-size="9.5" ' +
      'font-weight="600" letter-spacing="1.2" fill="' + ink + '">' + text + '</text>';
  }

  function hero(s, d) {
    d = d || derive(s);
    var ta = angleOf(d.target, d.min, d.max), pa = angleOf(d.roomAvg, d.min, d.max);
    var lo = angleOf(d.roomMin, d.min, d.max), hi = angleOf(d.roomMax, d.min, d.max);
    return '<svg viewBox="44 71 256 206" style="display:block; width:100%; height:auto; ' +
        'overflow:visible; font-family:Rajdhani,sans-serif;" role="img" ' +
        'aria-label="House target ' + d.target + ', average room ' + d.roomAvg +
        ', ' + d.cooling + ' of ' + d.on + ' cooling">' +
      '<defs>' + HERO_DEFS + '</defs>' +
      heroTicks(d.min, d.max) +
      '<path d="' + arcPath(HR, A0, A0 + SPAN) + '" fill="none" stroke="rgba(154,165,177,.14)" ' +
        'stroke-width="' + HW + '" stroke-linecap="round"></path>' +
      '<path d="' + arcPath(HR, A0, ta) + '" fill="none" stroke="#5CD6FF" stroke-width="' + HW +
        '" stroke-linecap="round" opacity=".35" filter="url(#mGlow)"></path>' +
      '<path d="' + arcPath(HR, A0, ta) + '" fill="none" stroke="url(#mCold)" stroke-width="' +
        HW + '" stroke-linecap="round"></path>' +
      '<path d="' + arcPath(HR, ta, A0 + SPAN) + '" fill="none" stroke="url(#mWarm)" ' +
        'stroke-width="' + HW + '" stroke-linecap="round"></path>' +
      /* drag band: the hero sets the house target */
      '<path d="' + arcPath(HR, A0, A0 + SPAN) + '" fill="none" stroke="rgba(0,0,0,0)" ' +
        'stroke-width="34" stroke-linecap="round" data-act="house" ' +
        'style="cursor:ew-resize; touch-action:none"></path>' +
      /* spread ring: coldest room to hottest room, both ends named */
      '<path d="' + arcPath(118, lo, hi) + '" fill="none" stroke="rgba(225,231,237,.20)" ' +
        'stroke-width="4" stroke-linecap="round"></path>' +
      /* CARD ADDITION: the handoff seats these two at fixed points, correct only for
         a five zone house with a moderate spread, and its own README says the honest
         version seats each on its ring end's radial. They do now, anchored away from
         the dial so a long room name grows outward instead of across the band. */
      ringLabel(String(d.coldestRoom.name || '').toUpperCase() + ' ' + d.roomMin, lo, '#8b95a2') +
      ringLabel(String(d.warmest.name || '').toUpperCase() + ' ' + d.roomMax, hi, '#27d3ff') +
      heroNeedle(ta) +
      heroPin(d.roomAvg, pa) +
      '<text x="168" y="164" text-anchor="middle" font-size="13" font-weight="600" ' +
        'letter-spacing="4" fill="#9aa5b1">TARGET</text>' +
      /* the digits stay on the gauge axis and the degree sits outside them, so adding
         the symbol does not push the number off centre */
      '<text x="168" y="213" text-anchor="middle" dominant-baseline="central" ' +
        'font-size="52" letter-spacing="2" fill="#f2f5f8">' + d.target + '</text>' +
      '<text x="200" y="200" text-anchor="start" dominant-baseline="central" ' +
        'font-size="20" fill="#9aa5b1">\u00b0</text>' +
      '<text x="168" y="264" text-anchor="middle" font-size="11" font-weight="600" ' +
        'letter-spacing="2" fill="#9aa5b1">SPREAD ' + d.spread + '\u00b0 \u00b7 ' +
        String(d.warmest.name || '').toUpperCase() + ' WARMEST</text>' +
      '</svg>';
  }

  /* ----------------------------------------------------------------- tile ---- */

  /* the shared strip. Track 6 to 134 in a 140 wide box, the same window on every tile:
     the tick is this zone's target, the dot is the room, the dotted hairline is the
     house target, and the bar between them is coloured by what the unit is doing. */
  var DASH = '--';   // CARD ADDITION: the reading the shipped card gives a dead zone
  var EMPTY_STRIP = '<svg viewBox="0 0 140 16" style="display:block; width:100%; height:auto;" ' +
    'aria-hidden="true"><line x1="6" y1="9" x2="134" y2="9" stroke="rgba(225,231,237,.10)" ' +
    'stroke-width="4" stroke-linecap="round"></line></svg>';

  function strip(z, d) {
    var span = (d.hi - d.lo) || 1;
    var x = function (v) { return f(6 + (clamp(v, d.lo, d.hi) - d.lo) / span * 128); };
    var on = z.mode !== 'off' && z.room > z.set;
    var m = MODES[z.mode] || MODES.unavailable;
    return '<svg viewBox="0 0 140 16" style="display:block; width:100%; height:auto;" aria-hidden="true">' +
      '<line x1="6" y1="9" x2="134" y2="9" stroke="rgba(225,231,237,.10)" stroke-width="4" ' +
        'stroke-linecap="round"></line>' +
      '<line x1="' + x(d.target) + '" y1="3" x2="' + x(d.target) + '" y2="15" ' +
        'stroke="rgba(225,231,237,.16)" stroke-width="1" stroke-dasharray="2 2"></line>' +
      '<line x1="' + x(Math.min(z.set, z.room)) + '" y1="9" x2="' + x(Math.max(z.set, z.room)) +
        '" y2="9" stroke="' + (on ? m.ink : 'rgba(225,231,237,.28)') + '" stroke-width="4" ' +
        'stroke-linecap="round"></line>' +
      '<line x1="' + x(z.set) + '" y1="2.5" x2="' + x(z.set) + '" y2="15.5" stroke="#e1e5ea" ' +
        'stroke-width="1.6" stroke-linecap="round"></line>' +
      '<circle cx="' + x(z.room) + '" cy="9" r="4.2" fill="' + m.ink + '" stroke="#1b222c" ' +
        'stroke-width="1.4"></circle></svg>';
  }

  /* HTML sized preset glyph, same shapes, colours and timings as the dial's */
  function presetIcon(name, modeInk) {
    if (!name || name === 'NONE') return '';
    var open = '<svg width="15" height="15" viewBox="-8 -8 16 16" style="display:block; ' +
      'overflow:visible; flex:0 0 auto">';
    var seq = function (dl) { return 'style="animation:wink 1.9s ease-in-out ' + dl + 's infinite"'; };
    if (name === 'ECO') {
      return open + '<g transform="scale(0.8)">' +
        '<path d="M -5 6 Q 8 1 5 -8 Q -8 -3 -5 6 Z" fill="#5FD69A" opacity=".95"></path>' +
        '<path d="M -4 5 L 4 -6" stroke="#0b1017" stroke-width="1.1" opacity=".5"></path></g></svg>';
    }
    if (name === 'SLEEP') {
      var z = [[-7, 5, 6.5, 0], [-2.5, 2, 8.5, 0.34], [2, -2, 10.5, 0.68]], o = open, i;
      for (i = 0; i < 3; i++) {
        o += '<text x="' + z[i][0] + '" y="' + z[i][1] + '" font-size="' + z[i][2] +
          '" font-weight="700" fill="#B388FF" ' + seq(z[i][3]) + '>z</text>';
      }
      return o + '</svg>';
    }
    if (name === 'BOOST') {
      var dy = [5, 0.4, -4.2], dl = [0, 0.26, 0.52], b = open, k;
      for (k = 0; k < 3; k++) {
        b += '<path d="M -5 ' + dy[k] + ' L 0 ' + (dy[k] - 4.6) + ' L 5 ' + dy[k] + '" fill="none" ' +
          'stroke="#FF8A3D" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
          seq(dl[k]) + '></path>';
      }
      return b + '</svg>';
    }
    if (name === 'COMFORT') {
      return open + '<circle cx="0" cy="0" r="5" fill="none" stroke="' + modeInk +
        '" stroke-width="1.6"></circle><circle cx="0" cy="0" r="1.9" fill="' + modeInk +
        '"></circle></svg>';
    }
    return open + '<text x="0" y="4" text-anchor="middle" font-size="10" font-weight="700" ' +
      'fill="' + modeInk + '">' + String(name).charAt(0) + '</text></svg>';
  }

  function fanBars(pct) {
    /* CARD ADDITION: HA reports a fan MODE, and "auto" is the absence of a value, not
       a speed. Printing it as a number invents a reading the unit never gave. */
    var auto = pct == null;
    var filled = auto ? 0 : pct <= 33 ? 1 : pct <= 66 ? 2 : 3, h = [4, 6.5, 9], out = '', i;
    for (i = 0; i < 3; i++) {
      out += '<span style="width:2.5px; height:' + h[i] + 'px; background:' +
        (i < filled ? '#c3cbd4' : 'rgba(195,203,212,.26)') + ';"></span>';
    }
    return '<span style="display:flex; align-items:center; gap:3px" title="Fan speed">' +
      '<span style="display:flex; align-items:flex-end; gap:1.5px; height:9px;">' + out + '</span>' +
      '<span style="font:600 10.5px/1 ui-monospace,monospace; color:#8b95a2;">' +
      (auto ? 'AUTO' : pct + '%') + '</span></span>';
  }

  /* glass pane tinted by its own mode, never filled with a fixed cyan */
  function tile(z, i, d) {
    /* CARD ADDITION: an unknown mode falls back rather than throwing, and a zone with
       no reading shows the dash the shipped card shows rather than the word NaN. */
    var m = MODES[z.mode] || MODES.unavailable, off = z.mode === 'off';
    var nore = z.dead || z.room == null || z.set == null;
    var on = !off && !nore && z.room > z.set, delta = nore ? 0 : z.room - z.set;
    var act = nore ? m.status : (off ? 'OFF' : (on ? m.status : 'IDLE'));
    var actInk = off || nore || !on ? '#6f7a88' : m.ink;
    var btn = 'appearance:none; cursor:pointer; height:30px; border-radius:8px; ' +
      'border:1px solid rgba(225,231,237,.20); background:rgba(225,231,237,.05); ' +
      'color:#e1e5ea; font:400 16px/1 Rajdhani,sans-serif; padding:0;';
    return '<div data-zone="' + i + '" style="border:1px solid ' +
        (off ? 'rgba(255,255,255,.09)' : rgba(m.ink, .30)) + '; border-radius:13px; background:' +
        (off ? 'linear-gradient(158deg, rgba(255,255,255,.07), rgba(255,255,255,.02))'
             : 'linear-gradient(158deg, ' + rgba(m.ink, .14) + ', rgba(255,255,255,.025))') +
        '; backdrop-filter:blur(14px) saturate(130%); -webkit-backdrop-filter:blur(14px) saturate(130%); ' +
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.14); padding:9px 9px 8px; display:flex; ' +
        'flex-direction:column; justify-content:space-between; gap:5px;">' +
      '<div style="display:flex; align-items:center; justify-content:center; gap:7px;">' +
        '<span style="width:7px; height:7px; border-radius:50%; background:' + m.ink +
          '; box-shadow:0 0 9px ' + rgba(m.ink, .85) + ';"></span>' +
        '<span style="font:600 14px/1 Rajdhani,sans-serif; letter-spacing:.14em; ' +
          'text-transform:uppercase; color:#f2f5f8;">' + z.name + '</span></div>' +
      /* the numeral is the ROOM, the fact you walked over to check, and tapping it
         opens this zone's sheet */
      '<div data-act="sheet" style="display:flex; align-items:baseline; justify-content:center; ' +
        'gap:2px; cursor:pointer">' +
        '<span style="font:400 34px/.82 Rajdhani,sans-serif; color:#f6f8fa;">' +
          (nore ? DASH : z.room) + '</span>' +
        '<span style="font:400 14px/1 Rajdhani,sans-serif; color:#8b95a2;">\u00b0</span></div>' +
      '<div style="display:grid; grid-template-columns:34px minmax(0,1fr) 34px; gap:5px; ' +
        'align-items:center;">' +
        '<button type="button" aria-label="lower" data-act="dec" style="' + btn + '">\u2212</button>' +
        '<span style="text-align:center; font:600 10px/1 ui-monospace,monospace; ' +
          'letter-spacing:.08em; color:#8b95a2;">' + (nore ? DASH : z.set) +
          (nore ? '' : '<span style="color:' + (delta >= 5 ? '#7fe4ff' : on ? m.ink : '#8b95a2') +
            '"> ' + (delta >= 0 ? '+' : '') + delta + '</span>') + '</span>' +
        '<button type="button" aria-label="raise" data-act="inc" style="' + btn + '">+</button></div>' +
      (nore ? EMPTY_STRIP : strip(z, d)) +
      '<div style="display:flex; align-items:center; justify-content:center; gap:8px; padding-top:1px;">' +
        '<span style="font:600 10.5px/1 ui-monospace,monospace; letter-spacing:.06em; color:' +
          actInk + ';">' + act + '</span>' +
        presetIcon(z.preset, m.ink) +
        fanBars(z.fan) + '</div></div>';
  }

  /* ---------------------------------------------------------------- footer ---- */
  /* A LIST, not four fixed buttons. Off and sync are always there; the rest are the
     presets every zone supports, which is what _sharedPresets does in the card.
     Setpoints come from PREMAP, never inline. */

  function sharedPresets(zones) {
    return PRESETS.filter(function (p) {
      if (p === 'NONE' || PREMAP[p] == null) return false;
      return zones.every(function (z) {
        return !z.presets || z.presets.indexOf(p) >= 0;
      });
    });
  }

  function groupActions(s, d, ui) {
    var acts = [];
    /* the button reads the house rather than announcing one intent: with every zone off
       it turns them back on, and turning a running house off is destructive, so it arms
       first and commits on the second tap */
    if (d.on === 0) acts.push({ id: 'allon', label: 'All on' });
    else if (ui && ui.confirmOff) acts.push({ id: 'confirm', label: 'Tap to confirm', warn: true });
    else acts.push({ id: 'alloff', label: 'All off' });
    acts.push({ id: 'sync', label: 'Sync all' });
    sharedPresets(s.zones).slice(0, 2).forEach(function (p) {
      acts.push({ id: 'preset:' + p, label: p, lit: true });
    });
    return acts;
  }

  function footer(acts) {
    return '<div data-act="footer" style="display:flex; flex-wrap:wrap; justify-content:center; ' +
        'gap:10px; margin-top:10px; padding-top:10px; ' +
        'border-top:1px solid rgba(225,231,237,.12);">' +
      acts.map(function (a) {
        var border = a.warn ? '#F2933A' : a.lit ? 'rgba(39,211,255,.42)' : 'rgba(255,255,255,.16)';
        var bg = a.warn ? 'rgba(242,147,58,.16)' : a.lit ? 'rgba(39,211,255,.09)'
          : 'linear-gradient(158deg, rgba(255,255,255,.10), rgba(255,255,255,.03))';
        var ink = a.warn ? '#FFD3A1' : a.lit ? '#7fe4ff' : '#e1e5ea';
        return '<button type="button" data-gact="' + a.id + '" style="appearance:none; ' +
          'cursor:pointer; min-height:40px; padding:0 30px; border-radius:10px; ' +
          'font:600 12.5px/1 Rajdhani,sans-serif; letter-spacing:.16em; text-transform:uppercase; ' +
          'border:1px solid ' + border + '; background:' + bg + '; color:' + ink + '; ' +
          'box-shadow:inset 0 1px 0 rgba(255,255,255,.16);">' + a.label + '</button>';
      }).join('') + '</div>';
  }

  /* ----------------------------------------------------------------- sheet ---- */
  /* The single dial's sheet, scoped to one room. Same paddings, grids, radii and type,
     so the two cards present one object. 474 wide floating panel, centred, over a light
     dim: at 1140 a full bleed overlay reads as a wall rather than a window. */

  function sheet(z, i) {
    if (!z) return '';
    var m = MODES[z.mode];
    var pill = function (sel) {
      return 'border:1px solid ' + (sel ? '#27d3ff' : 'rgba(154,175,210,.22)') + '; background:' +
        (sel ? 'rgba(39,211,255,.14)' : 'rgba(154,175,210,.06)') + '; color:' +
        (sel ? '#bfeeff' : '#cfd8e6') + ';';
    };
    var modes = MODE_ORDER.filter(function (k) {
      return !z.modes || z.modes.indexOf(k) >= 0;
    }).map(function (k) {
      var sel = z.mode === k, mm = MODES[k];
      return '<button type="button" data-zmode="' + k + '" style="min-height:44px; ' +
        'border-radius:10px; cursor:pointer; font:600 14px/1 Rajdhani,sans-serif; ' +
        'letter-spacing:.1em; border:1.5px solid ' + (sel ? mm.ink : 'rgba(154,175,210,.22)') +
        '; background:' + (sel ? rgba(mm.ink, .16) : 'rgba(154,175,210,.07)') + '; color:' +
        (sel ? mm.light : '#cfd8e6') + ';">' + mm.word + '</button>';
    }).join('');
    var pres = PRESETS.map(function (p) {
      return '<button type="button" data-zpre="' + p + '" style="min-height:32px; padding:0 13px; ' +
        'border-radius:16px; cursor:pointer; font:600 11.5px/1 Rajdhani,sans-serif; ' +
        'letter-spacing:.1em; ' + pill((z.preset || 'NONE') === p) + '">' + p + '</button>';
    }).join('');
    /* BOOST is already a preset, so a BOOST MODE toggle was the same capability twice.
       The toggle row is real device switches only. */
    var togs = [['swing', 'SWING', z.swing], ['led', 'LED', z.led], ['sound', 'SOUND', z.sound]]
      .map(function (g) {
        return '<button type="button" data-ztog="' + g[0] + '" style="min-height:40px; ' +
          'border-radius:10px; cursor:pointer; font:600 11px/1.2 Rajdhani,sans-serif; ' +
          'letter-spacing:.08em; ' + pill(g[2]) + '">' + g[1] + '</button>';
      }).join('');

    return '<div data-act="backdrop" style="position:absolute; inset:0; z-index:8; ' +
        'border-radius:16px; background:rgba(4,7,12,.34); backdrop-filter:blur(2px); ' +
        '-webkit-backdrop-filter:blur(2px); display:flex; align-items:center; ' +
        'justify-content:center; font-family:Rajdhani,sans-serif;">' +
      '<div data-act="panel" style="position:relative; box-sizing:border-box; width:474px; ' +
        'max-width:100%; display:flex; flex-direction:column; gap:10px; padding:16px 16px 18px; ' +
        'border-radius:13px; background:rgba(7,10,16,.88); border:1px solid rgba(255,255,255,.10); ' +
        'box-shadow:0 26px 64px rgba(0,0,0,.55);">' +
        '<button type="button" aria-label="close" data-act="close" style="position:absolute; ' +
          'top:12px; right:12px; width:30px; height:30px; border-radius:50%; cursor:pointer; ' +
          'border:1px solid rgba(200,215,235,.28); background:rgba(20,26,36,.9); color:#dfe4ea; ' +
          'font:400 17px/1 Rajdhani,sans-serif;">\u00d7</button>' +
        '<div style="text-align:center; font:600 22px/1 Rajdhani,sans-serif; letter-spacing:1.4px; ' +
          'color:rgba(236,239,247,.5); padding:0 0 2px;">' + (z.title || z.name) + '</div>' +
        '<div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px;">' +
          modes + '</div>' +
        '<div style="height:1px; background:rgba(200,215,235,.14);"></div>' +
        '<div style="display:flex; flex-wrap:wrap; gap:7px; justify-content:center;">' + pres + '</div>' +
        '<div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px;">' +
          togs + '</div></div></div>';
  }

  /* ------------------------------------------------------------ whole card ---- */
  /* s  = { name, zones:[...], target, min, max }
     ui = { confirmOff, sheetIndex }  transient interface state, not device state */

  function card(s, ui) {
    var d = derive(s);
    ui = ui || {};
    return '<div style="position:relative; border-radius:16px; ' +
        'border:1px solid rgba(255,255,255,.13); background:linear-gradient(158deg, ' +
        'rgba(255,255,255,.11), rgba(255,255,255,.035) 42%, rgba(255,255,255,.015)); ' +
        'backdrop-filter:blur(20px) saturate(140%); -webkit-backdrop-filter:blur(20px) saturate(140%); ' +
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.20), inset 0 -1px 0 rgba(255,255,255,.05), ' +
        '0 26px 64px rgba(0,0,0,.5); padding:12px 18px; font-family:Rajdhani,sans-serif;">' +
      '<div style="display:flex; align-items:baseline; justify-content:space-between; gap:14px; ' +
        'padding-bottom:6px; border-bottom:1px solid rgba(225,231,237,.12);">' +
        '<span style="font:600 22px/1 Rajdhani,sans-serif; letter-spacing:.08em; ' +
          'text-transform:uppercase; color:#f2f5f8;">' + (s.name || 'House') + '</span>' +
        '<span style="display:flex; align-items:center; gap:8px; ' +
          'font:600 12px/1 ui-monospace,monospace; letter-spacing:.07em;">' +
          '<span style="color:#27d3ff;">' + d.cooling + ' COOLING</span>' +
          '<span style="color:#546070;">/</span>' +
          '<span style="color:#8b95a2;">' + d.on + ' ON</span></span></div>' +
      '<div style="display:grid; grid-template-columns:236px minmax(0,1fr); gap:18px; ' +
        'align-items:stretch; margin-top:10px;">' +
        hero(s, d) +
        '<div style="display:grid; grid-template-columns:repeat(' + s.zones.length +
          ',minmax(0,1fr)); gap:10px; min-width:0; align-self:center; height:' + arcRatio() + ';">' +
          s.zones.map(function (z, i) { return tile(z, i, d); }).join('') + '</div></div>' +
      footer(groupActions(s, d, ui)) +
      (ui.sheetIndex == null ? '' : sheet(s.zones[ui.sheetIndex], ui.sheetIndex)) +
      '</div>';
  }

  var KEYFRAMES =
    '@keyframes wink { 0%, 100% { opacity: .10 } 18%, 44% { opacity: 1 } }';

    return { card: card, hero: hero, tile: tile, strip: strip, sheet: sheet,
      footer: footer, groupActions: groupActions, sharedPresets: sharedPresets,
      presetIcon: presetIcon, fanBars: fanBars, derive: derive, arcRatio: arcRatio,
      MODES: MODES, MODE_ORDER: MODE_ORDER, PRESETS: PRESETS, PREMAP: PREMAP,
      KEYFRAMES: KEYFRAMES, HERO_DEFS: HERO_DEFS, angleOf: angleOf, arcPath: arcPath, P: P };
  })();

  /* What the fan RING is drawn at, as opposed to what the rail READS.
     A fan with no speed set still needs a visible ring, because the ring is the
     control you grab to set one: every style dims itself when handed null, which on a
     dark card means there is nothing to aim at. The rail carries the word AUTO, so
     the distinction is still on screen, in the place that is made of words. */
  const FACE_RING = (pct) => (pct == null ? 100 : pct);
  /* The MARKER is the other half of that. It marks a value, so with no value there is
     nothing for it to mark, and on this hardware hvac auto refuses fan commands
     outright: a marker at the far end there points at a speed the unit will not take.
     fanHandle already drew nothing for a null value; handing the styles 100 for the
     ARC brought it back, so the styles take the two apart. */


  /* ---------------------------------------------------------------------------
     Zone card theming.

     The handoff module writes every colour as an inline style attribute, and an
     inline style beats any stylesheet, so the usual approach of shipping CSS that
     overrides it cannot work. The markup is rewritten on the way out instead: one
     map, applied once per render, turning each NEUTRAL literal into the theme
     property the rest of this card already uses, with the module's own literal as
     the fallback so a card with no theme looks exactly as it did.

     Only neutrals and the accent are in here. Mode ink, the two arc gradients and
     the preset glyph colours are the instrument's identity and are left alone; they
     are the same literals the single dial uses.

     Ordered longest-first: a short literal that is a prefix of a longer one would
     otherwise corrupt it.
     ------------------------------------------------------------------------- */
  const ZONE_INK = [
    // --- surfaces and chrome, which is what `glass` actually tints -------------
    ["rgba(255,255,255,.11)", "var(--ct-zone-surface-hi, rgba(255,255,255,.11))"],
    ["rgba(255,255,255,.09)", "var(--ct-zone-edge, rgba(255,255,255,.09))"],
    ["rgba(255,255,255,.07)", "var(--ct-zone-surface, rgba(255,255,255,.07))"],
    ["rgba(255,255,255,.16)", "var(--ct-zone-edge-hi, rgba(255,255,255,.16))"],
    ["rgba(255,255,255,.14)", "var(--ct-zone-inset, rgba(255,255,255,.14))"],
    ["rgba(255,255,255,.10)", "var(--ct-zone-surface, rgba(255,255,255,.10))"],
    ["rgba(255,255,255,.035)", "var(--ct-zone-surface-lo, rgba(255,255,255,.035))"],
    ["rgba(255,255,255,.025)", "var(--ct-zone-surface-lo, rgba(255,255,255,.025))"],
    ["rgba(255,255,255,.015)", "var(--ct-zone-surface-lo, rgba(255,255,255,.015))"],
    ["rgba(255,255,255,.05)", "var(--ct-zone-inset-lo, rgba(255,255,255,.05))"],
    ["rgba(255,255,255,.03)", "var(--ct-zone-surface-lo, rgba(255,255,255,.03))"],
    ["rgba(255,255,255,.02)", "var(--ct-zone-surface-lo, rgba(255,255,255,.02))"],
    ["rgba(255,255,255,.20)", "var(--ct-zone-inset, rgba(255,255,255,.20))"],
    ["rgba(255,255,255,.13)", "var(--ct-zone-edge, rgba(255,255,255,.13))"],
    // --- ink ------------------------------------------------------------------
    ["#f2f5f8", "var(--primary-text-color, #f2f5f8)"],
    ["#f6f8fa", "var(--primary-text-color, #f6f8fa)"],
    ["#e1e5ea", "var(--primary-text-color, #e1e5ea)"],
    ["#8b95a2", "var(--secondary-text-color, #8b95a2)"],
    ["#9aa5b1", "var(--secondary-text-color, #9aa5b1)"],
    ["#6f7a88", "var(--disabled-text-color, #6f7a88)"],
    ["#c3cbd4", "var(--secondary-text-color, #c3cbd4)"],
    ["#546070", "var(--divider-color, #546070)"],
    ["#1b222c", "var(--ha-card-background, var(--card-background-color, #1b222c))"],
    ["rgba(200,215,235,.55)", "var(--secondary-text-color, rgba(200,215,235,.55))"],
    ["rgba(195,203,212,.26)", "var(--divider-color, rgba(195,203,212,.26))"],
    // --- ticks, tracks and hairlines -----------------------------------------
    ["rgba(154,165,177,.45)", "var(--ct-zone-tick, rgba(154,165,177,.45))"],
    ["rgba(154,165,177,.14)", "var(--ct-zone-track, rgba(154,165,177,.14))"],
    ["rgba(225,231,237,.28)", "var(--ct-zone-bar-off, rgba(225,231,237,.28))"],
    ["rgba(225,231,237,.20)", "var(--ct-zone-ring, rgba(225,231,237,.20))"],
    ["rgba(225,231,237,.16)", "var(--divider-color, rgba(225,231,237,.16))"],
    ["rgba(225,231,237,.12)", "var(--divider-color, rgba(225,231,237,.12))"],
    ["rgba(225,231,237,.10)", "var(--ct-zone-track, rgba(225,231,237,.10))"],
    ["rgba(225,231,237,.05)", "var(--ct-zone-surface, rgba(225,231,237,.05))"],
    // --- the accent, which is a real config key and did nothing here ----------
    ["rgba(39,211,255,.42)", "color-mix(in srgb, var(--cg-accent, #27d3ff) 42%, transparent)"],
    ["rgba(39,211,255,.14)", "color-mix(in srgb, var(--cg-accent, #27d3ff) 14%, transparent)"],
    ["rgba(39,211,255,.09)", "color-mix(in srgb, var(--cg-accent, #27d3ff) 9%, transparent)"],
    ["#7fe4ff", "var(--cg-accent, #7fe4ff)"],
    ["#27d3ff", "var(--cg-accent, #27d3ff)"],
  ];
  function themeZone(html) {
    /* Everything inside <defs> is left exactly as written. That is where the two arc
       gradients live, and they are the instrument's identity, shared with the single
       dial: routing them through the accent turned a purple accent into a purple
       COLD ARC, which is a different card, not a tinted one. */
    const defs = [];
    let out = html.replace(/<defs>[\s\S]*?<\/defs>/g, (m) => {
      defs.push(m);
      return "\u0001DEFS" + (defs.length - 1) + "\u0001";
    });
    for (const [from, to] of ZONE_INK) out = out.split(from).join(to);
    return out.replace(/\u0001DEFS(\d+)\u0001/g, (m, i) => defs[Number(i)]);
  }

  // ClimateEntityFeature.TURN_ON. An entity that advertises it can be asked to turn
  // itself on without the card choosing a mode on its behalf.
  const CLIMATE_TURN_ON = 128;

  const HERO_MAX_W = 166;              // clear span between the two steppers, less air

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

  // Long-press dwell (ms) before the swing chip opens its position picker. A shorter
  // release fires the tap/cycle instead. Sits between a deliberate hold and the
  // center disc's more-info HOLD_MS so the two gestures never feel the same.
  const SWING_HOLD_MS = 500;

  // ---- setpoint steppers -------------------------------------------------
  // Press-and-hold on a stepper repeats. The first repeat waits out a deliberate
  // press so a single tap is never read as two, then ticks steadily. The write is
  // trailing-debounced, so holding through six degrees sends ONE set_temperature
  // instead of six, while the arc still tracks every tick optimistically.
  const STEP_REPEAT_DELAY_MS = 420;
  const STEP_REPEAT_MS = 130;
  const STEP_COMMIT_MS = 450;
  // Stepper geometry: radius 118 from the dial centre puts these inboard of the
  // numeral ring (160) and clear of the big numerals, at y 256.
  const STEP_R = 27, STEP_Y = 256, STEP_MINUS_X = 186, STEP_PLUS_X = 414;

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
  // The group card composes its markup as a string, so every value that comes from
  // an entity (a friendly name, a preset, a state) is escaped on the way in. Entity
  // names are user-controlled, and one carrying a quote or an angle bracket must not
  // be able to close an attribute or open a tag.
  function escapeText(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttr(v) {
    return escapeText(v).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

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
      // Fan ring style. dash is the shipped look and the DEFAULT, so an update
      // changes nothing for anyone who does not opt in. Unknown values fall back.
      const _fs = this._config.fan_style;
      /* silk by default. The plain gradient arc is still there under `original`,
         because it is what every card installed before this release drew. */
      this._fanStyle = (_fs === "breeze" || _fs === "original") ? _fs : "silk";

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
      // swing chip long-press teardown: clear the hold timer + detach the picker's
      // document-level Escape so a card removed mid-hold or mid-pick leaks nothing.
      if (this._swingHoldTimer) { clearTimeout(this._swingHoldTimer); this._swingHoldTimer = null; }
      this._swingPressActive = false;
      this._swingLongPressed = false;
      // Stepper teardown: a card removed mid-hold must stop ticking, and must not
      // fire a trailing set_temperature at an entity nobody is looking at any more.
      this._stepPointerUp();
      if (this._stepCommitT) { clearTimeout(this._stepCommitT); this._stepCommitT = null; }
      this._stepPending = null;
      if (this._onSwingDocKeydown) document.removeEventListener("keydown", this._onSwingDocKeydown, true);
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
        // The face module ships its own gradients and filters. Without these the
        // band's url(#dCold) resolves to nothing and the arc renders flat.
        FACE.DEFS + FACE.SILK_DEFS +
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
        class: "nope ct-track", fill: "none", stroke: "rgba(20,30,40,.55)", "stroke-width": "7", "stroke-linecap": "round",
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
        class: "nope ct-track", fill: "none", stroke: "rgba(27,39,51,.65)", "stroke-width": "16", "stroke-linecap": "round",
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

      // ---- DIAL FACE (drawn from FACE, the handoff geometry) ----
      // One group per piece so a drag can regenerate only what moved. Rebuilding the
      // whole face on every pointermove would restring thirty paths per frame.
      this._refs.face = el("g", { class: "ct-face" });
      ["Fan", "Band", "Delta", "Scale", "Room", "Needle", "Center", "Step", "Rail"]
        .forEach((k) => {
          const g = el("g", { class: "ct-face-" + k.toLowerCase() });
          this._refs["face" + k] = g;
          this._refs.face.appendChild(g);
        });
      svg.appendChild(this._refs.face);
      // The face sits above the legacy hit targets, so its cells and steppers
      // swallow the taps that used to reach them. One delegated handler, since the
      // markup is regenerated as a string and per-node listeners would not survive.
      this._refs.face.addEventListener("click", (ev) => this._onFaceClick(ev));

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

      // RH xx, the fourth line of the centre stack. Only drawn when the entity
      // reports current_humidity, so the stack never shifts for one that does not.
      this._refs.rhCap = el("text", {
        x: CX, y: 216, "text-anchor": "middle", class: "ct-rh nope",
        "font-size": "15", "letter-spacing": "2.5",
      });
      this._refs.rhCap.style.fontWeight = "400";
      const rhPrefix = el("tspan", { fill: "#8c99a7" }, "RH ");
      rhPrefix.style.fill = "var(--secondary-text-color, #8c99a7)";
      this._refs.rhLabel = rhPrefix;
      this._refs.rhCap.appendChild(rhPrefix);
      this._refs.rhVal = el("tspan", { fill: "rgba(234,235,238,.92)" }, "--%");
      this._refs.rhCap.appendChild(this._refs.rhVal);
      this._refs.rhCap.style.display = "none";
      svg.appendChild(this._refs.rhCap);

      // big setpoint number (no degree).
      this._refs.bigNum = el("text", {
        x: CX, y: 244, "text-anchor": "middle", "dominant-baseline": "central", class: "ct-big nope",
        fill: "rgba(234,235,238,.98)", "font-size": "84", "letter-spacing": "2",
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

      // ---- SETPOINT STEPPERS (minus at the cold end, plus at the warm end) ----
      // The dial is drag-first, but dragging is not available to everyone: a coarse
      // pointer, a shaky hand or a wall tablet all want a discrete target. These are
      // that alternative, sitting inboard of the numeral ring so they never collide
      // with the ticks or the big numerals.
      this._refs.steps = [];
      [[-1, STEP_MINUS_X, "M-11,0 L11,0", "decrease"],
       [1, STEP_PLUS_X, "M-11,0 L11,0 M0,-11 L0,11", "increase"]].forEach(([dir, cx, d, kind]) => {
        const g = el("g", {
          class: "ct-step ct-hit", transform: `translate(${cx},${STEP_Y})`,
          role: "button", tabindex: "0", "aria-label": kind,
        });
        g.appendChild(el("circle", { class: "ct-step-bg", r: String(STEP_R) }));
        g.appendChild(el("path", {
          class: "ct-step-ic", d, fill: "none", "stroke-width": "2.6", "stroke-linecap": "round",
        }));
        g.addEventListener("pointerdown", (e) => this._stepPointerDown(e, dir));
        g.addEventListener("pointerup", () => this._stepPointerUp());
        g.addEventListener("pointercancel", () => this._stepPointerUp());
        g.addEventListener("pointerleave", () => this._stepPointerUp());
        g.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
          e.preventDefault(); e.stopPropagation();
          this._stepOnce(dir);
        });
        this._refs.steps.push({ g, dir, kind });
        svg.appendChild(g);
      });

      // ---- clover fan (lower-LEFT), spins with the FAN value ----
      const fanG = el("g", { class: "ct-clover nope", transform: "translate(212,296)" });
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
        x: 212, y: 326, "text-anchor": "middle", class: "ct-fanpct nope",
        fill: "rgba(234,235,238,.92)", "font-size": "22", "letter-spacing": "0.5", opacity: "1",
      }, "--%");
      this._refs.fanPct.style.fontWeight = "600";
      svg.appendChild(this._refs.fanPct);

      // fan NAME label (AUTO/SILENT/MEDIUM/... for percent mode).
      this._refs.fanName = el("text", {
        x: 212, y: 344, "text-anchor": "middle", class: "ct-fanname nope",
        fill: "rgba(234,235,238,.7)", "font-size": "12", "letter-spacing": "2", opacity: ".9",
      }, "");
      this._refs.fanName.style.fontWeight = "600";
      svg.appendChild(this._refs.fanName);

      // clover tap hit (TAP = AUTO, or cycle named fan_mode when there's no auto).
      // a11y (issue #5): focusable button; aria-pressed tracks the AUTO state.
      this._refs.fanIconHit = el("circle", {
        class: "ct-hit", cx: 212, cy: 296, r: 24, fill: "transparent",
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
        class: "ct-swing ct-hit", transform: "translate(388,312)",
        role: "button", tabindex: "0", "aria-label": "Swing", "aria-pressed": "false",
      });
      // 56x44 viewBox units. The card renders 600 units into roughly 470 CSS px on a
      // normal dashboard column, so this is the smallest box that still clears the
      // 44 CSS px touch-target guideline at that width (issue #21).
      this._refs.swingChipBg = el("rect", {
        x: -28, y: -22, width: 56, height: 44, rx: 12, class: "ct-chipbg",
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
        x: 388, y: 348, "text-anchor": "middle", class: "ct-swingcap nope",
        fill: "rgba(234,235,238,.7)", "font-size": "13.5", "letter-spacing": "2", opacity: ".9",
      }, "SWING");
      this._refs.swingCap.style.fontWeight = "600";
      svg.appendChild(this._refs.swingCap);
      // ---- HORIZONTAL SWING chip ----
      // Built always, shown only when a horizontal axis resolves. When it does, the
      // two chips split the lower-right shelf; when it does not, the vertical chip
      // keeps the single centred position it has always had.
      const swingHChip = el("g", {
        class: "ct-swingh ct-hit", transform: "translate(414,312)",
        role: "button", tabindex: "0", "aria-label": "Horizontal swing", "aria-pressed": "false",
      });
      this._refs.swingHChipBg = el("rect", {
        x: -28, y: -22, width: 56, height: 44, rx: 12, class: "ct-chipbg",
        fill: "rgba(40,52,66,.30)", stroke: "rgba(234,235,238,.14)", "stroke-width": "1",
      });
      swingHChip.appendChild(this._refs.swingHChipBg);
      this._refs.swingHIcon = el("path", {
        d: "M -3 -5 L -9 0 L -3 5 M -9 0 L 9 0 M 3 -5 L 9 0 L 3 5",
        fill: "none", stroke: "#6a7480", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round",
      });
      swingHChip.appendChild(this._refs.swingHIcon);
      this._refs.swingHChip = swingHChip;
      swingHChip.style.display = "none";
      svg.appendChild(swingHChip);
      this._refs.swingHCap = el("text", {
        x: 414, y: 348, "text-anchor": "middle", class: "ct-swingcap nope",
        fill: "rgba(234,235,238,.7)", "font-size": "13.5", "letter-spacing": "2", opacity: ".9",
      }, "SWING H");
      this._refs.swingHCap.style.fontWeight = "600";
      this._refs.swingHCap.style.display = "none";
      svg.appendChild(this._refs.swingHCap);
      const swingHTap = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const st = this._st(this._config.entity);
        if (!st || st.state === "off" || st.state === "unavailable" || st.state === "unknown") return;
        this._swingHToggle();
      };
      swingHChip.addEventListener("pointerup", swingHTap);
      swingHChip.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
        swingHTap(e);
      });

      this._onSwingDown = (e) => this._swingPointerDown(e);
      this._onSwingUp = (e) => this._swingPointerUp(e);
      this._onSwingCancel = () => this._swingPointerCancel();
      swingChip.addEventListener("pointerdown", this._onSwingDown);
      swingChip.addEventListener("pointerup", this._onSwingUp);
      swingChip.addEventListener("pointercancel", this._onSwingCancel);
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
      this._refs.hintMode = el("text", Object.assign({ x: 300, y: 346 }, hintAttrs), "MODE");
      this._refs.hintFan = el("text", Object.assign({ x: 132, y: 338 }, hintAttrs), "FAN");
      this._refs.hintAuto = el("text", Object.assign({ x: 212, y: 278 }, hintAttrs), "AUTO");
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
        // r86 reached y341 and the rail starts at y321, so the centre hit sat ON TOP
        // of the rail cells and swallowed their taps: pressing SWING opened the mode
        // sheet instead of toggling. r62 spans x238..362 and y193..317, which is the
        // numeral's own box and clear of both the rail and the steppers.
        class: "ct-hit ct-center-hit", cx: 300, cy: 255, r: 62, fill: "transparent",
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
      if (kind === "swing") this._optSwingPos = null; // drop the optimistic position too
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
          const nameAgrees = String(attr.fan_mode).toLowerCase()
            === String(this._optimisticFanName).toLowerCase();
          /* On a numeric fan the mode word and the speed entity land a beat apart, so
             agreeing on the word alone releases the hold while the speed still reads
             the old value, and the ring jumps through it. Both have to agree. */
          const rng = this._fanNumRange();
          const numAgrees = !rng || (String(this._optimisticFanName).toLowerCase() === "auto"
            ? this._faceNumUnset(rng) : !this._faceNumUnset(rng));
          if (nameAgrees && numAgrees) {
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
      // SWING position (climate branch): drop the optimistic pick the moment the live
      // swing_mode reports the member we asked for (case-insensitive), else on timeout.
      if (this._optSwingPos) {
        const m = this._swingMode();
        const st = m.kind === "climate" ? this._st(m.ref) : null;
        const live = st && st.attributes && st.attributes.swing_mode;
        if (now >= this._optSwingPos.until
            || (live != null && String(live).toLowerCase() === String(this._optSwingPos.mode).toLowerCase())) {
          this._optSwingPos = null;
        }
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
      // A gesture the unit will refuse is not accepted at all. Faking it and reverting
      // five seconds later is worse than not moving: it reads as success.
      if (this._active === "fan" && !this._fanSettable()) return;
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
      if (ring === "temp") { this._tempKeyDown(e, s); return; }
      if (!this._fanSettable()) return;
      this._fanKeyDown(e, s);
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
        // Shift moves the LOW handle, plain keys move the HIGH one. Without this
        // the cyan setpoint was reachable by pointer only, so a keyboard user could
        // see a dual-setpoint dial and drive just half of it.
        if (e.shiftKey) {
          let nl = cLo;
          if (k === "ArrowUp" || k === "ArrowRight") nl = cLo + step;
          else if (k === "ArrowDown" || k === "ArrowLeft") nl = cLo - step;
          else if (k === "PageUp") nl = cLo + big;
          else if (k === "PageDown") nl = cLo - big;
          else if (k === "Home") nl = lo;
          else if (k === "End") nl = cHi - step;
          else handled = false;
          if (handled) {
            e.preventDefault();
            this._commitHeatCool(snap(nl, lo, cHi - step), cHi);
          }
          return;
        }
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
        else {
          /* The speed entity parks OUTSIDE its own range to say "no speed" (101 on a
             1..100 number). Seeding a nudge from that made one ArrowUp compute 106 and
             clamp to max, so a single key press jumped the fan from nothing to full. */
          const liveP = num((this._fanNumState() || {}).state);
          p = (liveP != null && liveP >= r.min && liveP <= r.max) ? liveP : r.min;
        }
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
    _modeName(mode) {
      const mn = this._config && this._config.mode_names;
      if (mn && typeof mn === "object" && typeof mn[mode] === "string" && mn[mode].trim()) return mn[mode];
      return modeName(this._hass, mode) || String(mode).toUpperCase();
    }
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
    // Set the climate fan_mode to the entity's own AUTO member + paint optimistically.
    _callFanAuto() {
      if (!this._hass) return;
      // Send the member the entity actually advertises, with its own casing. A
      // hardcoded "auto" is not a member of a list that spells it "Auto", so HA
      // rejects the call and the clover tap silently does nothing. An entity that
      // advertises no fan_modes at all keeps the legacy literal (nothing to match).
      const s = this._st(this._config.entity);
      const fm = (s && s.attributes && s.attributes.fan_modes) || [];
      const autoMode = fm.length ? fm.find((m) => String(m).toLowerCase() === "auto") : "auto";
      if (!autoMode) { this._render(); return; } // list exists but carries no auto member
      /* Hold AUTO until the device says so. Dropping optimism here meant the very
         next render read the speed entity, which still held the last real speed for a
         second or two, and the marker flicked back to it before the unit reported
         itself parked. Measured: on this hardware set_fan_mode auto lands and the
         speed entity goes out of range about a second later. */
      this._optimisticFanPct = null;
      this._optimisticFanName = autoMode;
      this._optimisticFanUntil = Date.now() + OPT_HOLD_MS;
      this._paintFanAuto();
      this._announce(this._t("fan") + " " + this._t("automatic"));
      // No optimistic value to revert here (AUTO drops optimism above); on
      // failure just repaint live state so the ring snaps back to reality.
      /* _render() as a failure handler repaints the optimistic AUTO this function
         just armed, so a refused call showed AUTO for the full hold and then reverted
         anyway. Drop the optimism first, then repaint. */
      this._svc("climate", "set_fan_mode",
        { entity_id: this._config.entity, fan_mode: autoMode },
        () => this._revertFan());
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
      if (!this._fanSettable()) return;   // same gate as the ring, same control
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
    // Horizontal swing, resolved exactly like the vertical axis: explicit config,
    // then a discovered sibling switch (Midea exposes one), then the entity's own
    // swing_horizontal_modes (Home Assistant 2025.3 and later). Absent everywhere
    // means no second chip, which is the common case.
    _swingHMode() {
      const cfg = this._config || {};
      if (cfg.swing_h_entity && this._st(cfg.swing_h_entity)) return { kind: "switch", ref: cfg.swing_h_entity };
      const sib = this._siblings();
      if (sib.swing_h && this._st(sib.swing_h)) return { kind: "switch", ref: sib.swing_h };
      const s = this._st(cfg.entity);
      const sm = s && s.attributes && s.attributes.swing_horizontal_modes;
      if (Array.isArray(sm) && sm.length) return { kind: "climate", ref: cfg.entity };
      return { kind: null, ref: null };
    }
    _swingHResolved() {
      const cfg = this._config && this._config.show_swing_h;
      if (cfg === true) return true;
      if (cfg === false) return false;
      return !!this._swingHMode().kind;
    }
    _swingHModesList() {
      const s = this._st(this._config && this._config.entity);
      const l = s && s.attributes && s.attributes.swing_horizontal_modes;
      return Array.isArray(l) ? l.filter((x) => typeof x === "string") : [];
    }
    _swingHIsOn() {
      const m = this._swingHMode();
      if (!m.kind) return false;
      if (m.kind === "switch") {
        const st = this._st(m.ref);
        return !!(st && String(st.state).toLowerCase() === "on");
      }
      const s = this._st(m.ref);
      const cur = s && s.attributes && s.attributes.swing_horizontal_mode;
      return !!cur && String(cur).toLowerCase() !== "off";
    }
    // Same contract as the vertical chip: never write a value that is not a member
    // of the entity's own list, and cycle when the list carries no off member.
    _swingHToggle() {
      const m = this._swingHMode();
      if (!m.kind || !this._hass) return;
      if (m.kind === "switch") {
        this._svc("switch", this._swingHIsOn() ? "turn_off" : "turn_on", { entity_id: m.ref }, () => this._render());
        this._render();
        return;
      }
      const modes = this._swingHModesList();
      if (!modes.length) return;
      const s = this._st(m.ref);
      const cur = s && s.attributes && s.attributes.swing_horizontal_mode;
      const offMode = modes.find((x) => String(x).toLowerCase() === "off");
      let next;
      if (offMode) {
        next = this._swingHIsOn() ? offMode : (modes.find((x) => x !== offMode) || offMode);
      } else {
        const i = modes.findIndex((x) => String(x) === String(cur));
        next = modes[(i + 1) % modes.length] || modes[0];
      }
      this._svc("climate", "set_swing_horizontal_mode",
        { entity_id: this._config.entity, swing_horizontal_mode: next }, () => this._render());
      this._render();
    }

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
    // The entity's own swing_modes for the CLIMATE branch (empty for switch/none).
    // The picker + long-press gate read this, so a switch-backed device (Midea)
    // and a device with no swing_modes never expose the position picker.
    _swingModesList() {
      const m = this._swingMode();
      if (m.kind !== "climate") return [];
      const st = this._st(m.ref);
      const sm = st && st.attributes && st.attributes.swing_modes;
      return Array.isArray(sm) ? sm : [];
    }
    // Effective swing position (CLIMATE branch): the optimistic pick while it is held
    // (until reconciled or OPT_HOLD_MS), otherwise the live swing_mode. Null for the
    // switch branch so Midea keeps its plain on/off label.
    _swingEffMode() {
      const m = this._swingMode();
      if (m.kind !== "climate") return null;
      const o = this._optSwingPos;
      if (o && Date.now() < o.until) return o.mode;
      const st = this._st(m.ref);
      return (st && st.attributes && st.attributes.swing_mode) || null;
    }
    // Chip caption: the live/optimistic position value when a climate swing is ON,
    // else the localized SWING word. Switch-backed swing always reads SWING.
    _swingLabelText() {
      const def = this._t("swing");
      const m = this._swingMode();
      if (m.kind !== "climate") return def;
      const eff = this._swingEffMode();
      if (!eff || String(eff).toLowerCase() === "off") return def;
      return String(eff);
    }
    // Record the optimistic position we just asked for so the label + accent flip
    // instantly, and drop the stale on/off boolean hold (the position supersedes it).
    _setOptSwingPos(mode) {
      this._optSwingPos = { mode: mode, until: Date.now() + OPT_HOLD_MS };
      if (this._optToggle) this._optToggle.swing = null;
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
      // next real swing_mode. Never send a value outside swing_modes. Cycling is
      // optimistic-aware (reads the effective position) so rapid taps keep advancing.
      const st = this._st(m.ref);
      const modes = (st && st.attributes && st.attributes.swing_modes) || [];
      const onMode = modes.find((x) => String(x).toLowerCase() !== "off") || modes[0] || "vertical";
      const eff = this._swingEffMode();
      const effOn = !!(eff && String(eff).toLowerCase() !== "off");
      const offMode = modes.find((x) => String(x).toLowerCase() === "off");
      let target = null;
      if (offMode) {
        target = effOn ? offMode : onMode;
      } else if (modes.length) {
        const i = modes.findIndex((x) => String(x) === String(eff));
        target = modes[(i + 1) % modes.length];
      }
      if (target != null) { this._setOptSwingPos(target); this._svcSetSwingMode(target); }
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
      // CLIMATE-backed swing has no on/off boolean hold; its accent tracks the
      // effective (optimistic-or-live) position so a vane-position cycle lights the
      // chip instantly and only reads OFF when the position is a real off member.
      if (kind === "swing" && this._swingMode().kind === "climate") {
        const eff = this._swingEffMode();
        return !!(eff && String(eff).toLowerCase() !== "off");
      }
      const o = this._optToggle && this._optToggle[kind];
      if (o && Date.now() < o.until) return o.val;
      return this._liveFeatureOn(kind);
    }
    _featureToggle(kind) {
      if (kind === "swing") {
        // Climate branch: the cycle sets its own optimistic POSITION (label + accent);
        // switch branch (Midea): keep the plain optimistic on/off boolean, unchanged.
        if (this._swingMode().kind === "climate") {
          this._swingToggle();
          this._paintPop();
          this._announce(this._t("swing") + " " + this._swingLabelText());
        } else {
          this._optToggle = this._optToggle || {};
          this._optToggle.swing = { val: !this._swingIsOn(), until: Date.now() + OPT_HOLD_MS };
          this._paintPop();
          this._announce(this._t("swing") + " " + this._t(this._optToggle.swing.val ? "on" : "off"));
          this._swingToggle();
        }
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
      if (s === "unavailable") return false;
      // A select is usable whenever it advertises options, even when no option is
      // chosen yet (state "unknown", common on Tuya wind/mode selects): a tap just
      // picks the first option. Only a truly "unavailable" entity is inert.
      if (this._xIsSelect(it)) {
        const opts = st.attributes && st.attributes.options;
        return Array.isArray(opts) && opts.length > 0;
      }
      return s !== "unknown";
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

    // ---- face VERTICAL SWING chip: short tap cycles, long-press opens the picker ----
    // A press starts a hold timer; releasing before SWING_HOLD_MS cycles, holding past
    // it opens the position picker and suppresses the release tap. The picker only arms
    // when the CLIMATE swing exposes 2+ real members (switch-backed Midea never picks).
    _swingPointerDown(e) {
      e.stopPropagation();
      e.preventDefault();
      const m = this._swingMode();
      if (!m.kind || !this._hass) return;
      this._swingLongPressed = false;
      this._swingPressActive = true;
      const canPick = m.kind === "climate" && this._swingModesList().length >= 2;
      if (this._swingHoldTimer) { clearTimeout(this._swingHoldTimer); this._swingHoldTimer = null; }
      if (canPick) {
        // Capture the pointer so the release still lands on the chip if the finger
        // drifted a few pixels; a real scroll fires pointercancel and drops the hold.
        try { if (e.pointerId != null && this._refs.swingChip && this._refs.swingChip.setPointerCapture) this._refs.swingChip.setPointerCapture(e.pointerId); } catch (err) {}
        this._swingHoldTimer = setTimeout(() => {
          this._swingHoldTimer = null;
          if (!this._swingPressActive) return; // released/cancelled before the hold landed
          this._swingLongPressed = true;
          this._openSwingPicker();
        }, SWING_HOLD_MS);
      }
    }
    _swingPointerUp(e) {
      if (!this._swingPressActive) return;
      this._swingPressActive = false;
      try { if (e && e.pointerId != null && this._refs.swingChip && this._refs.swingChip.releasePointerCapture) this._refs.swingChip.releasePointerCapture(e.pointerId); } catch (err) {}
      if (this._swingHoldTimer) { clearTimeout(this._swingHoldTimer); this._swingHoldTimer = null; }
      if (this._swingLongPressed) { this._swingLongPressed = false; return; } // picker opened -> swallow the tap
      if (e) { e.stopPropagation(); e.preventDefault(); }
      this._featureToggle("swing");
      this._render(); // optimistic face repaint
    }
    // A cancelled press (scroll took over, pointer left) drops the hold without cycling.
    _swingPointerCancel() {
      this._swingPressActive = false;
      this._swingLongPressed = false;
      if (this._swingHoldTimer) { clearTimeout(this._swingHoldTimer); this._swingHoldTimer = null; }
    }

    // ---- swing POSITION picker (long-press): a small modal, styled like the mode popup ----
    _buildSwingPicker() {
      if (this._refs.swingPop) return;
      const card = this.shadowRoot && this.shadowRoot.querySelector(".ct-card");
      if (!card) return;
      const pop = document.createElement("div");
      pop.className = "ct-pop ct-swingpop";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-modal", "true");
      pop.setAttribute("aria-label", "Select swing position");
      pop.addEventListener("click", (e) => { if (e.target === pop) this._closeSwingPicker(); });
      const sheet = document.createElement("div");
      sheet.className = "ct-sheet ct-swingsheet";
      pop.appendChild(sheet);
      this._onSwingPickClick = (e) => {
        const b = e.target && e.target.closest ? e.target.closest("button[data-swingopt]") : null;
        if (!b) return;
        e.stopPropagation();
        this._pickSwingMode(b.dataset.swingopt);
      };
      sheet.addEventListener("click", this._onSwingPickClick);
      // Escape closes the picker regardless of where focus sits (mirrors the mode popup).
      this._onSwingDocKeydown = (e) => {
        if (this._swingPickerOpen && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this._closeSwingPicker(); }
      };
      card.appendChild(pop);
      this._refs.swingPop = pop;
      this._refs.swingSheet = sheet;
    }
    _openSwingPicker() {
      const m = this._swingMode();
      const modes = this._swingModesList();
      if (m.kind !== "climate" || modes.length < 2 || !this._hass) return;
      this._buildSwingPicker();
      const sheet = this._refs.swingSheet;
      if (!sheet) return;
      sheet.innerHTML = "";
      const cur = this._swingEffMode();
      modes.forEach((opt) => {
        const b = document.createElement("button");
        b.dataset.swingopt = String(opt);
        b.textContent = String(opt);
        const active = String(opt) === String(cur);
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
        sheet.appendChild(b);
      });
      this._swingPickerOpen = true;
      this._refs.swingPop.classList.add("open");
      if (this._onSwingDocKeydown) document.addEventListener("keydown", this._onSwingDocKeydown, true);
      const target = sheet.querySelector("button.active") || sheet.querySelector("button");
      if (target) requestAnimationFrame(() => { try { target.focus(); } catch (err) {} });
    }
    // Pick an exact member: optimistic label + accent flip now, then set_swing_mode.
    _pickSwingMode(mode) {
      const modes = this._swingModesList();
      if (!this._hass || !modes.some((x) => String(x) === String(mode))) { this._closeSwingPicker(); return; }
      this._setOptSwingPos(mode);
      this._svcSetSwingMode(mode);
      this._announce(this._t("swing") + " " + String(mode));
      if (this._popOpen) this._paintPop();
      this._render();
      this._closeSwingPicker();
    }
    _closeSwingPicker() {
      this._swingPickerOpen = false;
      if (this._refs.swingPop) this._refs.swingPop.classList.remove("open");
      if (this._onSwingDocKeydown) document.removeEventListener("keydown", this._onSwingDocKeydown, true);
      if (this._refs.swingChip) { try { this._refs.swingChip.focus(); } catch (err) {} }
    }

    // ============================================================================
    // SETPOINT STEPPERS
    // ============================================================================
    // Tri-state like every other visibility flag. Auto shows the pair whenever the
    // dial has ONE setpoint to move; a heat_cool dial has two, so a bare plus and
    // minus would be ambiguous and the pair stays hidden there.
    _steppersResolved() {
      const cfg = this._config && this._config.show_steppers;
      if (cfg === false) return false;
      if (cfg === true) return !this._isHeatCool();
      return !this._isHeatCool();
    }
    _stepPointerDown(e, dir) {
      if (e.button && e.button !== 0) return;
      const s = this._st(this._config.entity);
      if (!s || s.state === "off" || s.state === "unavailable" || s.state === "unknown") return;
      e.preventDefault(); e.stopPropagation(); // never let the center disc see this
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      this._stepOnce(dir);
      this._stepPointerUp(); // clear any stale timers before arming new ones
      this._stepDelayT = setTimeout(() => {
        this._stepRepeatT = setInterval(() => this._stepOnce(dir), STEP_REPEAT_MS);
      }, STEP_REPEAT_DELAY_MS);
    }
    _stepPointerUp() {
      if (this._stepDelayT) { clearTimeout(this._stepDelayT); this._stepDelayT = null; }
      if (this._stepRepeatT) { clearInterval(this._stepRepeatT); this._stepRepeatT = null; }
    }
    // One tick. Paints optimistically every time; the WRITE is trailing-debounced
    // so a long hold produces a single set_temperature at the value you stopped on.
    _stepOnce(dir) {
      if (!this._hass) return;
      const s = this._st(this._config.entity);
      if (!s || s.state === "off" || s.state === "unavailable" || s.state === "unknown") return;
      if (this._isHeatCool()) return;
      const { lo, hi } = this._range();
      const step = this._step();
      const optActive = this._optimisticUntil && Date.now() < this._optimisticUntil && this._optimisticTarget != null;
      const cur = optActive ? this._optimisticTarget : this._toDisplay(num((s.attributes || {}).temperature));
      if (cur == null) return;
      const next = clamp(Math.round((cur + dir * step) / step) * step, lo, hi);
      if (next === cur) return; // already against the rail
      this._optimisticTarget = next;
      this._optimisticUntil = Date.now() + OPT_HOLD_MS;
      this._paintTempArc(next);
      this._stepPending = next;
      if (this._stepCommitT) clearTimeout(this._stepCommitT);
      this._stepCommitT = setTimeout(() => {
        this._stepCommitT = null;
        const v = this._stepPending;
        this._stepPending = null;
        if (v == null) return;
        this._announce(this._fmtDisplay(v) + "° " + this._unitWord());
        this._callTemp(v);
      }, STEP_COMMIT_MS);
    }

    // ============================================================================
    // PRESET MODES
    // Driven entirely by the entity's own `preset_modes` list and written with
    // climate.set_preset_mode, so this works on any integration that advertises
    // presets (Midea eco / boost / sleep / comfort, Tado, ecobee, Nest, TRVs)
    // with no per-brand knowledge in the card.
    // ============================================================================
    _presetModes() {
      const s = this._st(this._config && this._config.entity);
      const list = s && s.attributes && s.attributes.preset_modes;
      return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
    }
    // Tri-state like the feature chips: true forces the row, false hides it,
    // unset / "auto" shows it only when the entity actually advertises presets.
    _presetsResolved() {
      const cfg = this._config && this._config.show_presets;
      if (cfg === true) return true;
      if (cfg === false) return false;
      return this._presetModes().length > 0;
    }
    // Active preset, honoring a short optimistic hold so a tap lights instantly.
    _presetActive() {
      if (this._optimisticPresetUntil && Date.now() < this._optimisticPresetUntil) return this._optimisticPreset;
      const s = this._st(this._config && this._config.entity);
      return (s && s.attributes && s.attributes.preset_mode) || null;
    }
    // Display label: a preset_names override wins, else the entity's own value
    // with underscores opened up and the first letter raised.
    _presetName(p) {
      const map = (this._config && this._config.preset_names) || {};
      if (map && typeof map[p] === "string" && map[p].trim()) return map[p].trim();
      const raw = String(p).replace(/_/g, " ");
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    // "" unless the live preset is a real member of this entity's preset_modes.
    _presetKnown() {
      const p = this._presetActive();
      if (p == null || p === "") return "";
      return this._presetModes().some((x) => String(x) === String(p))
        ? String(p).toUpperCase() : "";
    }

    _setPreset(p) {
      if (!this._hass) return;
      if (!this._presetModes().some((x) => String(x) === String(p))) return; // never write a non-member
      this._optimisticPreset = p;
      this._optimisticPresetUntil = Date.now() + OPT_HOLD_MS;
      if (this._popOpen) this._paintPop();
      this._render();
      this._svcSetPresetMode(p);
      this._announce(this._t("preset") + " " + this._presetName(p));
    }

    // ---- service-call signatures preserved for contract parity (failure-aware) ----
    _svcSetSwingMode(v) { this._svc("climate", "set_swing_mode", { entity_id: this._config.entity, swing_mode: v }, () => this._revertToggle("swing")); }
    _svcSetPresetMode(v) { this._svc("climate", "set_preset_mode", { entity_id: this._config.entity, preset_mode: v }, () => this._revertPreset()); }
    // Drop the optimistic preset so a rejected call snaps back to live state
    // instead of leaving the wrong chip lit for the whole OPT_HOLD_MS window.
    _revertPreset() {
      this._optimisticPreset = null;
      this._optimisticPresetUntil = 0;
      if (this._popOpen) this._paintPop();
      this._render();
    }
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
      // Visible close affordance (issue #21). Escape and a backdrop click already
      // closed the dialog, but neither is discoverable on a wall tablet.
      const closeBtn = document.createElement("button");
      closeBtn.className = "ct-popclose";
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", this._t("close"));
      closeBtn.title = this._t("close");
      closeBtn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" ' +
        'stroke-width="2.4" stroke-linecap="round"/></svg>';
      closeBtn.addEventListener("click", (e) => { e.stopPropagation(); this._closePop(); });
      sheet.appendChild(closeBtn);
      this._refs.popClose = closeBtn;

      modes.forEach((m) => {
        const b = document.createElement("button");
        b.dataset.mode = m; // raw hvac_mode value (service payload), never localized
        b.textContent = this._modeName(m); // CSS uppercases; HA localizes the name
        // Light the active button in that MODE's own color rather than one global
        // accent, so the popup reads as part of the same instrument as the dial.
        b.style.setProperty("--ct-lit", this._modeColor(m));
        sheet.appendChild(b);
      });
      // PRESET ROW: one chip per member of the entity's own preset_modes, between
      // the modes and the feature chips. Rebuilt in _paintPop when the entity's
      // list changes, since presets can appear late or swap with the entity.
      const prow = document.createElement("div");
      prow.className = "ct-presets";
      this._refs.presetRow = prow;
      this._refs.presetBtns = {};
      this._presetsBuiltFor = null;
      sheet.appendChild(prow);

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
          // Preset chips set a preset and KEEP the popup open, like the toggles.
          if (b.dataset.preset != null) { this._setPreset(b.dataset.preset); return; }
          if (b.classList.contains("ct-popclose")) return; // has its own handler
          if (b.dataset.mode == null) return;              // never write undefined
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
      // PRESET ROW: rebuild when the entity's own list changes, then light the one
      // that is active. Hidden entirely when the entity advertises no presets.
      if (this._refs.presetRow) {
        const row = this._refs.presetRow;
        const list = this._presetModes();
        const sig = list.join(" ");
        if (this._presetsBuiltFor !== sig) {
          this._presetsBuiltFor = sig;
          row.innerHTML = "";
          this._refs.presetBtns = {};
          list.forEach((p) => {
            const b = document.createElement("button");
            b.className = "ct-preset";
            b.dataset.preset = p;
            b.textContent = this._presetName(p);
            row.appendChild(b);
            this._refs.presetBtns[p] = b;
          });
        }
        const show = this._presetsResolved() && list.length > 0;
        row.style.display = show ? "" : "none";
        if (show) {
          const cur = this._presetActive();
          list.forEach((p) => {
            const b = this._refs.presetBtns[p];
            if (!b) return;
            b.textContent = this._presetName(p); // keep a renamed label live
            const active = String(p) === String(cur);
            b.classList.toggle("active", active);
            b.setAttribute("aria-pressed", active ? "true" : "false");
          });
        }
      }

      // TOGGLES ROW: hide an unresolved chip; else lit ".on" = feature on.
      if (this._refs.toggles) {
        TOGGLE_DEFS.forEach((t) => {
          const b = this._refs.toggles[t.kind];
          if (!b) return;
          const lb = b.querySelector(".ct-tg-lb");
          // Swing chip shows its live/optimistic position; led/sound keep their words.
          if (lb) lb.textContent = (t.kind === "swing") ? this._swingLabelText() : this._t(t.kind);
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
            const st = this._st(it.entity);
            const opts = (st && st.attributes && st.attributes.options) || [];
            const cur = this._xCurOpt(it);
            // Show the live option only when it is a real member; a not-yet-chosen
            // select (state "unknown") shows the name instead of the word "unknown".
            const shown = (cur != null && opts.indexOf(cur) >= 0) ? cur : name;
            b.classList.remove("on");
            b.removeAttribute("aria-pressed");
            ref.lb.textContent = shown;
            b.setAttribute("aria-label", name + ": " + shown);
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
      // The face reads this. During a drag _paintTempArc runs without a full
      // render, so it also repaints the four groups a drag actually moves.
      this._faceSet = t;
      if (this._refs.face && this._faceOn !== false) {
        const fs = this._faceState(t);
        this._syncFaceInk(fs.mode);
        this._paintFaceMoving(FACE.angleOf(fs.set, fs.min, fs.max),
          FACE.angleOf(fs.room, fs.min, fs.max), fs);
      }
      const disp = this._fmtDisplay(t); // visible, locale-formatted (issue #19)
      this._refs.bigNum.textContent = disp;
      // shrink for "XX.5" / 3-digit so the decimal fits the center.
      // Shrink when the string is long OR when the humidity line is pushing down from
      // above; 100 at y264 already reaches the chip row at y340 on its own.
      const rhOn = this._refs.rhCap && this._refs.rhCap.style.display !== "none";
      this._refs.bigNum.setAttribute("font-size", disp.length > 2 ? "70" : (rhOn ? "74" : "84"));
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
      this._refs.bigNum.setAttribute("font-size", plain.length > 8 ? "38" : "48");
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

    // ---- FACE ------------------------------------------------------------
    // Everything visible on the dial comes from FACE. The card supplies state and
    // wiring only. Each group is regenerated on its own, so a temperature drag
    // restrings four small groups rather than the whole face.

    // The legacy hand built face is switched off in one place. Kept in the tree
    // because the old paint sites still write to those refs; hiding them is cheaper
    // and far less risky than unpicking a dozen call sites, and it makes the swap
    // revertible by deleting one list.
    _hideLegacyFace() {
      this._faceHidden = true;
      /* The little spinning fan is the one piece of the original face worth keeping
         on the new one, so it is switched off by default and kept by asking. It sits
         at 212,296, clear of the status line and above the rail. */
      const keepClover = this._config && this._config.fan_clover === true;
      LEGACY_FACE_NODES.filter((k) => !(keepClover && k === "clover")).forEach((k) => {
        const n = this._refs[k];
        if (n && n.style) n.style.display = "none";
      });
      // The legacy steppers are kept because they carry the press-and-repeat
      // handlers; only their painted circle and glyph are switched off, and the
      // group stays as the hit target over the new ones.
      (this._refs.steps || []).forEach((x) => {
        [...x.g.childNodes].forEach((n) => { if (n.style) n.style.display = "none"; });
      });
    }

    /* The exact inverse, for the one state that has to go back to the original
       face. It only CLEARS the inline display, it does not force anything on, so
       the per-feature visibility decisions further down _render still win. That is
       why it has to run before them and not after. */
    _showLegacyFace() {
      this._faceHidden = false;
      LEGACY_FACE_NODES.forEach((k) => {
        const n = this._refs[k];
        if (n && n.style) n.style.display = "";
      });
      (this._refs.steps || []).forEach((x) => {
        [...x.g.childNodes].forEach((n) => { if (n.style) n.style.display = ""; });
      });
    }

    _faceMode() {
      const st = this._st(this._config && this._config.entity);
      const raw = st ? String(st.state) : "off";
      return FACE.MODES[raw] ? raw : (raw === "heat_cool" ? "auto" : "off");
    }

    // fanPct is 1..100 or null, and null means AUTO. AUTO draws no handle: a chevron
    // parked at the arc end while the cell reads AUTO was the bug this replaces.
    /* The fan reading the face draws.
       It has to resolve exactly the way _render resolves the legacy ring, because
       _paintFace runs at the END of a render and would otherwise overwrite what the
       drag just painted. That is what made the marker jump back to where it started
       while the finger was still down: any state push from anywhere in the house
       repainted the face from the COMMITTED value, and the value only reappeared on
       release when the device finally reported it.

       Two things follow from mirroring _render rather than reading state directly:
       an optimistic hold wins, and a fan sitting in auto is the absence of a value
       rather than whatever number the speed entity happens to hold underneath. */
    /* Is there a fan on this card at all? One answer, used by the paint, the rail,
       the grab band and the glyph, because four copies of it is how a hidden ring
       ends up with a live drag band underneath it. */
    _haveFan() {
      const v = this._config && this._config.show_fan;
      if (v === true) return true;
      if (v === false) return false;
      return !!(this._fanUsesNumber() || this._fanNamedModes().length);
    }

    /* Can this unit take a fan speed RIGHT NOW?

       Measured on the hardware, not assumed: in hvac auto it refuses set_fan_mode and
       a write to the speed entity alike, and Home Assistant reports both as
       successful. Nothing rejects, so the failure path never runs, and the card
       showed the refused value confidently for the whole optimistic hold before
       snapping back with no explanation. It also announced it to a screen reader.

       The test is deliberately narrow and every part of it comes from the device: the
       mode is auto AND the device is reporting no speed of its own. A unit that
       really does take a fan speed in auto reports one, so this never fires on it,
       and nothing here is keyed to a vendor. Live state only: reading through the
       optimistic hold would let a refused gesture authorise the next one. */
    _fanSettable() {
      const s = this._st(this._config && this._config.entity);
      if (!s || s.state === "off" || s.state === "unavailable" || s.state === "unknown") return false;
      if (!this._haveFan()) return false;
      if (String(s.state).toLowerCase() !== "auto") return true;
      const rng = this._fanNumRange();
      if (rng) return !this._faceNumUnset(rng);
      return String((s.attributes || {}).fan_mode || "").toLowerCase() !== "auto";
    }

    _facePct() {
      const st = this._st(this._config && this._config.entity);
      const a2 = (st && st.attributes) || {};
      const optActive = this._optimisticFanUntil && Date.now() < this._optimisticFanUntil;
      const rng = this._fanNumRange();
      if (optActive && this._optimisticFanPct != null) {
        const r = rng || { min: FAN_MIN, max: FAN_MAX };
        return clamp(Math.round(((this._optimisticFanPct - r.min) / ((r.max - r.min) || 1)) * 100), 1, 100);
      }
      if (optActive && this._optimisticFanName != null) {
        return this._faceNamedPct(this._optimisticFanName, a2);
      }
      if (rng) return this._faceNumPct(rng);
      const fm = a2.fan_mode;
      if (!fm || String(fm).toLowerCase() === "auto") return null;
      return this._faceNamedPct(fm, a2);
    }

    /* A numeric fan has no speed when its own entity is parked OUTSIDE its declared
       range, which is how these drivers say auto: the speed entity reads 101 against
       a 1..100 number. Keying this on the MODE WORD instead was wrong, and it is what
       left the ring stuck in the auto state after a speed had been set: writing a
       speed moves the number, and the mode can still report auto for a while
       afterwards, or on some units for good. A real speed is a real speed whatever
       the mode says. */
    _faceNumUnset(rng) {
      const fs = this._fanNumState();
      const v = fs ? num(fs.state) : null;
      return v == null || v < rng.min || v > rng.max;
    }
    _faceNumPct(rng) {
      if (this._faceNumUnset(rng)) return null;
      const v = num((this._fanNumState() || {}).state);
      return clamp(Math.round(((v - rng.min) / ((rng.max - rng.min) || 1)) * 100), 1, 100);
    }

    // position in the entity's own list, auto excluded, as a percentage
    _faceNamedPct(name, a2) {
      if (!name || String(name).toLowerCase() === "auto") return null;
      const list = Array.isArray(a2.fan_modes)
        ? a2.fan_modes.filter((x) => String(x).toLowerCase() !== "auto") : [];
      if (!list.length) return null;
      const i = list.findIndex((x) => String(x).toLowerCase() === String(name).toLowerCase());
      if (i < 0) return null;
      return clamp(Math.round(((i + 1) / list.length) * 100), 1, 100);
    }

    /* Which buttons the bottom row carries, and in what order.

       `rail` is its OWN key on purpose. show_fan, show_swing, show_led and show_sound
       are dual-surface: they gate the popup chips as well as this row, so retiring
       them into an ordering key would have silently destroyed popup config for anyone
       already using them. They still decide whether a feature EXISTS; `rail` only
       decides whether it appears down here and where. A name for a feature this
       entity does not have is skipped rather than drawn dead, so a shared rail across
       a house of mixed units degrades per card instead of lying on some of them. */
    _railOrder() {
      const want = this._config && this._config.rail;
      if (!Array.isArray(want) || !want.length) return null;
      const seen = {};
      return want
        .map((k) => String(k).toLowerCase().trim())
        .filter((k) => k && !seen[k] && (seen[k] = true));
    }

    _faceCells() {
      const all = this._faceCellsAvailable();
      const order = this._railOrder();
      if (!order) return all;
      const by = {};
      all.forEach((c) => { by[c.key] = c; });
      const out = [];
      order.forEach((k) => { if (by[k]) out.push(by[k]); });
      return out;
    }

    _faceCellsAvailable() {
      const out = [];
      const pct = this._facePct();
      // NOT _featureResolved("fan"): that helper only knows swing, led and sound and
      // silently falls through to the sound switch for anything else, so the fan cell
      // was gated on a beep entity existing. show_fan is the key that governs it.
      if (this._haveFan()) {
        out.push({ key: "fan", value: pct == null ? "AUTO" : pct + "%", caption: "FAN",
          lit: pct != null, widest: "100%" });
      }
      if (this._featureResolved("swing") !== false) {
        const on = this._featureOn("swing");
        out.push({ key: "swing", value: on ? "ON" : "OFF", caption: "SWING", lit: on, widest: "OFF" });
      }
      if (this._featureResolved("led") !== false && this._ledRef()) {
        const on = this._featureOn("led");
        out.push({ key: "led", value: on ? "ON" : "OFF", caption: "LED", lit: on, widest: "OFF" });
      }
      if (this._featureResolved("sound") !== false && this._soundRef && this._soundRef()) {
        const on = this._featureOn("sound");
        out.push({ key: "sound", value: on ? "ON" : "OFF", caption: "SOUND", lit: on, widest: "OFF" });
      }
      (this._extraToggles || []).slice(0, 3).forEach((it, i) => {
        const st = this._st(it.entity);
        if (!st) return;
        const on = st.state === "on";
        out.push({ key: "extra:" + i, value: on ? "ON" : "OFF", widest: "OFF", lit: on,
          caption: String(it.name || it.entity.split(".")[1]).toUpperCase().slice(0, 8) });
      });
      return out;
    }

    _faceState(setOverride) {
      const st = this._st(this._config && this._config.entity);
      const a2 = (st && st.attributes) || {};
      const r = this._range();
      const set = setOverride != null ? setOverride : this._faceSet;
      const room = this._toDisplay(num(a2.current_temperature));
      const act = String(a2.hvac_action || "").toUpperCase();
      const fallback = set == null ? r.lo : set;
      return {
        mode: this._faceMode(),
        action: act || undefined,
        set: fallback,
        room: room == null ? fallback : room,
        min: r.lo, max: r.hi,
        fanPct: this._facePct(),
        // _presetActive holds the optimistic value, so tapping a preset shows its
        // glyph immediately instead of waiting for the device to report back.
        // Only a preset the entity actually advertises. presetGlyph falls back to
        // the first LETTER of anything it has no glyph for, so a transient value the
        // device reports mid mode-change painted a bare "A" beside the status word,
        // which tells a user nothing.
        preset: this._presetKnown(),
        fanStyle: this._fanStyle || "silk",
        cells: this._faceCells(),
      };
    }

    // Full repaint, from _render. Not from a drag.
    /* Which way round is the ground? The face's neutral ink already follows
       --primary-text-color, but two things cannot: the rail's LIT value, which the
       module lifts toward white so it clears its own tinted fill, and the mode word,
       whose ink is a saturated cyan or amber picked against a dark card. Both wash
       out on a light theme. CSS alone cannot tell the two cases apart, because HA
       sets no light/dark flag and prefers-color-scheme does not follow a hand-picked
       HA theme, so read the resolved text colour back and stamp the answer. .ct-card
       carries color:var(--ct-face-ink) purely so this returns a resolved rgb(). */
    _inkGround(card) {
      try {
        const m = /([0-9.]+)[^0-9.]+([0-9.]+)[^0-9.]+([0-9.]+)/.exec(getComputedStyle(card).color);
        if (!m) return "dark";
        // Rec.709 on the TEXT colour: dark text means a light ground.
        const l = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
        return l < 0.5 ? "light" : "dark";
      } catch (e) { return "dark"; }
    }

    /* The face keeps the module's own palette, which is the design Ricky picked,
       with two exceptions.

       AUTO ships mint in the module and nothing on this card is green, so it takes
       the card's own warm yellow, which is what the card has always drawn for that
       mode and what every other yellow-on state in the house uses. DRY follows for
       the same reason: the module's amber is a shade of that same yellow, so with
       AUTO corrected the two modes stopped being tellable apart.

       And a mode_colors entry the user actually configured has coloured this card
       since it shipped. The face carrying its own table would drop that silently,
       so an explicit override still wins. An unset mode is left alone: seeding from
       _modeColor would repaint every mode in the card palette, which is a different
       design, not a fix.

       The pale companion is the ink lifted 55% toward white, which is what the
       module's own pairs are, and it only ever has to clear the cell's own tinted
       fill on a dark ground. */
    _syncFaceInk(mode) {
      const m = FACE.MODES[mode];
      if (!m) return;
      if (!m.base) m.base = { ink: m.ink, light: m.light };
      const cfg = (this._config && this._config.mode_colors) || {};
      const want = toColor(cfg[mode]) ||
        (mode === "auto" || mode === "dry" ? MODE_COLORS[mode] : null);
      if (!want) { m.ink = m.base.ink; m.light = m.base.light; return; }
      const rgb = colorToRgb(want);
      if (!rgb) { m.ink = m.base.ink; m.light = m.base.light; return; }
      m.ink = want;
      m.light = "rgb(" + rgb.map((c) => Math.round(c + (255 - c) * 0.55)).join(",") + ")";
    }

    /* The fan ring under the finger.

       _paintFanPct and _paintFanNamed write to fanFill, fanHandle, fanPct and
       fanName, every one of which _hideLegacyFace switches off, so on the new face a
       fan drag moved nothing at all: the ring sat still and jumped to its new place
       on release, when the next full render redrew it. The temp band never had this
       because _paintTempArc already calls _paintFaceMoving.

       Cheap enough to run per pointermove: one innerHTML for the ring and one for the
       rail, which is what a temp drag already costs five of. The cache key is cleared
       rather than updated, because what is drawn no longer matches any state the card
       has committed and the next full render has to redraw it. */
    _paintFaceFan(pct, label) {
      if (!this._refs.faceFan || this._faceOn === false) return;
      const st = this._faceState();
      this._faceFanKey = null;
      if (this._haveFan()) {
        const draw = FACE.FAN_STYLES[st.fanStyle] || FACE.FAN_STYLES.original;
        this._refs.faceFan.innerHTML = draw(FACE_RING(pct), st.mode, pct == null);
      }
      // the rail's FAN cell is the same reading in words
      if (this._refs.faceRail) {
        const cells = st.cells.map((c) => (c.key === "fan"
          ? Object.assign({}, c, { value: label, lit: pct != null }) : c));
        this._refs.faceRail.innerHTML = FACE.rail(cells, st.mode);
        this._faceCellKeys = cells.map((c) => c.key);
      }
    }

    _paintFace() {
      if (!this._refs.face || this._faceOn === false) return;
      const inkCard = this.shadowRoot && this.shadowRoot.querySelector(".ct-card");
      const st = this._faceState();
      this._syncFaceInk(st.mode);
      if (inkCard) {
        inkCard.setAttribute("data-ink", this._inkGround(inkCard));
        // the light-ground rule mixes the mode word toward the card ink, so it needs
        // the module's ink for THIS mode, not the card's own accent map.
        inkCard.style.setProperty("--ct-mode-ink",
          (FACE.MODES[st.mode] || FACE.MODES.off).ink);
      }
      // show_scale and show_current are config keys the card has always honoured.
      // The face drew both unconditionally, so turning either off did nothing.
      const wantScale = this._config.show_scale !== false;
      const key = st.min + ":" + st.max + ":" + wantScale;
      const setA = FACE.angleOf(st.set, st.min, st.max);
      const roomA = FACE.angleOf(st.room, st.min, st.max);
      // The scale and the steppers depend only on the range, so they are not
      // restrung on every state change.
      if (this._faceScaleKey !== key) {
        this._faceScaleKey = key;
        this._refs.faceScale.innerHTML = wantScale
          ? FACE.ticks(st.min, st.max) + FACE.scaleNumerals(st.min, st.max)
          : "";
        this._refs.faceStep.innerHTML = FACE.steppers();
      }
      // show_fan hides the ring AND its rail cell together. Before this it only
      // removed the button, while the label promised it controlled the ring.
      const wantFan = this._haveFan();
      const fanKey = [st.fanStyle, st.fanPct, st.mode, wantFan].join("|");
      if (this._faceFanKey !== fanKey) {
        this._faceFanKey = fanKey;
        this._refs.faceFan.innerHTML = wantFan
          ? (FACE.FAN_STYLES[st.fanStyle] || FACE.FAN_STYLES.original)(
              FACE_RING(st.fanPct), st.mode, st.fanPct == null)
          : "";
      }
      this._paintFaceMoving(setA, roomA, st);
      this._faceCellKeys = st.cells.map((c) => c.key);
      this._refs.faceRail.innerHTML = FACE.rail(st.cells, st.mode);
      this._hideLegacyFace();
    }

    // The status cluster reserves space for the word with a flat 11.6 units per
    // character. COOLING at 16px with 3.4 tracking is wider than that, so the preset
    // glyph lands on the G. Measured here instead: the glyph is pushed to 12 units
    // past the real right edge of the word, then the whole cluster is re-centred on
    // 300. Font independent, so it survives a custom font too.
    /* The module sizes the setpoint for two digits. A half-degree step makes it
       four characters wide and it ran straight through both steppers, which is
       every Celsius user on a 0.5 step. The steppers sit at x 186 and 414 with
       r 27, so the clear span between them is 174; leave a little air and measure
       rather than guess, because the width depends on the theme font. */
    /* ROOM reads as the caption of the number above it, so it has to sit under the
       DIGITS. The value is centred as "79 degrees", which puts the digits half a
       degree glyph left of the string centre, and the caption inherits that offset.
       The glyph is its own tspan purely so this can measure it instead of guessing a
       width that changes with the theme font. */
    _centreRoomCaption() {
      const host = this._refs.faceRoom;
      if (!host) return;
      const deg = host.querySelector(".ct-deg");
      const cap = host.querySelectorAll("text")[1];
      if (!deg || !cap) return;
      let w;
      try { w = deg.getComputedTextLength(); } catch (e) { return; }   // not laid out yet
      if (!w) return;
      cap.setAttribute("x", (parseFloat(cap.getAttribute("x")) - w / 2).toFixed(1));
    }

    _fitHero() {
      const host = this._refs.faceCenter;
      if (!host) return;
      const t = host.querySelectorAll("text")[1];   // modeWord, hero, status
      if (!t) return;
      let b;
      try { b = t.getBBox(); } catch (e) { return; }   // not laid out yet
      if (!b || !b.width || b.width <= HERO_MAX_W) return;
      const size = Math.max(52, Math.floor(104 * (HERO_MAX_W / b.width)));
      t.setAttribute("font-size", String(size));
    }

    /* The status word is centred and its LENGTH changes with it: CIRCULATING is half
       again as wide as IDLE, so a glyph parked at a fixed x sat clear of one and
       straight through the other. Seat it against the MEASURED left edge instead, and
       drop it entirely when there is no room, because a glyph half on the band reads
       worse than one that is simply absent. */
    _placeClover() {
      const g = this._refs.clover;
      if (!g || !this._config || this._config.fan_clover !== true) return;
      // _render decided whether this card has a fan at all; do not overrule it
      if (!this._haveFan()) { g.style.display = "none"; return; }
      const host = this._refs.faceCenter;
      const grp = host && host.querySelector("g");
      if (!grp) return;
      let box;
      try { box = grp.getBBox(); } catch (e) { return; }
      if (!box || !box.width) return;
      const t = /translate\(([-0-9.]+)/.exec(grp.getAttribute("transform") || "");
      const x = (t ? parseFloat(t[1]) : 0) + box.x - 18;
      g.style.display = x < 150 ? "none" : "";
      g.setAttribute("transform", "translate(" + x.toFixed(1) + ",303)");
    }

    _fixStatusLine() {
      const host = this._refs.faceCenter;
      if (!host) return;
      const group = host.querySelector("g");
      if (!group) return;
      group.removeAttribute("transform");
      const word = group.querySelector("text");
      const glyph = group.querySelector("g");
      if (!word) return;
      let wb;
      try { wb = word.getBBox(); } catch (e) { return; }   // not laid out yet
      if (!wb || !wb.width) return;
      if (glyph) {
        const t = /translate\(([-0-9.]+)[ ,]+([-0-9.]+)\)/.exec(glyph.getAttribute("transform") || "");
        let gb;
        try { gb = glyph.getBBox(); } catch (e) { gb = null; }
        if (t && gb && gb.width) {
          // getBBox on the glyph group returns LOCAL coordinates, before its own
          // transform, while the word is a plain text in parent space. Add the
          // translate back in or the two are measured in different spaces and the
          // shift comes out enormous.
          const absLeft = parseFloat(t[1]) + gb.x;
          const shift = (wb.x + wb.width + 12) - absLeft;
          glyph.setAttribute("transform",
            "translate(" + (parseFloat(t[1]) + shift).toFixed(1) + "," + t[2] + ")");
        }
      }
      let all;
      try { all = group.getBBox(); } catch (e) { return; }
      if (!all || !all.width) return;
      const dx = CX - (all.x + all.width / 2);
      group.setAttribute("transform", "translate(" + dx.toFixed(1) + ",0)");
    }

    _onFaceClick(ev) {
      const t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      const step = t.closest("[data-act]");
      if (step) {
        ev.stopPropagation();
        this._stepOnce(step.getAttribute("data-act") === "up" ? 1 : -1);
        return;
      }
      const cell = t.closest("[data-cell]");
      if (!cell) return;
      ev.stopPropagation();
      const key = (this._faceCellKeys || [])[+cell.getAttribute("data-cell")];
      if (!key) return;
      if (key === "fan") { this._fanCloverTap(); return; }
      if (key === "swing" || key === "led" || key === "sound") {
        if (this._featureAvail(key)) this._featureToggle(key);
        return;
      }
      if (key.indexOf("extra:") === 0) this._xTap(+key.slice(6));
    }

    // The room reading owns its patch of the scale. Any numeral it lands on is
    // hidden, because the reading already states that value and two numbers on top
    // of each other state nothing. Measured from the rendered boxes, since the
    // overlap depends on glyph width and not on the radius alone.
    _declutterScale() {
      const scale = this._refs.faceScale, room = this._refs.faceRoom;
      if (!scale || !room) return;
      const nums = scale.querySelectorAll("text");
      nums.forEach((n) => { n.style.visibility = ""; });
      let box;
      try { box = room.getBBox(); } catch (e) { return; }   // not laid out yet
      if (!box || !box.width) return;
      const pad = 3;
      nums.forEach((n) => {
        let b2;
        try { b2 = n.getBBox(); } catch (e) { return; }
        const hit = b2.x < box.x + box.width + pad && b2.x + b2.width + pad > box.x
          && b2.y < box.y + box.height + pad && b2.y + b2.height + pad > box.y;
        if (hit) n.style.visibility = "hidden";
      });
    }

    // The parts a drag moves. Deliberately small.
    _paintFaceMoving(setA, roomA, st) {
      this._refs.faceBand.innerHTML = FACE.band(setA);
      // The delta rides with the room reading: it is the gap between the two, so
      // with no current temperature on the card there is nothing for it to measure.
      const wantCur = this._config.show_current !== false;
      this._refs.faceDelta.innerHTML = wantCur
        ? FACE.deltaSegment(setA, roomA, st.room - st.set) : "";
      this._refs.faceRoom.innerHTML = wantCur
        ? FACE.roomPin(roomA) + FACE.roomLabel(st.room, roomA) : "";
      if (wantCur) this._centreRoomCaption();
      this._refs.faceNeedle.innerHTML = FACE.needle(setA);
      this._refs.faceCenter.innerHTML = FACE.modeWord(st.mode) + FACE.bigNumeral(st.set)
        + FACE.statusLine(st.mode, st.action, st.preset);
      this._fitHero();
      this._fixStatusLine();
      this._placeClover();
      this._declutterScale();
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
      this._paintFaceFan(clamp(Math.round(pctEq), 1, 100), Math.round(pctEq) + "%");
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
      /* A named fan has no percentage, so the ring shows the POSITION in the list,
         derived the same way _facePct derives it for a settled state, or the two
         disagree by one step the moment the finger lifts. auto never arrives here:
         it returns above, and _fanNamedModes filters it out of the drag list. */
      const named = clamp(Math.round(((i + 1) / n) * 100), 1, 100);
      this._paintFaceFan(named, named + "%");
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
      // AUTO is the absence of a value on the new face too: the ring goes to its
      // unset state and the rail cell reads the word rather than a number.
      this._paintFaceFan(null, "AUTO");
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

    // Fit the card title to the open band above the arc apex. The title sits at
    // font-size 24 with 3 units of letter-spacing in a 600-unit viewBox; the arc
    // shoulders leave roughly 420 units of clear width, which is about 26 glyphs at
    // the average advance of this stack. Measured per render would need a layout
    // read, so this is a character budget, not a pixel fit: it never overflows and
    // the full name always stays available on the <title> tooltip.
    _fitTitle(name) {
      const MAX = 26;
      const s = String(name == null ? "" : name);
      return s.length <= MAX ? s : s.slice(0, MAX - 1).trimEnd() + "…";
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

      // Title: SVG text has no text-overflow, so a long name used to run off both
      // ends of the card. Truncate to what fits the open band above the arc and
      // hang the full name off a <title> child for hover and screen readers.
      if (this._refs.title) {
        const full = this._acName();
        this._refs.title.textContent = this._fitTitle(full); // wipes children
        const tip = document.createElementNS(NS, "title");   // so re-add the tooltip
        tip.textContent = full;
        this._refs.title.appendChild(tip);
      }
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
      // Unset accent follows --primary-color, NOT --accent-color. The default HA
      // theme paints --accent-color orange, which put a warm fan handle, caret and
      // chip on a cool blue dial for anyone who had not set an accent by hand.
      const cfgA = toColor(this._config.accent);
      this._accent = cfgA || getComputedStyle(this).getPropertyValue("--primary-color").trim() || DEFAULT_ACCENT;

      // UI accent var (popup / chips inherit it through the DOM).
      card.style.setProperty("--ct-accent", this._accent);

      if (!s || s.state === "unavailable" || s.state === "unknown") {
        card.setAttribute("data-mode", "off");
        card.style.setProperty("--accent", this._modeColor("off"));
        this._refs.bigNum.textContent = "--";
        this._refs.bigNum.setAttribute("font-size", "104");
        this._refs.labelTop.textContent = s
          ? (s.state === "unavailable" ? this._t("unavailable") : s.state.toUpperCase())
          : this._t("missing");
        this._refs.labelTop.style.fill = "var(--secondary-text-color, #6b7a88)";
        // Clear the arc fills too. Without this the ring keeps the last value it
        // painted, so a unit that drops offline still reads as a live setpoint
        // behind the dimmed face (issue #21).
        ["coldFill", "warmFill", "coldHalo", "warmHalo"].forEach((k) => {
          if (this._refs[k]) this._refs[k].setAttribute("d", "");
        });
        if (this._refs.tempNeedle) this._refs.tempNeedle.style.display = "none";
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
        if (this._refs.steps) this._refs.steps.forEach((x) => { x.g.style.display = "none"; });
        if (this._refs.rhCap) this._refs.rhCap.style.display = "none";
        if (this._refs.swingHChip) this._refs.swingHChip.style.display = "none";
        if (this._refs.swingHCap) this._refs.swingHCap.style.display = "none";
        /* The face is not repainted on this path, so a card that goes offline after
           being alive kept drawing its last fan speed, its last band and its last
           room reading for as long as it stayed dead. Hand the state back to the
           original face, which is what draws the dashes, exactly as heat_cool does. */
        this._faceOn = false;
        if (this._faceHidden) this._showLegacyFace();
        if (this._refs.face) this._refs.face.style.display = "none";
        this._refs.svg.style.opacity = "0.5";
        // a11y: nothing is settable while unavailable -> take the fan slider out of
        // the tab order (the temp slider's key handler already no-ops here, issue #5).
        if (this._refs.fanGrab) { this._refs.fanGrab.setAttribute("tabindex", "-1"); this._refs.fanGrab.setAttribute("aria-hidden", "true"); }
        if (this._refs.hints) this._refs.hints.style.display = "none"; // issue #15
        this._paintModeGlyph(s ? s.state : "off", this._modeColor("off"), true);
        return;
      }

      const attr = s.attributes || {};
      // Undo the unavailable branch's hide: the entity is live again, so the warm
      // needle comes back. (The cyan low needle is driven per-mode further down.)
      if (this._refs.tempNeedle) this._refs.tempNeedle.style.display = "";
      // Drop any optimistic hold the moment live state catches up (issue #9), so
      // the optimistic-vs-live checks below paint live as soon as it is real.
      this._reconcileOptimistic(attr);
      const mode = s.state;
      const off = mode === "off";
      const isHc = this._isHeatCool(); // dual-setpoint dial (issue #14)
      /* heat_cool keeps the ORIGINAL face. The handoff geometry draws one setpoint,
         one pin and one hero number; pointed at a low/high pair it painted the
         range minimum as the setpoint and dropped the pair entirely, which is a
         worse card than the one being replaced. Until the module has a dual
         setpoint of its own, this mode renders exactly as it shipped. */
      this._faceOn = !isHc;
      if (isHc && this._faceHidden) this._showLegacyFace();
      if (this._refs.face) this._refs.face.style.display = isHc ? "none" : "";
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
      // Tri-state, matching the swing / LED / sound chips (issue #17): true forces
      // the ring visible, false forces it hidden, unset/"auto" shows it only when a
      // source exists. `true` previously resolved to fanAvail, so Show and Auto were
      // identical and only Hide did anything, against what the editor promised.
      const haveFan = cfgShowFan === true ? true
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
          // the same test the face uses, so the two cannot disagree about whether
          // this fan has a speed at all
          if (this._faceNumUnset(r) && !fanOptPct) {
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

      // ---- HUMIDITY readout (fourth line of the centre stack) ----
      {
        const rh = num(attr.current_humidity);
        const cfgRh = this._config.show_humidity;
        const show = cfgRh === false ? false : (cfgRh === true ? true : rh != null);
        if (this._refs.rhCap) {
          this._refs.rhCap.style.display = show ? "" : "none";
          this._refs.rhCap.style.opacity = off ? "0.35" : "1";
          if (show && this._refs.rhVal) {
            this._refs.rhVal.textContent = rh == null ? "--%" : Math.round(rh) + "%";
          }
        }
      }

      // ---- HORIZONTAL SWING chip, and the layout split it forces ----
      {
        const showH = this._swingHResolved();
        const showV = this._featureResolved("swing");
        // Two axes share the shelf; one keeps the original centred slot.
        const vx = showH && showV ? 352 : 388;
        const hx = 414;
        if (this._refs.swingChip) this._refs.swingChip.setAttribute("transform", `translate(${vx},312)`);
        if (this._refs.swingCap) this._refs.swingCap.setAttribute("x", String(vx));
        if (this._refs.swingHChip) {
          this._refs.swingHChip.style.display = showH ? "" : "none";
          this._refs.swingHChip.setAttribute("transform", `translate(${hx},312)`);
          this._refs.swingHChip.setAttribute("tabindex", showH && !off ? "0" : "-1");
          const hOn = this._swingHIsOn();
          this._refs.swingHChip.setAttribute("aria-pressed", hOn ? "true" : "false");
          this._refs.swingHChip.style.opacity = off ? "0.35" : "1";
          if (this._refs.swingHChipBg) {
            this._refs.swingHChipBg.style.setProperty("--ct-chip", accent);
            this._refs.swingHChipBg.classList.toggle("on", hOn);
          }
          if (this._refs.swingHIcon) this._refs.swingHIcon.setAttribute("stroke", hOn ? accent : "#6a7480");
        }
        if (this._refs.swingHCap) {
          this._refs.swingHCap.style.display = showH ? "" : "none";
          this._refs.swingHCap.setAttribute("x", String(hx));
          this._refs.swingHCap.textContent = this._t("swing_h");
        }
        // Two captions on one shelf run into each other at the full caption size
        // ("SWING" and "SWING H" overlap and read as SWINGSWING H). Drop both a
        // couple of sizes only while both axes are on show.
        {
          const both = showH && showV;
          const fs = both ? "10" : "13.5";
          const ls = both ? "1" : "2";
          for (const cap of [this._refs.swingCap, this._refs.swingHCap]) {
            if (!cap) continue;
            cap.setAttribute("font-size", fs);
            cap.setAttribute("letter-spacing", ls);
          }
        }
      }

      // ---- SETPOINT STEPPERS ----
      // Dimmed and out of the tab order while the unit is off, exactly like the fan
      // controls, since there is no setpoint to move until it runs.
      if (this._refs.steps) {
        const showSteps = this._steppersResolved();
        this._refs.steps.forEach((x) => {
          x.g.style.display = showSteps ? "" : "none";
          x.g.style.opacity = off ? "0.35" : "1";
          x.g.setAttribute("tabindex", showSteps && !off ? "0" : "-1");
          x.g.setAttribute("aria-label",
            this._t(x.kind === "increase" ? "increase_temp" : "decrease_temp"));
          x.g.setAttribute("aria-disabled", off ? "true" : "false");
        });
      }

      // ---- face VERTICAL SWING chip ----
      if (this._featureResolved("swing")) {
        // Forced-visible with no backing source -> render an inert, dimmed OFF chip.
        const avail = this._featureAvail("swing");
        const on = avail && this._featureOn("swing");
        this._refs.swingChip.style.display = "";
        this._refs.swingCap.style.display = "";
        // Caption shows the current position ("3" / "Auto" / "Swing") for a climate
        // swing that is on, else the localized SWING word. Aria mirrors it.
        const swingLabel = this._swingLabelText();
        this._refs.swingCap.textContent = swingLabel;
        this._refs.swingChip.setAttribute("aria-label", swingLabel);
        this._refs.swingIcon.setAttribute("stroke", on ? this._accent : "#8a98a6");
        this._refs.swingChipBg.style.setProperty("--ct-chip", this._accent);
        this._refs.swingChipBg.classList.toggle("on", !!on);
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

      // Last: the face reads values the paint sites above have just written.
      this._paintFace();

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
  /* Face ink. The handoff module ships dark-theme literals inline; every neutral one
     is emitted as var(<token>, <that literal>) so this block is the only place they
     are decided. They resolve from the SAME theme properties the legacy face used,
     so a light theme stays readable and the glass variants (which pin both text
     properties on this element) keep working. Mode ink, gradients, the needle and
     the preset glyphs are deliberately NOT here: those are the design, not the ground. */
  --ct-face-hero: var(--primary-text-color, #f7f9fc);
  --ct-face-ink:  var(--primary-text-color, #eceff7);
  --ct-face-delta: var(--primary-text-color, #ffffff);
  --ct-face-sub: var(--secondary-text-color, rgba(200,215,235,.55));
  /* the same two percentages the legacy .ct-tk-major/.ct-tk-minor rules use, so the
     new ticks land on the exact colours the shipped card already drew. */
  --ct-face-dim: color-mix(in srgb, var(--secondary-text-color, rgb(200,215,235)) 52%, transparent);
  --ct-face-tick: color-mix(in srgb, var(--secondary-text-color, rgb(200,215,235)) 26%, transparent);
  --ct-face-tick-major: color-mix(in srgb, var(--secondary-text-color, rgb(200,215,235)) 60%, transparent);
  /* read back by _inkGround() to decide which way round the ground is. Nothing
     inherits this: every face string sets its own fill. */
  color: var(--ct-face-ink);
  /* pan-y (NOT none): a vertical swipe over the card still scrolls the dashboard;
     only the .ct-hit grab bands below opt out so a ring drag owns the gesture. */
  touch-action:pan-y;
  /* NEVER put backdrop-filter here or on :host: it would re-anchor the fixed .ct-pop. */
}
/* Light ground. Set by _inkGround() from the resolved text colour, because HA
   publishes no light/dark flag and prefers-color-scheme does not track a
   hand-picked HA theme. Only the two colours that cannot follow the text
   property are re-decided here: everything else already resolves correctly.
   On a dark ground neither token is defined and the module literals stand, so
   the shipped dark rendering is untouched. */
.ct-card[data-ink="light"]{
  /* the rail lit value: the module lifts it toward white to clear its own tinted
     fill, which is invisible on a pale card. Same answer the mode popup already
     gives its lit button: the theme text colour, with the mode colour kept in the
     border and the fill. */
  --ct-face-lit: var(--ct-face-ink);
  /* the mode word and the status word: cyan on white is about 1.6:1. Pull the ink
     down toward the card ink rather than replacing it, so HEAT still reads amber
     and COOL still reads blue. */
  --ct-face-mode-text: color-mix(in srgb, var(--ct-mode-ink, currentColor) 62%, var(--ct-face-ink));
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
/* Unlit ring tracks follow the theme. The build attributes carry dark literals that
   read as heavy bars on a light card; this overrides them (CSS beats a presentation
   attribute). If color-mix is unsupported the declaration drops and the original
   attribute still paints, so there is no unstyled state. */
.ct-track{ stroke: color-mix(in srgb, var(--secondary-text-color, #8c99a7) 24%, transparent); }

/* Feature chips. The resting fill used to be a dark literal, which reads as a solid
   grey block on a light theme, the same fault the ring tracks had. CSS beats the
   presentation attribute, and the attribute stays as the no-color-mix fallback. */
.ct-chipbg{
  fill: color-mix(in srgb, var(--secondary-text-color, #8c99a7) 10%, transparent);
  stroke: color-mix(in srgb, var(--secondary-text-color, #8c99a7) 24%, transparent);
}
.ct-chipbg.on{
  fill: color-mix(in srgb, var(--ct-chip, var(--ct-accent)) 16%, transparent);
  stroke: var(--ct-chip, var(--ct-accent));
}

/* Setpoint steppers: quiet until touched, so they never compete with the numerals
   they sit beside. The ring picks up the active mode color through --ct-accent. */
.ct-step{ cursor:pointer; transition:opacity .15s ease; }
.ct-step-bg{
  fill: color-mix(in srgb, var(--secondary-text-color, #8c99a7) 8%, transparent);
  stroke: color-mix(in srgb, var(--ct-accent) 55%, transparent);
  stroke-width:1.5;
  transition:fill .15s ease;
}
.ct-step-ic{ stroke: var(--primary-text-color, rgba(234,235,238,.92)); }
/* The room reading follows the pin, so at either end of the range it sits ON the
   band rather than over the dark middle. Same card-coloured knockout the gesture
   hints use: invisible where the ground is already the card, and the only thing
   that keeps the pair readable over a saturated arc. */
.ct-roomtxt{ paint-order:stroke; stroke:var(--ct-hint-knockout, var(--ha-card-background, var(--card-background-color, #16181d))); stroke-width:3px; stroke-linejoin:round; }
.ct-step:hover .ct-step-bg{ fill: color-mix(in srgb, var(--ct-accent) 18%, transparent); }
.ct-step:active .ct-step-bg{ fill: color-mix(in srgb, var(--ct-accent) 30%, transparent); }
@media (prefers-reduced-motion: reduce){ .ct-step, .ct-step-bg{ transition:none !important; } }

/* The slab is a GLASS feature. On the default theme appearance it drew a second
   bordered, blurred panel inset inside ha-card (a card inside a card) and cost a
   backdrop-filter layer on wall tablets, so it now renders only for glass. */
.ct-frost{ display:none; }
ha-card[data-appearance^="glass"] .ct-frost{ display:block; }
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

/* The mode popup sheet is a descendant of .ct-card, so it reads the card-background
   custom property, which the two variant blocks above pin to the DEFAULT tint. That
   left a custom glass_color tinting the slab while the sheet stayed the stock
   indigo. Deriving the sheet surface from the same rgb/alpha pair keeps them one
   material. Placed after both variants deliberately: equal specificity, later wins.
   The sheet sits slightly more opaque than the slab so its text stays readable over
   whatever the dial behind it happens to be. */
ha-card[data-appearance^="glass"] .ct-card{
  --ha-card-background: rgba(var(--ct-glass-rgb, 20,24,46), calc(var(--ct-glass-alpha, .66) + .14));
  --card-background-color: rgba(var(--ct-glass-rgb, 20,24,46), calc(var(--ct-glass-alpha, .66) + .14));
}

@keyframes ctfanspin{ to{ transform:rotate(360deg); } }

/* Face keyframes, injected verbatim from the handoff module. pulse drives the
   status dot, creep and drift the dash and breeze rings, wink the preset glyphs. */
${FACE.KEYFRAMES}
@media (prefers-reduced-motion: reduce){
  .ct-face [style*='animation']{ animation:none !important; }
  .ct-face animate{ display:none; }
}

/* Mode popup: position:fixed glass overlay (no transformed/filtered ancestor). */
${POPUP_CSS}

/* Swing POSITION picker (long-press): reuses the mode-popup glass, tighter grid so
   the short vane labels ("Auto" / "1" / "Swing") pack into a small modal. The .active
   member highlights like an active mode. */
.ct-swingsheet{ grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; padding:18px; }
.ct-swingsheet button{ min-width:96px; padding:14px 12px; }
@media (max-width:480px){ .ct-swingsheet button{ min-width:72px; padding:12px 8px; } }

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
  const TRISTATE_KEYS = ["show_fan", "show_swing", "show_led", "show_sound", "show_presets", "show_steppers", "show_humidity", "show_swing_h"];

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
    // The selected entity's own presets. No fallback list here: unlike hvac_modes
    // there is no standard set, so an entity without presets simply gets no rename
    // fields rather than fields for presets it will never have.
    _presetModes(config) {
      const hass = this._hass;
      const st = hass && config && config.entity && hass.states ? hass.states[config.entity] : null;
      const list = st && st.attributes && st.attributes.preset_modes;
      return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
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


        // Fan lives at the TOP LEVEL, not behind "Show all options". The ring style
        // is the one control a person is most likely to want, and it belongs beside
        // the other fan settings rather than floating above the sections on its own.
        { type: "expandable", name: "", title: this._t("editor.section.fan"), icon: "mdi:fan",
          expanded: true, schema: [
          // Visible radios, not a dropdown: the three rings differ only by how they
          // move, so a closed dropdown hides the entire decision. The migration promise
          // rides the option label rather than a helper sentence underneath it.
          // the default first, so the list reads as a default plus its alternatives
          { name: "fan_style", selector: { select: { mode: "list", options: [
            { value: "silk", label: this._t("editor.opt.fan_style_silk") },
            { value: "breeze", label: this._t("editor.opt.fan_style_breeze") },
            { value: "original", label: this._t("editor.opt.fan_style_original") },
          ] } } },
          { name: "fan_clover", selector: { boolean: {} } },
          { name: "show_fan", selector: { select: { mode: "dropdown", options: autoTF } } },
          { name: "fan_entity", selector: { entity: { domain: "number" } } },
        ] },

        { type: "expandable", name: "", title: this._t("editor.section.rail"), icon: "mdi:dots-horizontal", schema: [
          { name: "rail", selector: { select: { multiple: true, mode: "list", options: [
            { value: "fan", label: this._t("editor.opt.rail_fan") },
            { value: "swing", label: this._t("editor.opt.rail_swing") },
            { value: "led", label: this._t("editor.opt.rail_led") },
            { value: "sound", label: this._t("editor.opt.rail_sound") },
            { value: "extra:0", label: this._t("editor.opt.rail_extra") + " 1" },
            { value: "extra:1", label: this._t("editor.opt.rail_extra") + " 2" },
            { value: "extra:2", label: this._t("editor.opt.rail_extra") + " 3" },
          ] } } },
        ] },

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
          { name: "show_steppers", selector: { select: { mode: "dropdown", options: autoTF } } },
          { name: "show_humidity", selector: { select: { mode: "dropdown", options: autoTF } } },
          { type: "expandable", name: "mode_colors", title: this._t("editor.section.mode_colors"), icon: "mdi:format-color-fill",
            schema: MODE_KEYS.map((m) => ({ name: m, selector: { color_rgb: {} } })) },
        ] },

        // Progressive disclosure. A first-time user's only real decision is which
        // entity, so everything below the fold is gated behind one switch. The flag
        // is editor state, never written to the card config (stripped in
        // _valueChanged), so a YAML author never sees it and it cannot drift.
        { name: "__advanced", selector: { boolean: {} } },

        ...(this._showAdvanced ? [

        { type: "expandable", name: "", title: this._t("editor.section.modes"), icon: "mdi:thermostat", schema: [
          { name: "modes", selector: { select: { multiple: true, mode: "list", options: modeOptions } } },
          { type: "expandable", name: "", title: this._t("editor.section.mode_names"), icon: "mdi:rename-box",
            schema: hvac.map((m) => ({ name: "mn__" + m, selector: { text: {} }, _label: modeName(this._hass, m) || String(m).toUpperCase() })) },
        ] },

        { type: "expandable", name: "", title: this._t("editor.section.presets"), icon: "mdi:tune-variant", schema: [
          { name: "show_presets", selector: { select: { mode: "dropdown", options: autoTF } } },
          ...this._presetModes(config).map((p) => ({
            name: "pn__" + p, selector: { text: {} },
            _label: p.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
          })),
        ] },


        { type: "expandable", name: "", title: this._t("editor.section.features"), icon: "mdi:tune", schema: [
          { name: "swing_entity", selector: { entity: { domain: "switch" } } },
          { name: "show_swing", selector: { select: { mode: "dropdown", options: autoTF } } },
          { name: "swing_h_entity", selector: { entity: { domain: "switch" } } },
          { name: "show_swing_h", selector: { select: { mode: "dropdown", options: autoTF } } },
          { name: "led_entity", selector: { entity: { domain: "switch" } } },
          { name: "show_led", selector: { select: { mode: "dropdown", options: autoTF } } },
          { name: "sound_entity", selector: { entity: { domain: "switch" } } },
          { name: "show_sound", selector: { select: { mode: "dropdown", options: autoTF } } },
        ] },

        { type: "expandable", name: "", title: this._t("editor.section.extra_toggles"), icon: "mdi:toggle-switch-variant", schema: [
          { name: "extra_toggles", selector: { entity: { multiple: true, domain: ["switch", "input_boolean", "select", "input_select"] } } },
          ...normalizeExtra(config.extra_toggles).map((t) => {
            const st = this._hass && this._hass.states && this._hass.states[t.entity];
            const fn = st && st.attributes && st.attributes.friendly_name;
            return { name: "xtn__" + t.entity, selector: { text: {} }, _label: fn || t.entity };
          }),
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

        ] : []),
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
          if (s && s._label) return s._label;   // dynamic per-mode / per-toggle name fields
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

      data.__advanced = !!this._showAdvanced; // editor-only, stripped on save
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

      // Per-mode label overrides (mn__<mode>) and per-extra-toggle name overrides
      // (xtn__<entity>) are editor-only display keys: seed each text field with the
      // current custom label so it round-trips, then strip them back out in _valueChanged.
      const mnames = (config.mode_names && typeof config.mode_names === "object" && !Array.isArray(config.mode_names)) ? config.mode_names : {};
      for (const m of this._hvacModes(config)) data["mn__" + m] = (typeof mnames[m] === "string") ? mnames[m] : "";
      for (const t of normalizeExtra(config.extra_toggles)) data["xtn__" + t.entity] = t.name || "";
      const pnames = (config.preset_names && typeof config.preset_names === "object" && !Array.isArray(config.preset_names)) ? config.preset_names : {};
      for (const p of this._presetModes(config)) data["pn__" + p] = (typeof pnames[p] === "string") ? pnames[p] : "";
      return data;
    }

    // ha-form fires `value-changed` with the FULL merged config. Prune empties and
    // re-emit the card-standard `config-changed` (the HA editor contract).
    _valueChanged(ev) {
      ev.stopPropagation();
      const cfg = Object.assign({}, ev.detail.value);

      // Editor-only label fields: mn__<mode> -> mode_names, xtn__<entity> -> extra_toggles[].name.
      // Track PRESENCE (a field emitted empty means "clear this label", not "leave unchanged").
      // Editor-only disclosure flag: never a config key. Flipping it changes the
      // SCHEMA, not the card, so re-render the form and stop before dispatching a
      // config-changed that would carry nothing new.
      if ("__advanced" in cfg) {
        const want = !!cfg.__advanced;
        delete cfg.__advanced;
        if (want !== !!this._showAdvanced) {
          this._showAdvanced = want;
          this._update();
          return;
        }
      }
      const modeNameOv = {}, xtNameOv = {}, presetNameOv = {};
      for (const k of Object.keys(cfg)) {
        if (k.indexOf("mn__") === 0) { const v = cfg[k]; modeNameOv[k.slice(4)] = (typeof v === "string" ? v.trim() : ""); delete cfg[k]; }
        else if (k.indexOf("xtn__") === 0) { const v = cfg[k]; xtNameOv[k.slice(5)] = (typeof v === "string" ? v.trim() : ""); delete cfg[k]; }
        else if (k.indexOf("pn__") === 0) { const v = cfg[k]; presetNameOv[k.slice(4)] = (typeof v === "string" ? v.trim() : ""); delete cfg[k]; }
      }
      {
        const pn = {};
        const prevPn = (cfg.preset_names && typeof cfg.preset_names === "object"
          && !Array.isArray(cfg.preset_names)) ? cfg.preset_names : {};
        for (const p of Object.keys(prevPn)) {
          if (p in presetNameOv) continue; // had a field; the field is authoritative
          if (typeof prevPn[p] === "string" && prevPn[p].trim()) pn[p] = prevPn[p].trim();
        }
        for (const p of Object.keys(presetNameOv)) if (presetNameOv[p]) pn[p] = presetNameOv[p];
        if (Object.keys(pn).length) cfg.preset_names = pn; else delete cfg.preset_names;
      }
      // Carry over labels for modes that got NO field this render, then apply the
      // rendered fields on top. The seed only builds mn__ fields for the entity's
      // CURRENT hvac_modes, so rebuilding the map purely from the fields silently
      // destroyed any label belonging to a mode the entity does not expose right now
      // (a narrow hvac_modes list, or a swap to a different entity). A field that IS
      // rendered and comes back empty still clears its label, as before.
      const mn = {};
      const prevMn = (cfg.mode_names && typeof cfg.mode_names === "object"
        && !Array.isArray(cfg.mode_names)) ? cfg.mode_names : {};
      for (const m of Object.keys(prevMn)) {
        if (m in modeNameOv) continue; // had a field; the field is authoritative
        if (typeof prevMn[m] === "string" && prevMn[m].trim()) mn[m] = prevMn[m].trim();
      }
      for (const m of Object.keys(modeNameOv)) if (modeNameOv[m]) mn[m] = modeNameOv[m];
      if (Object.keys(mn).length) cfg.mode_names = mn; else delete cfg.mode_names;

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
          const priorObj = (prior && typeof prior === "object") ? prior : null;
          // name: an emitted xtn__ field wins (empty string clears it); else keep the
          // prior YAML/GUI name. icon stays as authored (YAML-only for now).
          const name = (id in xtNameOv) ? (xtNameOv[id] || null) : ((priorObj && priorObj.name) || null);
          const icon = (priorObj && priorObj.icon) || null;
          if (name || icon) {
            const r = { entity: id };
            if (name) r.name = name;
            if (icon) r.icon = icon;
            rows.push(r);
          } else {
            rows.push(id);
          }
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

  // Group-card styles. Everything is theme-driven; the only literal colors are the
  // two arc gradients, which are the instrument's identity and are shared with the
  // single dial.
  const GROUP_CSS = `
.cg-card{ display:block; position:relative; padding:14px 16px 16px; font-family:${FONT_STACK};
  /* read back by _inkGround; nothing inherits it, every surface sets its own */
  color:var(--primary-text-color, #f2f5f8); }
/* Content wrapper. The frosted slab is an absolutely positioned SIBLING, and a
   positioned element paints above static blocks, so without a positioned wrapper
   of its own the slab would sit on top of every zone tile and the title. */
.cg-inner{ position:relative; z-index:1; }
/* No position, no z-index, no filter, on purpose: anything here would trap the fixed
   room sheet inside a stacking context and paint it behind the dashboard. */
.cg-sheet-host{ display:contents; }
.cg-head{ display:flex; align-items:baseline; justify-content:space-between; gap:12px;
  padding-bottom:8px; border-bottom:1px solid var(--divider-color, rgba(127,127,127,.2)); }
.cg-title{ font-size:22px; font-weight:600; letter-spacing:3px; text-transform:uppercase;
  color:var(--primary-text-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
/* The running count is the one always-on accent mark on this card, so an accent
   set in config is visible at rest and not only on hover. */
.cg-count{ font-size:13px; font-weight:600; letter-spacing:2px; flex:none;
  color:var(--cg-accent, var(--secondary-text-color)); }

/* Zero-size defs carrier: gradients only, never laid out. */
.cg-defs{ position:absolute; width:0; height:0; overflow:hidden; }

/* The hero is a fixed-ish track, not a fraction. Left as a fraction it ballooned
   on a full-width panel while the zones crowded into a corner. */
.cg-body{ display:grid; grid-template-columns:minmax(170px,250px) minmax(0,1fr);
  gap:14px; margin-top:10px; align-items:start; }
@media (max-width:520px){ .cg-body{ grid-template-columns:1fr; } }
/* Hero and the group buttons stack in the left column so the buttons fill the
   space beside the zone grid instead of stretching the card taller. */
.cg-left{ display:flex; flex-direction:column; gap:10px; min-width:0; }
.cg-hero{ min-width:0; }
.cg-hero-svg{ display:block; width:100%; height:auto; overflow:visible; }

.cg-zones{ display:grid; grid-template-columns:repeat(auto-fit, minmax(92px, 1fr)); gap:7px; min-width:0; align-content:start; }
.cg-zone{ appearance:none; font:inherit; cursor:pointer; text-align:left; padding:8px 8px 4px;
  border-radius:12px; border:1px solid var(--divider-color, rgba(127,127,127,.25));
  background:color-mix(in srgb, var(--secondary-text-color, #8c99a7) 5%, transparent);
  color:var(--primary-text-color); transition:border-color .15s ease, background .15s ease; min-width:0; }
.cg-zone.on{ border-color:color-mix(in srgb, var(--cg-mode, var(--primary-color)) 45%, transparent); }
.cg-zone.focused{ border-color:var(--cg-mode, var(--primary-color)); border-width:1.5px;
  box-shadow:0 0 12px color-mix(in srgb, var(--cg-mode, var(--primary-color)) 30%, transparent); }
.cg-zone.dead{ opacity:.5; }
.cg-zone:hover{ background:color-mix(in srgb, var(--cg-mode, var(--primary-color)) 10%, transparent); }
.cg-zone:focus-visible{ outline:2px solid var(--primary-color, #03a9f4); outline-offset:2px; }
.cg-zone-head{ display:flex; align-items:baseline; justify-content:space-between; gap:6px; }
.cg-zone-name{ font-size:12.5px; font-weight:600; letter-spacing:.2px;
  color:var(--secondary-text-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  flex:1 1 auto; min-width:0; }
.cg-zone-mode{ font-size:9.5px; font-weight:700; letter-spacing:.6px; flex:0 0 auto;
  max-width:42%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  color:var(--cg-mode, var(--secondary-text-color)); }
.cg-zone.dead .cg-zone-mode, .cg-zone:not(.on) .cg-zone-mode{ color:var(--secondary-text-color); }
.cg-zone-svg{ display:block; width:100%; height:auto; margin-top:2px; }

.cg-track{ stroke: color-mix(in srgb, var(--secondary-text-color, #8c99a7) 24%, transparent); }
.cg-tick{ stroke: color-mix(in srgb, var(--secondary-text-color, #8c99a7) 45%, transparent); stroke-width:1.2; stroke-linecap:round; }
.cg-tick-maj{ stroke: var(--secondary-text-color, #8c99a7); stroke-width:2; }
.cg-num{ font-size:11px; font-weight:600; letter-spacing:.4px; fill:var(--secondary-text-color); }
.cg-marker{ fill:var(--primary-text-color); stroke:var(--ha-card-background, var(--card-background-color, #fff)); stroke-width:1; stroke-linejoin:round; }
.cg-clover{ fill:var(--secondary-text-color); opacity:.7; }
.cg-dim{ fill:var(--secondary-text-color); }
.cg-hero-label{ font-size:13px; font-weight:600; letter-spacing:4px; fill:var(--secondary-text-color); }
.cg-hero-now{ font-size:12px; letter-spacing:2.5px; fill:var(--primary-text-color); }
.cg-hero-big{ font-size:52px; letter-spacing:2px; fill:var(--primary-text-color); }
.cg-hero-sub{ font-size:11px; font-weight:600; letter-spacing:2px; fill:var(--secondary-text-color); }
.cg-zone-big{ font-size:26px; fill:var(--primary-text-color); }
.cg-zone-now{ font-size:9.5px; letter-spacing:1.4px; fill:var(--primary-text-color); }
text.cg-dim, tspan.cg-dim{ fill:var(--secondary-text-color); }

/* Pinned rows: a one-row strip beside a tall hero column left a void under the
   zone tiles. Centring the strip in the free space reads as a deliberate layout,
   where stretching the tiles instead just made five very tall boxes with a small
   gauge adrift in each. align-self is what does the work here, because .cg-body
   pins its children to the top with align-items:start, so without it the grid box
   is only as tall as its own content and align-content has nothing to distribute.
   When the tiles are the taller column there is no free space and this is inert. */
.cg-zones-fill{ align-content:center; align-self:stretch; }

.cg-actions-grid{ display:grid !important; }
.cg-actions-grid .cg-act{ flex:none; padding-left:6px; padding-right:6px; letter-spacing:1px; }
.cg-actions{ display:flex; flex-wrap:wrap; gap:7px; padding-top:10px;
  border-top:1px solid var(--divider-color, rgba(127,127,127,.2)); }
/* overflow/ellipsis is not decoration: action_rows can force four buttons into one
   narrow track, and without it the labels paint straight out of their own buttons
   and over each other. Truncating is the honest failure for a row count the card
   was asked for and cannot fit. */
.cg-act{ appearance:none; font:inherit; cursor:pointer; padding:9px 13px; border-radius:10px;
  flex:1 1 auto; min-width:0; white-space:nowrap; text-align:center;
  overflow:hidden; text-overflow:ellipsis;
  font-size:12.5px; font-weight:600; letter-spacing:1.6px; text-transform:uppercase;
  background:var(--secondary-background-color, rgba(120,130,145,.14));
  color:var(--primary-text-color); border:1px solid var(--divider-color, rgba(127,127,127,.3));
  transition:border-color .15s ease; }
.cg-act:hover{ border-color:var(--cg-accent, var(--primary-color, #03a9f4)); }
.cg-act:focus-visible{ outline:2px solid var(--cg-accent, var(--primary-color, #03a9f4)); outline-offset:2px; }
/* Preset buttons are the optional row, so they carry the accent at rest and the
   two structural actions (all-off, sync) stay neutral. */
.cg-act-preset{
  color:var(--cg-accent, var(--primary-text-color));
  border-color:color-mix(in srgb, var(--cg-accent, var(--primary-color, #03a9f4)) 42%, transparent);
  background:color-mix(in srgb, var(--cg-accent, var(--primary-color, #03a9f4)) 9%, transparent);
}
@media (prefers-reduced-motion: reduce){ .cg-zone, .cg-act{ transition:none !important; } }

/* ----------------------------------------------------------------------------
   GLASS appearance (config: appearance: glass-dark | glass-light), the same
   contract and the same tint variables as the single dial, so a dashboard running
   both cards keeps one look. The attribute sits on <ha-card> so glass mode can
   hide the themed card chrome, retint the neutral text custom properties locally,
   and paint .cg-frost as a full-bleed translucent slab. Default appearance
   ("theme") sets no attribute and the slab stays hidden, so nothing changes for
   anyone who never asked for glass.
   ---------------------------------------------------------------------------- */
.cg-frost{ display:none; }
ha-card[data-appearance^="glass"]{ background:transparent; border:none; box-shadow:none; }
ha-card[data-appearance^="glass"] .cg-frost{
  display:block; position:absolute; z-index:0; inset:0; border-radius:14px; pointer-events:none;
  background:
    radial-gradient(125% 110% at 50% -10%, var(--ct-glass-sheen, transparent), transparent 72%),
    rgba(var(--ct-glass-rgb, 20,24,46), var(--ct-glass-alpha, .66));
  backdrop-filter:blur(16px) saturate(1.25);
  -webkit-backdrop-filter:blur(16px) saturate(1.25);
}
/* Zone tiles read as glass too, or they punch five opaque holes in the slab. */
ha-card[data-appearance^="glass"] .cg-zone{
  background:rgba(255,255,255,.05);
  backdrop-filter:blur(4px);
  -webkit-backdrop-filter:blur(4px);
}
ha-card[data-appearance^="glass"] .cg-act{ background:rgba(255,255,255,.06); }
ha-card[data-appearance="glass-light"] .cg-zone,
ha-card[data-appearance="glass-light"] .cg-act{ background:rgba(255,255,255,.42); }

ha-card[data-appearance="glass-dark"] .cg-inner{
  --primary-text-color:rgba(236,239,247,.98);
  --secondary-text-color:rgba(202,212,234,.80);
  --divider-color:rgba(150,170,255,.22);
  --ha-card-background:rgba(20,24,46,.72);
  --card-background-color:rgba(20,24,46,.72);
}
ha-card[data-appearance="glass-dark"]{
  --ct-glass-rgb:20,24,46; --ct-glass-alpha:.66; --ct-glass-sheen:rgba(150,165,235,.18);
}
ha-card[data-appearance="glass-dark"] .cg-frost{
  border:1px solid rgba(150,170,255,.24);
  box-shadow:
    inset 0 2px 14px rgba(170,185,255,.14),
    inset 0 -16px 38px rgba(0,0,0,.34),
    0 18px 52px rgba(0,0,0,.42);
}

ha-card[data-appearance="glass-light"] .cg-inner{
  --primary-text-color:rgba(28,33,48,.96);
  --secondary-text-color:rgba(58,66,86,.82);
  --divider-color:rgba(40,52,90,.20);
  --ha-card-background:rgba(244,247,253,.60);
  --card-background-color:rgba(244,247,253,.60);
}
ha-card[data-appearance="glass-light"]{
  --ct-glass-rgb:244,247,253; --ct-glass-alpha:.60; --ct-glass-sheen:rgba(255,255,255,.55);
}
ha-card[data-appearance="glass-light"] .cg-frost{
  border:1px solid rgba(255,255,255,.55);
  box-shadow:
    inset 0 2px 14px rgba(255,255,255,.70),
    inset 0 -16px 38px rgba(40,52,90,.10),
    0 18px 52px rgba(20,28,50,.22);
}

/* Same derivation as the single dial: whatever glass_color is set to must reach
   every surface that reads the card-background property, not only the slab. */
ha-card[data-appearance^="glass"] .cg-inner{
  --ha-card-background: rgba(var(--ct-glass-rgb, 20,24,46), calc(var(--ct-glass-alpha, .66) + .14));
  --card-background-color: rgba(var(--ct-glass-rgb, 20,24,46), calc(var(--ct-glass-alpha, .66) + .14));
}
`;

  // ============================================================================
  // GROUP CARD  (custom:climate-cluster-group-card)
  // ============================================================================
  // A second card type: one house gauge plus every zone as a live mini instrument.
  // It is the SAME instrument at three sizes, drawn with the same helpers as the
  // single dial (polar / arcPath / the needle path / the clover), so the two cards
  // cannot drift apart visually.
  //
  // Zones live in a CSS grid rather than fixed SVG slots, so the card takes any
  // number of entities and reflows instead of silently dropping the overflow.
  // ============================================================================
  const G_A0 = 250, G_SPAN = 220, G_A1 = G_A0 + G_SPAN;

  // Needle path, authored tip at +Y so rotate(ang) turns it inward. Shared shape
  // with the single dial; only the scale differs.
  const G_NEEDLE =
    'M 0 15 Q 5.6 10 7.2 2.5 Q 8.2 -4.5 4.2 -9.5 Q 2.2 -11.5 0 -10 ' +
    'Q -2.2 -11.5 -4.2 -9.5 Q -8.2 -4.5 -7.2 2.5 Q -5.6 10 0 15 Z';

  function gArc(cx, cy, r, a0, a1) {
    const p = polar(cx, cy, r, a0), q = polar(cx, cy, r, a1);
    return `M ${p[0].toFixed(1)} ${p[1].toFixed(1)} A ${r} ${r} 0 ${(a1 - a0) > 180 ? 1 : 0} 1 ${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  }

  /* The zone tiles carry the preset glyphs, which are the module's one animation.
     One rule, injected once, guarded for reduced motion like every other. */
  const GROUP_CSS_ZONE = GROUP_CSS + POPUP_CSS + `
/* The sheet's stylesheet speaks --ct-accent and --ct-font; this card publishes the
   same two things under its own names. Alias rather than fork the stylesheet. */
.cg-card{ --ct-accent: var(--cg-accent, ${DEFAULT_ACCENT}); --ct-font: ${FONT_STACK}; }
/* Zone card surfaces. Declared here so the glass variants below can retint them the
   same way they retint the text properties, which is what makes glass_color and
   glass_opacity mean something on this layout. */
.cg-inner{
  --ct-zone-surface-hi: rgba(255,255,255,.11);
  --ct-zone-surface: rgba(255,255,255,.07);
  --ct-zone-surface-lo: rgba(255,255,255,.03);
  --ct-zone-edge: rgba(255,255,255,.11);
  --ct-zone-edge-hi: rgba(255,255,255,.16);
  --ct-zone-inset: rgba(255,255,255,.16);
  --ct-zone-inset-lo: rgba(255,255,255,.05);
  --ct-zone-tick: color-mix(in srgb, var(--secondary-text-color, rgb(154,165,177)) 45%, transparent);
  --ct-zone-track: color-mix(in srgb, var(--secondary-text-color, rgb(154,165,177)) 14%, transparent);
  --ct-zone-ring: color-mix(in srgb, var(--secondary-text-color, rgb(225,231,237)) 20%, transparent);
  --ct-zone-bar-off: color-mix(in srgb, var(--secondary-text-color, rgb(225,231,237)) 28%, transparent);
}
/* A light ground needs DARK surfaces over it, not lighter ones: white on white is
   the same nothing the dial's face used to be. */
ha-card[data-appearance="glass-light"] .cg-inner,
.cg-card[data-ink="light"] .cg-inner{
  --ct-zone-surface-hi: rgba(20,28,48,.07);
  --ct-zone-surface: rgba(20,28,48,.05);
  --ct-zone-surface-lo: rgba(20,28,48,.02);
  --ct-zone-edge: rgba(20,28,48,.14);
  --ct-zone-edge-hi: rgba(20,28,48,.20);
  --ct-zone-inset: rgba(255,255,255,.55);
  --ct-zone-inset-lo: rgba(255,255,255,.30);
}
${ZONE.KEYFRAMES}
@media (prefers-reduced-motion: reduce){
  .cg-zonecard [style*='animation']{ animation:none !important; }
}
/* The two spread-ring labels follow their own ring end, so near either end of the
   range they land on the band rather than beside it. Card-coloured knockout, the
   same one the single dial gives its room reading. */
.cg-ringlab{ paint-order:stroke; stroke:var(--ha-card-background, var(--card-background-color, #16181d));
  stroke-width:3px; stroke-linejoin:round; }
/* The module sizes itself for a wide card, and below that the hero column and the
   tile row cannot both hold their minimums. The breakpoint has to be about the CARD,
   not the window: this card is routinely narrow inside a wide viewport, in the
   editor preview, in a sections column, in a phone-width grid cell. A media query
   measures the viewport and so never fired in any of those, which is how five tiles
   ended up stacked on top of each other with their names overprinted. */
.cg-zonecard{ container-type:inline-size; }
/* Automatic is the default and is what the container query drives. Asking for one
   shape explicitly overrides it: horizontal keeps the hero beside the rooms at any
   width, vertical stacks them at any width. The editor preview pane is narrow, so on
   automatic it stacks there and goes back to a row once the card is on a real
   dashboard, which is correct and still surprising, which is why both are offered. */
@container (max-width:700px){
  .cg-zonecard:not([data-orient="horizontal"]) .cg-zonecard-body{ grid-template-columns:1fr !important; }
  .cg-zonecard:not([data-orient="horizontal"]) .cg-zonecard-tiles{ min-height:0 !important; align-self:auto !important; }
  /* Stacked, the hero would otherwise take the full card width and stand taller
     than every tile put together. It is one reading, not the whole card. */
  .cg-zonecard:not([data-orient="horizontal"]) .cg-zonecard-body > svg{ max-width:300px; margin:0 auto; }
}
.cg-zonecard[data-orient="vertical"] .cg-zonecard-body{ grid-template-columns:1fr !important; }
.cg-zonecard[data-orient="vertical"] .cg-zonecard-tiles{ min-height:0 !important; align-self:auto !important; }
.cg-zonecard[data-orient="vertical"] .cg-zonecard-body > svg{ max-width:300px; margin:0 auto; }
/* Browsers without container queries still get something readable: the tile track
   has a real minimum, so tiles wrap rather than compress. */
.cg-zonecard-tiles{ min-width:0; }
`;

  class ClimateClusterGroupCard extends HTMLElement {
    constructor() {
      super();
      this._built = false;
      this._hass = null;
      this._config = null;
      this._focus = null;   // entity_id currently promoted into the hero, or null
      this._sig = null;     // last painted state signature (dirty check)
    }

    setConfig(config) {
      if (!config) throw new Error("Invalid configuration");
      const list = Array.isArray(config.entities) ? config.entities : [];
      const ents = list
        .map((e) => (typeof e === "string" ? { entity: e } : e))
        .filter((e) => e && typeof e.entity === "string" && e.entity.indexOf("climate.") === 0);
      if (!ents.length) throw new Error("Define at least one climate entity in `entities`");
      this._config = Object.assign({}, config);
      this._zones = ents;
      this._focus = null;
      this._sig = null;

      // Same appearance contract as the single dial, resolved with the same rules,
      // so one dashboard can run both cards on one look. "glass" is the legacy
      // spelling of the dark variant; anything unknown falls back to "theme".
      const ap = this._config.appearance;
      this._appearance = (ap === "glass" || ap === "glass-dark") ? "glass-dark"
        : ap === "glass-light" ? "glass-light" : "theme";
      const gc = colorToRgb(this._config.glass_color);
      this._glassColorRgb = gc ? gc.join(",") : null;
      const go = this._config.glass_opacity;
      this._glassOpacity = (typeof go === "number" && isFinite(go) && go >= 0 && go <= 1) ? go : null;
      this._accent = toColor(this._config.accent) || null;

      if (this._built) { this._applyAppearance(); this._render(); }
    }

    // Appearance is a config concern, not a state concern, so it is applied outside
    // the signature-gated _render. Otherwise an appearance-only config change would
    // be swallowed by the dirty check.
    _applyAppearance() {
      const card = this._card;
      if (!card) return;
      if (this._appearance === "glass-dark" || this._appearance === "glass-light") {
        card.setAttribute("data-appearance", this._appearance);
      } else card.removeAttribute("data-appearance");
      if (this._glassColorRgb) card.style.setProperty("--ct-glass-rgb", this._glassColorRgb);
      else card.style.removeProperty("--ct-glass-rgb");
      if (this._glassOpacity != null) card.style.setProperty("--ct-glass-alpha", String(this._glassOpacity));
      else card.style.removeProperty("--ct-glass-alpha");
      if (this._accent) card.style.setProperty("--cg-accent", this._accent);
      else card.style.removeProperty("--cg-accent");
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._built) this._build();
      this._render();
    }

    getCardSize() { return 8; }
    getGridOptions() {
      return { columns: 12, rows: 8, min_columns: 6, min_rows: 4 };
    }

    // Only repaint when something this card actually shows has changed. A group
    // card watches several entities, so without this it would rebuild its whole
    // SVG on every unrelated state change in the house.
    _signature() {
      if (!this._hass) return "";
      const parts = [this._focus || ""];
      for (const z of this._zones) {
        const s = this._hass.states[z.entity];
        if (!s) { parts.push(z.entity + ":-"); continue; }
        const a = s.attributes || {};
        // fan_mode and swing_mode reach the screen on the zone layout, and the
        // sheet's toggles are separate switch entities, so all of them have to be
        // in the signature or the card shows a stale chip until something else
        // happens to change. The transient sheet and confirm state go in too: they
        // are the only thing that moves on a tap that writes nothing.
        parts.push([z.entity, s.state, a.temperature, a.current_temperature,
          a.target_temp_low, a.target_temp_high, a.hvac_action, a.preset_mode,
          a.fan_mode, a.swing_mode].join("|"));
        const sib = this._zoneSiblings(z.entity);
        for (const k in sib) {
          const t = sib[k] && this._hass.states[sib[k]];
          parts.push(k + ":" + (t ? t.state : "-"));
        }
      }
      const ui = this._zui || {};
      parts.push("ui:" + (ui.sheetIndex == null ? "-" : ui.sheetIndex) + ":" + (ui.confirmOff ? 1 : 0));
      // a held value is state the card shows, so it belongs in what decides a repaint
      const zo = this._zoneOpt || {};
      for (const id in zo) parts.push("o:" + id + ":" + JSON.stringify(zo[id]));
      return parts.join(";");
    }

    _st(id) {
      return this._hass && this._hass.states ? this._hass.states[id] : null;
    }
    _unit() {
      const u = this._config.temperature_unit;
      if (u === "F" || u === "C") return u;
      const sys = this._hass && this._hass.config && this._hass.config.unit_system;
      return sys && String(sys.temperature).indexOf("C") >= 0 ? "C" : "F";
    }
    _range() {
      const u = this._unit();
      let lo = num(this._config.min_temp), hi = num(this._config.max_temp);
      if (lo == null || hi == null) {
        // Widest range any zone advertises, so one gauge scale fits them all.
        let mn = null, mx = null;
        for (const z of this._zones) {
          const a = (this._st(z.entity) || {}).attributes || {};
          const zl = num(a.min_temp), zh = num(a.max_temp);
          if (zl != null) mn = mn == null ? zl : Math.min(mn, zl);
          if (zh != null) mx = mx == null ? zh : Math.max(mx, zh);
        }
        const d = u === "C" ? { lo: 16, hi: 30 } : { lo: 61, hi: 86 };
        lo = lo != null ? lo : (mn != null ? mn : d.lo);
        hi = hi != null ? hi : (mx != null ? mx : d.hi);
      }
      if (!(hi > lo)) hi = lo + 1;
      return { lo, hi };
    }
    _setpoint(s) {
      if (!s) return null;
      const a = s.attributes || {};
      const t = num(a.temperature);
      if (t != null) return t;
      const l = num(a.target_temp_low), h = num(a.target_temp_high);
      if (l != null && h != null) return (l + h) / 2;
      return null;
    }
    // Zone names very often share a prefix ("Aire-Sala", "Aire-Ricky", "AC Office").
    // The tiles are narrow, so that prefix eats the label and every zone truncates to
    // the same useless stub. Strip it, but only when EVERY name has it and every
    // remainder is still 3 characters or more, so "Office 1" / "Office 2" is left
    // alone rather than reduced to "1" and "2".
    _shortNames(names) {
      if (names.length < 2) return names;
      let p = names[0];
      for (const n of names.slice(1)) {
        let i = 0;
        while (i < p.length && i < n.length && p[i].toLowerCase() === n[i].toLowerCase()) i++;
        p = p.slice(0, i);
        if (!p) return names;
      }
      p = p.replace(/[^\s\-_.]*$/, ""); // back off to a separator, never mid-word
      if (p.length < 3) return names;
      const out = names.map((n) => n.slice(p.length).replace(/^[\s\-_.]+/, ""));
      return out.every((n) => n.length >= 3) ? out : names;
    }

    _live(z) {
      const s = this._st(z.entity);
      const a = (s && s.attributes) || {};
      const dead = !s || s.state === "unavailable" || s.state === "unknown";
      return {
        id: z.entity,
        name: z.name || a.friendly_name || z.entity,
        state: s ? s.state : "unavailable",
        dead,
        on: !dead && s.state !== "off",
        set: this._setpoint(s),
        now: num(a.current_temperature),
        rh: num(a.current_humidity),
        action: a.hvac_action || null,
        color: MODE_COLORS[s ? s.state : "off"] || MODE_COLORS.off,
      };
    }
    // The hero reading: an average, the hottest zone, a named entity, or whichever
    // zone the user has tapped into focus.
    _heroPick(zones) {
      if (this._focus) {
        const f = zones.find((z) => z.id === this._focus);
        if (f) return { kind: "zone", z: f };
      }
      const mode = this._config.hero || "average";
      const live = zones.filter((z) => !z.dead && z.set != null);
      if (mode !== "average" && mode !== "hottest") {
        const named = zones.find((z) => z.id === mode);
        if (named) return { kind: "zone", z: named };
      }
      if (!live.length) return { kind: "empty" };
      if (mode === "hottest") {
        return { kind: "zone", z: live.reduce((a, b) => ((b.now != null ? b.now : -1e9) > (a.now != null ? a.now : -1e9) ? b : a)) };
      }
      const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
      return {
        kind: "average",
        set: avg(live.map((z) => z.set)),
        now: avg(live.filter((z) => z.now != null).map((z) => z.now)),
        rh: avg(zones.filter((z) => z.rh != null).map((z) => z.rh)),
        running: zones.filter((z) => z.on).length,
      };
    }

    _fmt(v) {
      if (v == null) return "--";
      const r = Math.round(v * 10) / 10;
      return Number.isInteger(r) ? String(r) : r.toFixed(1);
    }

    // Rows, not columns, because that is how people describe what they want: "put
    // my five zones on two rows". Columns are derived. Anything unset, zero or
    // non-numeric falls back to the responsive auto-fit grid.
    _gridStyle(key, count) {
      const raw = this._config[key];
      const rows = typeof raw === "number" ? raw : parseInt(raw, 10);
      if (!Number.isFinite(rows) || rows < 1 || !count) return "";
      const cols = Math.ceil(count / Math.min(rows, count));
      return ` style="grid-template-columns:repeat(${cols},minmax(0,1fr))"`;
    }

    _build() {
      const root = this.shadowRoot || this.attachShadow({ mode: "open" });
      root.innerHTML = "";
      const style = document.createElement("style");
      style.textContent = GROUP_CSS_ZONE;
      root.appendChild(style);
      const card = document.createElement("ha-card");
      card.className = "cg-card";
      this._card = card;
      // Frosted slab and content are separate children: _render rewrites the
      // content wholesale, and the slab must survive that. It is also the reason
      // the content lives in its own positioned wrapper, since an absolutely
      // positioned sibling paints above static blocks and would hide the text.
      const frost = document.createElement("div");
      frost.className = "cg-frost";
      card.appendChild(frost);
      const inner = document.createElement("div");
      inner.className = "cg-inner";
      card.appendChild(inner);
      this._inner = inner;
      /* The room sheet lives HERE, a sibling of the content rather than inside it.
         .cg-inner carries z-index:1, and a positioned element with a z-index is a
         stacking context, so a fixed overlay inside it can never rise above anything
         outside this card however high its own z-index goes. It was painting behind
         the dashboard. This host sets no position, no z-index and no filter, so it
         creates no context of its own and the overlay reaches the viewport.

         Keeping it separate also means a state push rewrites the card body WITHOUT
         destroying and rebuilding the open sheet underneath the finger, which is what
         made its buttons miss taps. */
      const sheetHost = document.createElement("div");
      sheetHost.className = "cg-sheet-host";
      card.appendChild(sheetHost);
      this._sheetHost = sheetHost;
      this._bodyHtml = null;
      this._sheetHtml = null;
      root.appendChild(card);
      card.addEventListener("click", (e) => this._onClick(e));
      this._built = true;
      this._applyAppearance();
    }

    _onClick(e) {
      if (this._config.layout !== "classic") {
        // The zone layout owns every control on the card. A tap it does not claim
        // falls through to nothing rather than to the classic focus behaviour, whose
        // data-zone means an entity id here and an index there.
        if (e.target && e.target.closest) this._zoneAct(e.target);
        return;
      }
      const zoneEl = e.target && e.target.closest ? e.target.closest("[data-zone]") : null;
      if (zoneEl) {
        const id = zoneEl.dataset.zone;
        const how = this._config.tap_zone || "focus";
        if (how === "more-info") {
          this.dispatchEvent(new CustomEvent("hass-more-info", {
            detail: { entityId: id }, bubbles: true, composed: true,
          }));
          return;
        }
        this._focus = this._focus === id ? null : id; // tap again to go back
        this._sig = null;
        this._render();
        return;
      }
      const actEl = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
      if (actEl) this._groupAction(actEl.dataset.act, actEl.dataset.arg);
    }

    _call(domain, service, data) {
      if (!this._hass) return;
      try {
        const p = this._hass.callService(domain, service, data);
        if (p && typeof p.catch === "function") {
          p.catch((err) => { console.error("climate-cluster-group-card:", err); });
        }
      } catch (err) { console.error("climate-cluster-group-card:", err); }
    }

    _groupAction(act, arg) {
      const ids = this._zones.map((z) => z.entity);
      if (act === "off") { this._call("climate", "turn_off", { entity_id: ids }); return; }
      if (act === "preset") { this._call("climate", "set_preset_mode", { entity_id: ids, preset_mode: arg }); return; }
      if (act === "setpoint") {
        const t = num(arg);
        if (t == null) return;
        // Only entities with a single setpoint: a heat_cool zone wants low/high,
        // and guessing which one to move would be worse than skipping it.
        const single = this._zones
          .map((z) => this._st(z.entity))
          .filter((s) => s && s.state !== "off" && s.state !== "unavailable"
            && num((s.attributes || {}).temperature) != null)
          .map((s) => s.entity_id);
        if (single.length) this._call("climate", "set_temperature", { entity_id: single, temperature: t });
      }
    }

    // Presets every zone supports, so a group preset button can never write a value
    // one of them would reject.
    _sharedPresets() {
      let shared = null;
      for (const z of this._zones) {
        const a = (this._st(z.entity) || {}).attributes || {};
        const list = Array.isArray(a.preset_modes) ? a.preset_modes : [];
        shared = shared == null ? list.slice() : shared.filter((p) => list.includes(p));
        if (!shared.length) return [];
      }
      return (shared || []).filter((p) => String(p).toLowerCase() !== "none");
    }

    _heroSvg(hero, zones) {
      const { lo, hi } = this._range();
      const CXH = 168, CYH = 208, R = 104, W = 13;
      const t2a = (t) => G_A0 + G_SPAN * ((clamp(t, lo, hi) - lo) / (hi - lo));
      const isZone = hero.kind === "zone";
      const set = isZone ? hero.z.set : (hero.kind === "average" ? hero.set : null);
      const now = isZone ? hero.z.now : (hero.kind === "average" ? hero.now : null);
      const label = isZone ? hero.z.name : this._t("average");
      const sub = isZone
        ? (hero.z.on ? String(hero.z.state).toUpperCase().replace("_", " ") : this._t("off_word"))
        : (hero.kind === "average" ? `${hero.running} ${this._t("running")}` : "");

      // viewBox is TIGHT around what the hero actually draws. The gauge sits at
      // 168/208 with radius 104, so its content runs x 57..279 and y 97..262. A
      // full 600x392 box left the gauge floating in a third of its own canvas,
      // which is why the card read as small and off-centre.
      let s = `<svg viewBox="53 94 230 182" class="cg-hero-svg" role="img" aria-label="${escapeAttr(label)}">`;

      // tick scale, same proportions as the single dial
      let tk = "";
      const span = hi - lo;
      const minor = span > 40 ? span / 40 : 1;
      const stride = span > 40 ? 10 : 5;
      for (let t = lo; t <= hi + 1e-6; t += minor) {
        const a = t2a(t);
        const major = Math.abs(t / stride - Math.round(t / stride)) < 1e-6;
        const len = major ? 7 : 3.5;
        const p = polar(CXH, CYH, R - 11 - len, a), q = polar(CXH, CYH, R - 11, a);
        tk += `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" class="cg-tick${major ? " cg-tick-maj" : ""}"/>`;
      }
      for (let t = Math.ceil(lo / stride) * stride; t <= hi + 1e-6; t += stride) {
        const np = polar(CXH, CYH, R - 32, t2a(t));
        tk += `<text x="${np[0].toFixed(1)}" y="${np[1].toFixed(1)}" text-anchor="middle" dominant-baseline="central" class="cg-num">${this._fmt(t)}</text>`;
      }
      s += `<g>${tk}</g>`;

      s += `<path d="${gArc(CXH, CYH, R, G_A0, G_A1)}" class="cg-track" stroke-width="${W}" fill="none" stroke-linecap="round"/>`;
      if (set != null) {
        const a = t2a(set);
        s += `<path d="${gArc(CXH, CYH, R, G_A0, Math.max(G_A0 + 0.01, a))}" fill="none" stroke="#5CD6FF" stroke-width="${W}" stroke-linecap="round" opacity=".35" filter="url(#cgGlow)"/>`;
        s += `<path d="${gArc(CXH, CYH, R, G_A0, Math.max(G_A0 + 0.01, a))}" fill="none" stroke="url(#cgCold)" stroke-width="${W}" stroke-linecap="round"/>`;
        s += `<path d="${gArc(CXH, CYH, R, Math.min(a, G_A1 - 0.01), G_A1)}" fill="none" stroke="url(#cgWarm)" stroke-width="${W}" stroke-linecap="round"/>`;
        const seat = polar(CXH, CYH, R, a);
        s += `<g transform="translate(${seat[0].toFixed(1)},${seat[1].toFixed(1)}) rotate(${a.toFixed(1)}) scale(0.8)">`
          + `<path d="${G_NEEDLE}" fill="#F2933A" stroke="#FFB55E" stroke-width="1" stroke-opacity=".55" stroke-linejoin="round"/></g>`;
      }
      if (now != null) {
        const a = t2a(now), m = polar(CXH, CYH, R, a);
        s += `<g transform="translate(${m[0].toFixed(1)},${m[1].toFixed(1)}) rotate(${a.toFixed(1)})">`
          + '<path d="M0,7 L4.4,.8 L-4.4,.8 Z" class="cg-marker"/></g>';
      }
      s += `<text x="${CXH}" y="${CYH - 44}" text-anchor="middle" class="cg-hero-label">${escapeText(String(label).toUpperCase())}</text>`;
      if (now != null) {
        s += `<text x="${CXH}" y="${CYH - 26}" text-anchor="middle" class="cg-hero-now">`
          + `<tspan class="cg-dim">${escapeText(this._t("now"))} </tspan><tspan>${this._fmt(now)}&#176;</tspan></text>`;
      }
      s += `<text x="${CXH}" y="${CYH + 14}" text-anchor="middle" dominant-baseline="central" class="cg-hero-big">${set == null ? "--" : this._fmt(set)}</text>`;
      s += `<text x="${CXH}" y="${CYH + 56}" text-anchor="middle" class="cg-hero-sub">${escapeText(String(sub).toUpperCase())}</text>`;
      return s + "</svg>";
    }

    _zoneSvg(z) {
      const { lo, hi } = this._range();
      const cx = 60, cy = 62, r = 30, w = 7;
      const t2a = (t) => G_A0 + G_SPAN * ((clamp(t, lo, hi) - lo) / (hi - lo));
      // Tight box again: the gauge runs x 26..94 and y 28..82, and the clover sits
      // on the right shelf. Anything looser and the tile pads itself with dead space.
      let s = '<svg viewBox="24 26 94 64" class="cg-zone-svg" aria-hidden="true">';
      s += `<path d="${gArc(cx, cy, r, G_A0, G_A1)}" class="cg-track" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
      if (z.on && z.set != null) {
        const a = t2a(z.set);
        s += `<path d="${gArc(cx, cy, r, G_A0, Math.max(G_A0 + 0.01, a))}" fill="none" stroke="url(#cgCold)" stroke-width="${w}" stroke-linecap="round"/>`;
        s += `<path d="${gArc(cx, cy, r, Math.min(a, G_A1 - 0.01), G_A1)}" fill="none" stroke="url(#cgWarm)" stroke-width="${w}" stroke-linecap="round"/>`;
        const seat = polar(cx, cy, r, a);
        s += `<g transform="translate(${seat[0].toFixed(1)},${seat[1].toFixed(1)}) rotate(${a.toFixed(1)}) scale(0.36)">`
          + `<path d="${G_NEEDLE}" fill="#F2933A" stroke="#FFB55E" stroke-width="1" stroke-opacity=".55" stroke-linejoin="round"/></g>`;
      }
      s += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" dominant-baseline="central" class="cg-zone-big${z.on ? "" : " cg-dim"}">${z.dead ? "--" : (z.set == null ? "--" : this._fmt(z.set))}</text>`;
      if (z.now != null) {
        s += `<text x="${cx}" y="${cy + 21}" text-anchor="middle" class="cg-zone-now">`
          + `<tspan class="cg-dim">${escapeText(this._t("now"))} </tspan><tspan>${this._fmt(z.now)}&#176;</tspan></text>`;
      }
      if (z.on) {
        s += `<g transform="translate(102,50) scale(.5)" class="cg-clover"><path d="${fanGlyph()}"/></g>`;
      }
      return s + "</svg>";
    }

    _t(k) {
      const M = {
        average: { en: "Average", es: "Promedio" },
        running: { en: "running", es: "encendidos" },
        now: { en: "NOW", es: "AHORA" },
        off_word: { en: "Off", es: "Apagado" },
        all_off: { en: "All off", es: "Apagar todo" },
        sync: { en: "Sync all", es: "Igualar todo" },
        unavailable: { en: "Unavailable", es: "No disponible" },
        cooling: { en: "COOLING", es: "ENFRIANDO" },
        close: { en: "Close", es: "Cerrar" },
        swing: { en: "SWING", es: "SWING" },
        led: { en: "LED", es: "LED" },
        sound: { en: "SOUND", es: "SONIDO" },
      };
      const lang = langOf(this._hass);
      const row = M[k] || {};
      return row[lang] || row.en || k;
    }


    // ==========================================================================
    // ZONE LAYOUT  (handoff_zone_card). The shipped grid of mini gauges is still
    // here behind `layout: "classic"`, because a look is a preference and taking
    // one away is not a release note anybody wants to read.
    // ==========================================================================

    // The sheet's toggles are separate switch entities on the same device, the way
    // the single dial finds them. Cached per entity id: this runs inside the
    // signature, which runs on every hass write in the house.
    /* Same test the dial uses: read the resolved text colour back and decide which
       way round the ground is, because Home Assistant publishes no light/dark flag
       and prefers-color-scheme does not follow a hand-picked HA theme. */
    _inkGround(el) {
      try {
        const m = /([0-9.]+)[^0-9.]+([0-9.]+)[^0-9.]+([0-9.]+)/.exec(getComputedStyle(el).color);
        if (!m) return "dark";
        const l = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
        return l < 0.5 ? "light" : "dark";
      } catch (e) { return "dark"; }
    }

    _zoneSiblings(id) {
      this._sibCache = this._sibCache || {};
      if (this._sibCache[id]) return this._sibCache[id];
      const hass = this._hass;
      const out = {};
      const reg = hass && hass.entities;
      const main = reg ? reg[id] : null;
      const devId = main ? main.device_id : null;
      if (devId && reg) {
        for (const eid in reg) {
          const ent = reg[eid];
          if (!ent || ent.device_id !== devId) continue;
          if (eid.indexOf("switch.") !== 0) continue;
          if (!out.led && eid.indexOf("_screen_display") !== -1) out.led = eid;
          else if (!out.sound && eid.indexOf("_prompt_tone") !== -1) out.sound = eid;
          else if (!out.swing && eid.indexOf("_swing_vertical") !== -1) out.swing = eid;
        }
      }
      this._sibCache[id] = out;
      return out;
    }

    // fan_mode is a NAME, not a percentage. Position in the entity's own list, with
    // auto meaning the absence of a value rather than a speed.
    _zoneFanPct(a) {
      const fm = a.fan_mode;
      if (!fm || String(fm).toLowerCase() === "auto") return null;
      const list = Array.isArray(a.fan_modes)
        ? a.fan_modes.filter((x) => String(x).toLowerCase() !== "auto") : [];
      if (!list.length) return null;
      const i = list.findIndex((x) => String(x).toLowerCase() === String(fm).toLowerCase());
      if (i < 0) return null;
      return clamp(Math.round(((i + 1) / list.length) * 100), 1, 100);
    }

    /* Every string that reaches the module is escaped HERE, at the boundary. The
       module concatenates names straight into markup, so a friendly_name carrying a
       quote or an angle bracket would otherwise break the card, and a crafted one
       would inject. Escaping at the edge means the module stays verbatim. */
    /* What a tap looks like before the unit answers.

       The dial has had this since it shipped; the zone card had none, so every tap on
       a mode, a preset, a toggle or a stepper sat there doing nothing visible until
       Home Assistant reported the change back. On these units that is seconds, and it
       reads as a card that ignored you. So people tap again, which is worse.

       Held per room and per field, cleared the moment the live value agrees, and
       expiring on the same timer the dial uses so a refused command cannot leave a
       lie on screen indefinitely. */
    _zoneOptSet(id, field, value) {
      this._zoneOpt = this._zoneOpt || {};
      const o = this._zoneOpt[id] || (this._zoneOpt[id] = {});
      o[field] = value;
      o.until = Date.now() + OPT_HOLD_MS;
    }
    _zoneOptGet(id, field, live) {
      const o = this._zoneOpt && this._zoneOpt[id];
      if (!o || !o.until || Date.now() >= o.until) return live;
      if (!(field in o)) return live;
      // reality caught up: drop it rather than hold a value that is now just the value
      if (o[field] === live) { delete o[field]; return live; }
      return o[field];
    }

    _zoneModel() {
      const r = this._range();
      /* Every zone here is called "Aire <Room>". Without this the shared prefix eats
         the width of a tile five times over and every name reads as the part they all
         have in common, which is the exact failure _shortNames exists to prevent. */
      const raw = this._zones.map((z) => {
        const a0 = (this._st(z.entity) || {}).attributes || {};
        return z.name || a0.friendly_name || z.entity;
      });
      const short = this._shortNames(raw);
      const zones = this._zones.map((z, zi) => {
        const st = this._st(z.entity);
        const a = (st && st.attributes) || {};
        const dead = !st || st.state === "unavailable" || st.state === "unknown";
        const sib = this._zoneSiblings(z.entity);
        const sw = (key) => {
          const t = sib[key] && this._hass.states[sib[key]];
          return t ? t.state === "on" : false;
        };
        const rawName = z.name || a.friendly_name || z.entity;
        const opt = (f, live) => this._zoneOptGet(z.entity, f, live);
        return {
          id: z.entity,
          name: escapeText(short[zi] || rawName),
          title: escapeText(rawName),
          room: dead ? null : num(a.current_temperature),
          set: dead ? null : opt("set", this._setpoint(st)),
          mode: dead ? "unavailable" : opt("mode", st.state),
          preset: opt("preset", this._zonePreset(a)),
          fan: this._zoneFanPct(a),
          swing: opt("swing", sib.swing ? sw("swing") : (a.swing_mode != null &&
            String(a.swing_mode).toLowerCase() !== "off")),
          led: opt("led", sw("led")),
          sound: opt("sound", sw("sound")),
          dead,
          // the sheet only offers what this unit actually advertises
          modes: Array.isArray(a.hvac_modes) && a.hvac_modes.length ? a.hvac_modes.slice() : null,
          presets: Array.isArray(a.preset_modes) && a.preset_modes.length
            ? a.preset_modes.map((p) => String(p).toUpperCase()) : null,
        };
      });
      return {
        name: escapeText(this._config.name || "House"),
        zones,
        target: this._zoneTarget,
        min: r.lo, max: r.hi,
      };
    }

    // "" unless the entity advertises this preset, so a value reported mid-change
    // never paints a glyph, exactly as on the single dial.
    _zonePreset(a) {
      const p = a.preset_mode;
      if (p == null || p === "") return "";
      const list = Array.isArray(a.preset_modes) ? a.preset_modes : [];
      return list.some((x) => String(x).toLowerCase() === String(p).toLowerCase())
        ? String(p).toUpperCase() : "";
    }

    _renderZoneCard() {
      const model = this._zoneModel();
      const d = ZONE.derive(model);
      const ui = this._zui || (this._zui = {});
      // The module hard-codes one column per zone. That is right for five and
      // unreadable for nine, and it also drops zone_rows, which is a shipped key.
      /* The module hard-codes one column per zone, which is right for five and
         unreadable for nine, and squashes at any width. auto-fit with a real minimum
         is the shipped card's own idiom: it gives one row when the row fits and wraps
         when it does not. zone_rows still overrides it, because it is a shipped key
         and someone asked for that shape on purpose. */
      const forced = this._gridStyle("zone_rows", model.zones.length);
      const cols = forced
        ? forced.replace(/^ style="/, "").replace(/"$/, "")
        : "grid-template-columns:repeat(auto-fit,minmax(126px,1fr))";

      const card = this.shadowRoot && this.shadowRoot.querySelector(".cg-card");
      if (card) card.setAttribute("data-ink", this._inkGround(card));
      const orient = ["horizontal", "vertical"].indexOf(this._config.orientation) >= 0
        ? this._config.orientation : "auto";
      let html = '<div class="cg-zonecard" data-orient="' + orient
        + '" style="position:relative; font-family:' + FONT_STACK + ';">';
      html += '<div style="display:flex; align-items:baseline; justify-content:space-between;'
        + ' gap:14px; padding-bottom:6px; border-bottom:1px solid rgba(225,231,237,.12);">'
        + '<span style="font:600 22px/1 inherit; letter-spacing:.08em; text-transform:uppercase;'
        + ' color:var(--primary-text-color, #f2f5f8);">' + model.name + '</span>'
        // the shipped card's N / M survives: d.on alone cannot tell 4 of 5 from 4 of 9,
        // and the total is the reading that shows a zone has fallen out of the config.
        + '<span style="display:flex; align-items:center; gap:8px;'
        + ' font:600 12px/1 ui-monospace,monospace; letter-spacing:.07em;">'
        + '<span style="color:var(--cg-accent, #27d3ff);">' + d.cooling + ' ' + this._t("cooling") + '</span>'
        + '<span style="color:#546070;">·</span>'
        + '<span style="color:var(--secondary-text-color, #8b95a2);">' + d.on + ' / '
        + model.zones.length + '</span></span></div>';

      html += '<div class="cg-zonecard-body" style="display:grid;'
        + ' grid-template-columns:236px minmax(0,1fr); gap:18px; align-items:stretch;'
        + ' margin-top:10px;">' + ZONE.hero(model, d)
        + '<div class="cg-zonecard-tiles" style="display:grid; ' + cols + '; gap:10px;'
        + ' align-self:center; min-height:' + ZONE.arcRatio() + ';">'
        + model.zones.map((z, i) => ZONE.tile(z, i, d)).join("") + "</div></div>";

      if (this._config.group_actions !== false) {
        /* The module offers presets from a hardcoded four. The card asks the entities,
           the way the shipped bar always has, so a unit with a preset outside that set
           is offered it and one that rejects a member never sees it. */
        const acts = ZONE.groupActions(model, d, ui)
          .filter((a) => String(a.id).indexOf("preset:") !== 0);
        for (const p of this._sharedPresets().slice(0, 2)) {
          acts.push({ id: "preset:" + p, lit: true,
            label: escapeText(String(p).replace(/_/g, " ")) });
        }
        html += ZONE.footer(acts);
      }
      html += "</div>";

      /* Two independent writes, each skipped when nothing changed. Rebuilding the
         whole card on every state push in the house meant re-running the theme pass
         over the markup and re-creating every tile, every glass surface and the open
         sheet, several times a second on a busy house. The sheet is the card's own
         markup and already themed, so only the module's half goes through themeZone. */
      if (html !== this._rawHtml) {
        this._rawHtml = html;
        const themed = themeZone(html);
        if (themed !== this._bodyHtml) { this._bodyHtml = themed; this._inner.innerHTML = themed; }
      }
      const sheetHtml = (ui.sheetIndex != null && model.zones[ui.sheetIndex])
        ? this._zoneSheetHtml(model.zones[ui.sheetIndex], ui.sheetIndex) : "";
      if (sheetHtml !== this._sheetHtml) {
        this._sheetHtml = sheetHtml;
        this._sheetHost.innerHTML = sheetHtml;
      }
    }


    /* The room sheet, built here rather than by the module, so it is the SAME object
       the dial opens: same glass, same pill modes lit in their own mode ink, same
       preset row, same icon toggles, same round close. The module's own sheet was a
       plainer second copy of the same idea, and two sheets that drift is worse than
       one that is shared.

       It also lives OUTSIDE .cg-zonecard on purpose. That element carries
       container-type for the layout breakpoint, and containment makes an element the
       containing block for fixed-position descendants, which would have trapped a
       full-screen overlay inside the card. Sitting outside it, .ct-pop is fixed to
       the viewport, which is what makes a tap anywhere outside close it. */
    _zoneSheetHtml(z, i) {
      if (!z) return "";
      const st = this._st(z.id);
      const a = (st && st.attributes) || {};
      const modes = (Array.isArray(a.hvac_modes) && a.hvac_modes.length
        ? a.hvac_modes : ["off", "cool"]).filter((m) => typeof m === "string");
      const presets = (Array.isArray(a.preset_modes) ? a.preset_modes : [])
        .filter((p) => typeof p === "string");
      const sib = this._zoneSiblings(z.id);

      /* The sheet publishes the ROOM's mode ink, which is what the shared stylesheet
         lights a selected preset and a lit toggle with. Without it they fell back to
         the fixed cyan accent, so a room in AUTO showed a yellow mode button above a
         cyan preset row while the dial showed both in yellow. Same sheet, and now the
         same answer to "what colour is this room". */
      const ink = (ZONE.MODES[z.mode] || ZONE.MODES.off).ink;
      let out = '<div class="ct-pop open" data-act="backdrop">'
        + '<div class="ct-sheet" data-act="panel" style="--ct-mode-ink:' + ink + '">'
        + '<button type="button" class="ct-popclose" data-act="close" aria-label="'
        + escapeAttr(this._t("close")) + '">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
        + '<path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" '
        + 'stroke-width="2.4" stroke-linecap="round"/></svg></button>'
        + '<div class="ct-poptitle">' + z.title + "</div>";

      for (const m of modes) {
        const ink = (ZONE.MODES[m] || ZONE.MODES.off).ink;
        out += '<button type="button" data-zmode="' + escapeAttr(m) + '"'
          + (z.mode === m ? ' class="active"' : "")
          + ' style="--ct-lit:' + ink + '">'
          + escapeText(modeName(this._hass, m) || String(m).replace(/_/g, " ")) + "</button>";
      }
      if (presets.length) {
        out += '<div class="ct-presets">';
        for (const p of presets) {
          out += '<button type="button" class="ct-preset'
            + (String(z.preset).toUpperCase() === String(p).toUpperCase() ? " active" : "")
            + '" data-zpre="' + escapeAttr(p) + '">'
            + escapeText(String(p).replace(/_/g, " ")) + "</button>";
        }
        out += "</div>";
      }
      // A toggle with nothing behind it is drawn dimmed and inert rather than left
      // out, so the row does not reflow from room to room.
      const togs = [
        ["swing", !!(sib.swing || (Array.isArray(a.swing_modes) && a.swing_modes.length))],
        ["led", !!sib.led],
        ["sound", !!sib.sound],
      ];
      out += '<div class="ct-toggles">';
      for (const [kind, live] of togs) {
        const def = TOGGLE_DEFS.find((t) => t.kind === kind);
        out += '<button type="button" class="ct-toggle' + (z[kind] ? " on" : "")
          + (live ? "" : " disabled") + '" data-ztog="' + kind + '">'
          + '<svg class="ct-tg-ic" viewBox="-12 -12 24 24" aria-hidden="true">'
          + def.svg + "</svg>"
          + '<span class="ct-tg-lb">' + escapeText(this._t(kind)) + "</span></button>";
      }
      out += "</div></div></div>";
      return out;
    }

    // A tap that only moves interface state still has to repaint, and the signature
    // gate would otherwise swallow it.
    _zoneRepaint() { this._sig = null; this._render(); }

    _zoneAct(el) {
      const model = this._zoneModel();
      const ui = this._zui || (this._zui = {});
      /* A tile scopes itself with data-zone. The SHEET does not: it is a sibling of
         the tile grid, not a descendant of one tile, so its own room is the one the
         interface state says is open. Without this every control inside the sheet
         resolved to no room and did nothing at all. */
      const zoneEl = el.closest("[data-zone]");
      const inSheet = !!(el.closest('[data-act="panel"]') || el.closest('[data-act="backdrop"]'));
      const idx = zoneEl ? parseInt(zoneEl.dataset.zone, 10)
        : (inSheet && ui.sheetIndex != null ? ui.sheetIndex : -1);
      const z = idx >= 0 ? model.zones[idx] : null;
      const act = el.closest("[data-act]");
      const g = el.closest("[data-gact]");
      const zm = el.closest("[data-zmode]");
      const zp = el.closest("[data-zpre]");
      const zt = el.closest("[data-ztog]");

      if (zm && z) {
        this._zoneOptSet(z.id, "mode", zm.dataset.zmode);
        this._zoneRepaint();
        this._call("climate", "set_hvac_mode", { entity_id: z.id, hvac_mode: zm.dataset.zmode });
        return true;
      }
      if (zp && z) {
        const p = zp.dataset.zpre;
        // PREMAP is the setpoint each preset IMPLIES. Write the preset and let the
        // device report its own setpoint back rather than guessing it here.
        // The button carries the entity's OWN spelling now, so the exact match is
        // the normal path; the case-insensitive one is the fallback for a config that
        // named a preset in different case.
        const st = this._st(z.id);
        const list = ((st && st.attributes) || {}).preset_modes || [];
        const real = list.find((x) => String(x) === p)
          || list.find((x) => String(x).toUpperCase() === String(p).toUpperCase());
        if (real) {
          this._zoneOptSet(z.id, "preset", String(real).toUpperCase());
          this._zoneRepaint();
          this._call("climate", "set_preset_mode", { entity_id: z.id, preset_mode: real });
        }
        return true;
      }
      if (zt && z) {
        const kind = zt.dataset.ztog;
        const sib = this._zoneSiblings(z.id);
        if (sib[kind]) {
          this._zoneOptSet(z.id, kind, !z[kind]);
          this._zoneRepaint();
          this._call("switch", z[kind] ? "turn_off" : "turn_on", { entity_id: sib[kind] });
        } else if (kind === "swing") {
          const a = ((this._st(z.id) || {}).attributes) || {};
          const list = Array.isArray(a.swing_modes) ? a.swing_modes : [];
          const want = z.swing ? "off" : (list.find((x) => String(x).toLowerCase() !== "off") || "on");
          if (list.length) {
            this._zoneOptSet(z.id, "swing", !z.swing);
            this._zoneRepaint();
            this._call("climate", "set_swing_mode", { entity_id: z.id, swing_mode: want });
          }
        }
        return true;
      }
      /* The group buttons are checked BEFORE the generic data-act branch. The footer
         carries data-act="footer" so that a tap on the bar itself is swallowed rather
         than closing anything, and closest() walks up: from a button inside the bar it
         reached that swallow first and every group action did nothing. */
      if (g) {
        const id = g.dataset.gact;
        if (id === "alloff") { this._zui.confirmOff = true; this._zoneRepaint(); return true; }
        if (id === "confirm") {
          this._zui.confirmOff = false;
          this._groupAction("off");
          this._zoneRepaint();
          return true;
        }
        if (id === "allon") {
          /* No blanket cool, but no dead button either. The first version only wrote
             for zones whose previous mode it had happened to see, and it can only see
             one by watching that zone turn off. A card opened on an already-off house
             remembered nothing, so the button did nothing at all, which is exactly
             when it is the only button on offer.

             Three steps, most informed first: the mode it was last seen in, if the
             entity still advertises it; then climate.turn_on, which is the device
             choosing for itself rather than the card guessing; then the entity's own
             first non-off mode, for a unit too old to have turn_on. */
          const prev = this._zonePrev || {};
          model.zones.forEach((z) => {
            const st = this._st(z.id);
            if (!st) return;
            const a = st.attributes || {};
            const modes = Array.isArray(a.hvac_modes) ? a.hvac_modes : [];
            const want = prev[z.id];
            if (want && (!modes.length || modes.indexOf(want) >= 0)) {
              this._call("climate", "set_hvac_mode", { entity_id: z.id, hvac_mode: want });
              return;
            }
            if ((num(a.supported_features) || 0) & CLIMATE_TURN_ON) {
              this._call("climate", "turn_on", { entity_id: z.id });
              return;
            }
            const first = modes.find((m) => String(m).toLowerCase() !== "off");
            if (first) this._call("climate", "set_hvac_mode", { entity_id: z.id, hvac_mode: first });
          });
          return true;
        }
        if (id === "sync") {
          const d = ZONE.derive(model);
          this._groupAction("setpoint", String(Math.round(d.target)));
          return true;
        }
        if (id.indexOf("preset:") === 0) {
          // the id carries the entity's OWN spelling, so nothing is re-cased on the way
          this._groupAction("preset", id.slice(7));
          return true;
        }
      }
      if (act) {
        const a = act.dataset.act;
        if (a === "sheet" && idx >= 0) { this._zui.sheetIndex = idx; this._zoneRepaint(); return true; }
        if (a === "close" || a === "backdrop") { this._zui.sheetIndex = null; this._zoneRepaint(); return true; }
        if (a === "panel" || a === "footer" || a === "house") return true; // swallow, never close
        if ((a === "inc" || a === "dec") && z && z.set != null) {
          const step = num((((this._st(z.id) || {}).attributes) || {}).target_temp_step) || 1;
          const v = z.set + (a === "inc" ? step : -step);
          this._zoneOptSet(z.id, "set", v);
          this._zoneRepaint();
          this._call("climate", "set_temperature", { entity_id: z.id, temperature: v });
          return true;
        }
      }
      return false;
    }

    _render() {
      if (!this._built || !this._hass || !this._config) return;
      const sig = this._signature();
      if (sig === this._sig) return; // nothing this card shows has changed
      this._sig = sig;

      // Remember the last real mode of every zone, so All on can put the house back
      // the way it was instead of turning everything to cool.
      this._zonePrev = this._zonePrev || {};
      for (const z of this._zones) {
        const st = this._st(z.entity);
        if (st && st.state !== "off" && st.state !== "unavailable" && st.state !== "unknown") {
          this._zonePrev[z.entity] = st.state;
        }
      }
      if (this._config.layout !== "classic") { this._renderZoneCard(); return; }
      // the classic path writes _inner itself, so the zone caches no longer describe it
      this._rawHtml = this._bodyHtml = this._sheetHtml = null;
      if (this._sheetHost) this._sheetHost.innerHTML = "";

      const zones = this._zones.map((z) => this._live(z));
      const shortened = this._shortNames(zones.map((z) => z.name));
      zones.forEach((z, i) => { z.short = shortened[i]; });
      const hero = this._heroPick(zones);
      const running = zones.filter((z) => z.on).length;
      const heroSet = hero.kind === "average" ? hero.set : (hero.kind === "zone" ? hero.z.set : null);

      // One hidden defs block for the whole card: the hero and every zone gauge
      // share these gradients, so they are declared once rather than per-SVG.
      let html = '<svg class="cg-defs" aria-hidden="true" focusable="false"><defs>'
        + '<linearGradient id="cgCold" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2aa7d6"/><stop offset="1" stop-color="#7fe4ff"/></linearGradient>'
        + '<linearGradient id="cgWarm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC98A"/><stop offset="1" stop-color="#F2933A"/></linearGradient>'
        + '<filter id="cgGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>'
        + "</defs></svg>";

      html += '<div class="cg-head">'
        + `<span class="cg-title">${escapeText(this._config.name || "House")}</span>`
        + `<span class="cg-count">${running} / ${zones.length}</span>`
        + "</div>";

      // Hero and the group buttons share the left column, so the buttons fill the
      // space under the gauge instead of stretching across the whole card.
      html += `<div class="cg-body"><div class="cg-left"><div class="cg-hero">${this._heroSvg(hero, zones)}</div>`;
      html += this._actionsHtml(heroSet);
      // A forced row count can leave the zone strip much shorter than the hero
      // column beside it, which reads as a hole in the card rather than a layout.
      // When rows are pinned the tiles fill the height instead.
      const zGrid = this._gridStyle("zone_rows", zones.length);
      html += `</div><div class="cg-zones${zGrid ? " cg-zones-fill" : ""}"${zGrid}>`;
      for (const z of zones) {
        const cls = "cg-zone" + (z.on ? " on" : "") + (z.dead ? " dead" : "")
          + (this._focus === z.id ? " focused" : "");
        html += `<button type="button" class="${cls}" data-zone="${escapeAttr(z.id)}" `
          + `style="--cg-mode:${z.color}" aria-pressed="${this._focus === z.id ? "true" : "false"}">`
          + '<span class="cg-zone-head">'
          + `<span class="cg-zone-name" title="${escapeAttr(z.name)}">${escapeText(z.short || z.name)}</span>`
          + `<span class="cg-zone-mode">${escapeText(z.dead ? this._t("unavailable") : (z.on ? String(z.state).toUpperCase().replace("_", " ") : "OFF"))}</span>`
          + "</span>"
          + this._zoneSvg(z)
          + "</button>";
      }
      html += "</div></div>";
      this._inner.innerHTML = html;
    }

    _actionsHtml(heroSet) {
      if (this._config.group_actions === false) return "";
      const btns = [`<button type="button" class="cg-act" data-act="off">${escapeText(this._t("all_off"))}</button>`];
      if (heroSet != null) {
        const target = Math.round(heroSet);
        btns.push(`<button type="button" class="cg-act" data-act="setpoint" data-arg="${target}">`
          + `${escapeText(this._t("sync"))} ${target}&#176;</button>`);
      }
      for (const p of this._sharedPresets().slice(0, 2)) {
        btns.push(`<button type="button" class="cg-act cg-act-preset" data-act="preset" data-arg="${escapeAttr(p)}">`
          + `${escapeText(p.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()))}</button>`);
      }
      const forced = this._gridStyle("action_rows", btns.length);
      // With a row count the bar becomes a real grid; without one it stays a
      // flex row that wraps on its own.
      const cls = forced ? "cg-actions cg-actions-grid" : "cg-actions";
      return `<div class="${cls}"${forced}>` + btns.join("") + "</div>";
    }
  }


  /* --------------------------------------------------------------------------
     Group card editor. The card had none: Home Assistant showed "Visual editor not
     supported" and left YAML as the only way in, which for a card whose whole point
     is a list of entities is not an editing experience.

     Same shape as the dial's: one ha-form, the everyday fields at the top, the rest
     folded into sections that start closed. Fields that only mean something on one
     layout are only offered on that layout, rather than sitting there inert.
     ----------------------------------------------------------------------- */
  class ClimateClusterGroupCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = Object.assign({}, config);
      this._update();
    }
    set hass(h) { this._hass = h; this._update(); }

    // entities may be bare ids or { entity, name } objects. The picker speaks ids, so
    // the objects are remembered here and merged back on the way out: converting them
    // to ids would silently drop every per-zone name the user typed.
    _ids(list) {
      return (Array.isArray(list) ? list : []).map((e) =>
        (e && typeof e === "object") ? e.entity : e).filter((x) => typeof x === "string");
    }
    _mergeEntities(ids) {
      const prev = Array.isArray(this._config.entities) ? this._config.entities : [];
      const named = {};
      for (const e of prev) if (e && typeof e === "object" && e.entity) named[e.entity] = e;
      return ids.map((id) => named[id] || id);
    }

    _schema() {
      const classic = this._config.layout === "classic";
      const rows = [
        { name: "entities", required: true,
          selector: { entity: { domain: "climate", multiple: true } } },
        { name: "name", selector: { text: {} } },
        { name: "orientation", selector: { select: { mode: "list", options: [
          { value: "auto", label: this._t("editor.opt.orient_auto") },
          { value: "horizontal", label: this._t("editor.opt.orient_h") },
          { value: "vertical", label: this._t("editor.opt.orient_v") },
        ] } } },
      ];
      const look = [
        { name: "appearance", selector: { select: { mode: "dropdown", options: [
          { value: "theme", label: this._t("editor.opt.appearance_theme") },
          { value: "glass-dark", label: this._t("editor.opt.appearance_glass_dark") },
          { value: "glass-light", label: this._t("editor.opt.appearance_glass_light") },
        ] } } },
        { name: "accent", selector: { text: {} } },
        { name: "glass_color", selector: { text: {} } },
        { name: "glass_opacity", selector: { number: { min: 0, max: 1, step: 0.02, mode: "slider" } } },
      ];
      const layout = [
        { name: "zone_rows", selector: { number: { min: 1, max: 6, mode: "box" } } },
        { name: "group_actions", selector: { boolean: {} } },
        { name: "action_rows", selector: { number: { min: 1, max: 4, mode: "box" } } },
      ];
      const range = [
        { name: "min_temp", selector: { number: { mode: "box" } } },
        { name: "max_temp", selector: { number: { mode: "box" } } },
        { name: "temperature_unit", selector: { select: { mode: "dropdown", options: [
          { value: "F", label: "F" }, { value: "C", label: "C" },
        ] } } },
      ];
      // hero selection and tap-to-focus are drawn by the classic layout only. Offering
      // them on the zone layout would be offering a control that does nothing.
      if (classic) {
        layout.push({ name: "hero", selector: { select: { mode: "dropdown", options: [
          { value: "average", label: this._t("editor.opt.hero_average") },
          { value: "hottest", label: this._t("editor.opt.hero_hottest") },
        ] } } });
        layout.push({ name: "tap_zone", selector: { select: { mode: "dropdown", options: [
          { value: "focus", label: this._t("editor.opt.tap_focus") },
          { value: "more-info", label: this._t("editor.opt.tap_more_info") },
        ] } } });
      }
      return rows.concat([
        { name: "look", type: "expandable", title: this._t("editor.sec.appearance"), schema: look },
        { name: "grid", type: "expandable", title: this._t("editor.sec.layout"), schema: layout },
        { name: "range", type: "expandable", title: this._t("editor.sec.range"), schema: range },
      ]);
    }

    _t(k) {
      const M = {
        "editor.opt.orient_auto": { en: "Automatic", es: "Automatico" },
        "editor.opt.orient_h": { en: "Horizontal, hero beside the rooms",
          es: "Horizontal, medidor al lado de los cuartos" },
        "editor.opt.orient_v": { en: "Vertical, rooms under the hero",
          es: "Vertical, cuartos debajo del medidor" },
        "editor.opt.appearance_theme": { en: "Theme (follows Home Assistant)", es: "Tema (sigue a Home Assistant)" },
        "editor.opt.appearance_glass_dark": { en: "Frosted glass, dark", es: "Vidrio esmerilado, oscuro" },
        "editor.opt.appearance_glass_light": { en: "Frosted glass, light", es: "Vidrio esmerilado, claro" },
        "editor.opt.hero_average": { en: "Average of the zones", es: "Promedio de las zonas" },
        "editor.opt.hero_hottest": { en: "The hottest room", es: "El cuarto mas caliente" },
        "editor.opt.tap_focus": { en: "Focus it into the hero", es: "Enfocarla en el medidor" },
        "editor.opt.tap_more_info": { en: "Open more-info", es: "Abrir mas informacion" },
        "editor.sec.appearance": { en: "Appearance", es: "Apariencia" },
        "editor.sec.layout": { en: "Layout", es: "Distribucion" },
        "editor.sec.range": { en: "Temperature range", es: "Rango de temperatura" },
        "label.entities": { en: "Rooms", es: "Cuartos" },
        "label.name": { en: "Card title", es: "Titulo de la tarjeta" },
        "label.orientation": { en: "Shape", es: "Forma" },
        "helper.orientation": {
          en: "Automatic uses a row when the card is wide enough and stacks when it is not.",
          es: "Automatico usa una fila cuando la tarjeta es ancha y apila cuando no." },
        "label.accent": { en: "Accent color", es: "Color de acento" },
        "label.zone_rows": { en: "Rows of rooms", es: "Filas de cuartos" },
        "label.action_rows": { en: "Rows of buttons", es: "Filas de botones" },
        "label.group_actions": { en: "Show the button bar", es: "Mostrar la barra de botones" },
        "helper.zone_rows": { en: "Leave empty to let the rooms wrap on their own.",
          es: "Dejalo vacio para que los cuartos fluyan solos." },
        "helper.entities": { en: "Every room this card controls. Order is the order they appear.",
          es: "Cada cuarto que controla esta tarjeta. El orden es el que se muestra." },
      };
      const row = M[k] || {};
      return row[langOf(this._hass)] || row.en || k;
    }

    _valueChanged(ev) {
      ev.stopPropagation();
      const cfg = Object.assign({}, this._config, ev.detail.value);
      for (const sec of ["look", "grid", "range"]) {
        if (cfg[sec] && typeof cfg[sec] === "object") { Object.assign(cfg, cfg[sec]); delete cfg[sec]; }
      }
      if (Array.isArray(cfg.entities)) cfg.entities = this._mergeEntities(this._ids(cfg.entities));
      // An empty field means "unset", not "the string empty". Leaving it in writes a
      // key the card then has to defend against.
      for (const k of Object.keys(cfg)) {
        if (cfg[k] === "" || cfg[k] === null || cfg[k] === undefined) delete cfg[k];
      }
      // Defaults are not keys. layout is deliberately NOT offered in the form any
      // more, and Object.assign carries an existing one through untouched, so a YAML
      // config that asked for the classic gauges keeps them.
      if (cfg.orientation === "auto") delete cfg.orientation;
      const changed = JSON.stringify(cfg) !== JSON.stringify(this._config);
      this._config = cfg;
      if (changed) {
        this.dispatchEvent(new CustomEvent("config-changed",
          { detail: { config: cfg }, bubbles: true, composed: true }));
      }
      this._update();
    }

    _update() {
      if (!this._hass || !this._config) return;
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.addEventListener("value-changed", (e) => this._valueChanged(e));
        this._form.computeLabel = (sc) => this._t("label." + sc.name) !== "label." + sc.name
          ? this._t("label." + sc.name) : (sc.title || prettifyName(sc.name));
        this._form.computeHelper = (sc) => this._t("helper." + sc.name) !== "helper." + sc.name
          ? this._t("helper." + sc.name) : "";
        const root = this.shadowRoot || this.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = "ha-form{display:block;padding:8px 4px;}";
        root.appendChild(style);
        root.appendChild(this._form);
      }
      const data = Object.assign({}, this._config, {
        entities: this._ids(this._config.entities),
        orientation: ["horizontal", "vertical"].indexOf(this._config.orientation) >= 0
          ? this._config.orientation : "auto",
      });
      this._form.hass = this._hass;
      this._form.schema = this._schema();
      this._form.data = data;
    }
  }

  if (!customElements.get("climate-cluster-group-card")) {
    customElements.define("climate-cluster-group-card", ClimateClusterGroupCard);
  }
  if (!customElements.get("climate-cluster-group-card-editor")) {
    customElements.define("climate-cluster-group-card-editor", ClimateClusterGroupCardEditor);
  }
  ClimateClusterGroupCard.getConfigElement = function () {
    return document.createElement("climate-cluster-group-card-editor");
  };
  ClimateClusterGroupCard.getStubConfig = function (hass) {
    const ids = hass && hass.states
      ? Object.keys(hass.states).filter((id) => id.startsWith("climate.")).slice(0, 4) : [];
    return { entities: ids.length ? ids : ["climate.example"] };
  };

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "climate-cluster-card",
    name: "Climate Cluster Card",
    description: "Wide-arc instrument-cluster dial for any climate entity: two-ring temperature/fan gauge, glass mode popup, optional swing/LED/sound toggles and your own chips.",
    preview: true,
    documentationURL: "https://github.com/rickyfont94/climate-cluster-card",
    // Entity-first card picker: Home Assistant asks every registered card for a
    // suggestion when you add a card by entity. Without this the card only ever
    // shows up in the by-name list. Returns an array of { config } entries; the
    // frontend wraps the call in a try/catch, so a throw here is not fatal.
    getEntitySuggestion: (hass, entityId) =>
      (typeof entityId === "string" && entityId.indexOf("climate.") === 0)
        ? [{ config: { type: "custom:climate-cluster-card", entity: entityId } }]
        : [],
  });
  window.customCards.push({
    type: "climate-cluster-group-card",
    name: "Climate Cluster Group Card",
    description: "One house gauge plus every zone as a live mini instrument. Tap a zone to focus it.",
    preview: true,
    documentationURL: "https://github.com/rickyfont94/climate-cluster-card",
  });
})();
