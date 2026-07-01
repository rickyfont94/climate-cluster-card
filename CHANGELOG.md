# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-07-01

### Fixed
- `extra_toggles` select chips now work when the select advertises options but no option is chosen yet (state `unknown`, common on Tuya "smart wind" and mode selects). Such a chip previously rendered dimmed and inert, so it could not be tapped; it now stays a live cycle chip, a tap picks the first option, and it shows its name instead of the literal word "unknown" until an option is chosen. A genuinely `unavailable` entity still renders disabled.

## [1.3.0] - 2026-07-01

### Added
- `extra_toggles` option to add your own controls to the mode pop-up. Point it at any `switch`, `input_boolean`, `select`, or `input_select` entity (bare `domain.object_id` strings, or `{ entity, name, icon }` for a custom label and icon) and each renders as a chip: switches toggle, selects cycle through their options. Handy for device functions the card does not auto-detect, like anti-mildew, UV, or a gentle-wind mode.
- Swing chip now shows the active swing position and supports a long-press to open a picker of the entity's real swing options, so vane-position devices can jump straight to a position instead of only cycling. The chip updates instantly on tap.

### Fixed
- Swing chip now works on climate entities whose swing options are vane positions (for example MelCloud / Mitsubishi `["Auto", "1".."5", "Swing"]`) or use a capitalized `Off`. The card previously sent a hardcoded lowercase `off`, which is not a member of those lists, so Home Assistant rejected the call and the chip stopped responding. The off direction now resolves a real off-like member from the entity's own `swing_modes` (matched case-insensitively, sent with the entity's own casing); when there is no off member the chip cycles to the next real swing option instead. Midea and other switch-backed swing controls are unaffected.

## [1.2.1] - 2026-07-01

### Fixed
- Touch center tap on iOS (iPhone / iPad) now reliably opens the mode pop-up instead of leaving a focus outline with no pop-up.
- Vertical swipes anywhere on the card now scroll the dashboard, except on the two arc rings, which still drag to set temperature and fan.
- The center no longer flashes a focus square on tap.

## [1.2.0] - 2026-06-30

### Added
- `appearance` option to choose the card background: `theme` (default, follows the active Home Assistant theme) or a translucent frosted-glass panel in a dark (`glass-dark`) or light (`glass-light`) finish that frosts the dashboard wallpaper behind it.
- `glass_color` and `glass_opacity` to tint the frosted-glass panel and set how solid it is (`0` clear to `1` solid). Both apply only to the frosted-glass appearances.
- Light-theme legibility for the hint labels and ticks, so the MODE / FAN / AUTO gesture hints and the numbered tick scale stay readable on light themes.

### Fixed
- The FAN gesture hint no longer washes out the outer arc where the two overlap.
- The thin setpoint numerals now stay legible on the frosted-glass and light backgrounds.
- The current-temperature marker is no longer invisible against the light arc.
- The MODE and NOW labels are easier to tell apart.
- The setpoint needle now follows the mode color instead of always rendering orange in cool mode.

## [1.1.0] - 2026-06-30

### Added
- Follows the active Home Assistant theme through `ha-card` (light and dark). `accent`, `mode_colors`, and `font` still override the theme when set.
- English and Spanish localization, auto-selected from the Home Assistant language.
- Standard `tap_action` / `hold_action` / `double_tap_action` config on the center disc, dispatched through Home Assistant's action conventions (more-info, navigate, call-service, toggle, url, none). Tap opens the mode pop-up by default and hold opens the more-info dialog. The GUI editor gains an Actions section for these.
- Discoverable gestures: faint MODE / FAN / AUTO hint labels (toggle with `show_hints`) and a press-feedback highlight on the center disc, so the dial reads as interactive on a wall tablet.
- The GUI editor now shows an inline warning when the configured minimum temperature is not below the maximum, instead of leaving the card blank.

### Changed
- The fan ring now works with non-Midea climate and fan entities, honoring the entity's real range or `fan_modes`.
- Correct sizing in Sections-view dashboards.

### Fixed
- The gauge no longer disappears when an entity's minimum and maximum temperature are equal (or inverted). The arc geometry now guards the range span so a degenerate range renders a flat dial instead of producing NaN SVG paths.
- Whole degrees now drop the trailing `.0`.
- The Show option for the swing, LED, and sound toggles now forces the chip visible (previously it behaved like Auto). A forced chip with no backing entity renders as an inert, dimmed chip.
- The card font now falls back to the theme font.

## [1.0.6] - 2026-06-29

### Fixed
- Keyboard and screen-reader accessibility for the dial and chips.
- `heat_cool` (range) thermostats now behave correctly.
- A touch scroll-trap on the dial.
- Forced-unit conversion.
- Silent service-call failures now surface errors instead of failing quietly.

## [1.0.5] - 2026-06-29

First public release of the Climate Cluster Card for Home Assistant.

### Added
- Wide-arc instrument-cluster climate dial for any `climate.*` entity.
- Two-ring control: inner ring sets target temperature, outer ring sets fan speed.
- Glass mode pop-up with per-mode glyphs and Swing / LED / Sound toggles.
- Numbered reference scale with a glowing setpoint needle and a current-temp marker.
- Clover fan animation that can spin proportional to the fan value, at a constant rate, or off.
- Fahrenheit and Celsius support with automatic unit, range, and step detection.
- Full GUI editor, no YAML required.
- Auto-discovery of fan / swing / LED / sound sibling entities, tuned for Midea (`midea_ac_lan`).

[1.3.1]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.3.1
[1.3.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.3.0
[1.2.1]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.2.1
[1.2.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.2.0
[1.1.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.1.0
[1.0.6]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.0.6
[1.0.5]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.0.5
