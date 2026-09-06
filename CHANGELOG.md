# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.0] - 2026-09-06

### Added
- **Humidity readout.** A fourth line in the centre stack showing `current_humidity`, drawn only when the entity reports it, so the stack never shifts for one that does not. Control it with `show_humidity`.
- **Horizontal swing.** A second chip driven by the entity's own `swing_horizontal_modes` with `climate.set_swing_horizontal_mode`, or by a `switch` sibling where the integration exposes one (Midea does). When both axes resolve the two chips split the lower-right shelf; with a single axis the original chip keeps its centred position. Control it with `show_swing_h` and `swing_h_entity`.
- The horizontal write follows the same rule as vertical swing and fan: only ever a member of the entity's own list, with the entity's own capitalization, cycling when the list carries no off member.

### Fixed
- A keyboard user could only reach half of a `heat_cool` dial. Arrow, Page, Home and End moved the high setpoint and nothing moved the low one, so the cyan handle was pointer-only. Hold Shift to move the low handle. It can never be driven past the high one.

## [1.7.0] - 2026-09-06

### Changed
- **The visual editor opens quiet.** Adding the card used to confront you with seven section headers and two levels of nesting before you had picked an entity. Now the first screen is the entity, the name, one Appearance group and a single "Show all options" switch: four rows instead of nine. Everything is still there and nothing is renamed, it is one switch away. Measured in the test suite so it stays that way.

### Added
- Tests for the editor itself: the first-screen row count, that every option is still reachable with the switch on, that the preset rename fields track the entity's real presets, and that the disclosure flag is display state that never reaches your saved YAML.

## [1.6.0] - 2026-09-06

### Added
- **Preset row.** The mode pop-up now shows a chip for every member of the entity's own `preset_modes` and writes with `climate.set_preset_mode`. This is what surfaces eco, boost, sleep and comfort on Midea, and the equivalents on Tado, ecobee, Nest and thermostatic radiator valves, with no per-brand knowledge in the card. Control it with `show_presets` (`auto` shows the row whenever the entity advertises presets) and rename individual chips with `preset_names`, for example `{ eco: iECO }`. The written value is always the raw member, never the label.
- **Plus and minus buttons.** A stepper sits either side of the setpoint numerals. Press and hold to repeat. The dial has always been drag-first, but dragging is not available to every hand or every pointer, so this is the discrete alternative that was missing. Control it with `show_steppers`; `auto` shows the pair on a single-setpoint dial and hides it on a `heat_cool` dial, where a bare plus could not say which of the two setpoints it would move.
- Both new sections are in the visual editor, including a rename field per preset.
- Tests for both, including one that holds the stepper through five degrees and asserts a single `set_temperature` is written rather than five.

### Changed
- A stepper burst is trailing-debounced. The arc tracks every tick immediately, but the write waits until you stop, so holding through six degrees is one service call instead of six.

## [1.5.1] - 2026-09-06

### Added
- The mode pop-up has a visible close button. Escape and a backdrop click already closed it, but neither is discoverable on a wall tablet.
- The card honors the operating system "reduce motion" setting. The clover stops spinning and the pop-up stops scaling in for anyone who has asked their platform to reduce animation.

### Changed
- Each mode button in the pop-up now lights in its own mode color instead of a single UI accent, so the pop-up reads as part of the same instrument as the dial.
- The swing chip is 56 by 44 viewBox units, which clears the 44 pixel touch target guideline at a normal dashboard width. It used to be 38 by 30.

### Fixed
- A long card title ran off both ends of the card. Titles are now truncated to what fits above the arc, with the full name kept on a tooltip for hover and screen readers.
- An unavailable entity kept the last temperature arc it painted, so a unit that dropped offline still showed a setpoint behind the dimmed face. The arc and the setpoint needle are now cleared.
- The unavailable label is localized instead of always printing the raw English state.

## [1.5.0] - 2026-09-06

### Added
- The card now appears in Home Assistant's entity-first card picker. Adding a card by picking a climate entity offers Climate Cluster Card directly, instead of only finding it by name in the card list.
- `extra_toggles` accepts `input_select` entities in the visual editor. They already worked at runtime, but the picker only offered `switch`, `input_boolean` and `select`, so an `input_select` could only be added by editing YAML.
- Regression tests for the fan AUTO write path, including a guard that the Midea payload is unchanged.
- The test suite now runs in CI on every push and pull request.

### Fixed
- The fan AUTO control sent a hardcoded lowercase `auto`. On a unit whose fan list spells it differently, for example MELCloud and Mitsubishi with `["Auto", "1".."5"]`, that value is not a member of the list, so Home Assistant rejected the call and tapping the clover did nothing. The card now sends the entity's own member with its own casing, and makes no call at all when the list carries no auto member. Units that advertise a lowercase `auto`, Midea included, are byte-identical to before.
- `show_fan: true` did nothing. Show behaved exactly like Auto, so only Hide had any effect, despite the editor offering to force the ring on. It now forces the ring visible, matching how the swing, LED and sound chips have behaved since 1.1.0.
- Custom mode labels were silently destroyed. The editor only builds a label field for the modes an entity currently exposes, then rebuilt `mode_names` from just those fields, so any label belonging to a mode the entity does not expose right now was dropped on the first edit. Labels without a field are now preserved.
- The default accent followed `--accent-color`, which the stock Home Assistant theme paints orange. A dial left on its defaults rendered a warm fan handle, caret and chip against a cool blue arc. The accent now follows `--primary-color`. An explicit `accent` is unaffected.
- The unlit ring tracks were hardcoded dark values, so on a light theme they read as heavy bars instead of a quiet track. They now derive from the theme text color.
- The frosted slab drew on every appearance, painting a second bordered, blurred panel inside the card even when `appearance` was left on `theme`. It now renders only for the glass appearances, which also removes one backdrop-filter layer for everyone else.

### Changed
- README rewritten and shortened from 461 lines to 178, with installation in the first screen, a per-brand compatibility table, and the per-version release notes left to this changelog.

## [1.4.0] - 2026-07-01

### Added
- `mode_names` option to rename the mode buttons: a map of `hvac_mode: "Label"` (for example `mode_names: { fan_only: Fan, cool: Cooling }`). Any mode left unset keeps its default localized label. The visual editor gains a "Mode labels" section with a field per mode.
- The visual editor can now rename `extra_toggles` chips: each configured toggle entity gets its own name field in the Extra toggles section, so a custom chip label no longer requires editing YAML.

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

[1.8.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.8.0
[1.7.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.7.0
[1.6.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.6.0
[1.5.1]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.5.1
[1.5.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.5.0
[1.4.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.4.0
[1.3.1]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.3.1
[1.3.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.3.0
[1.2.1]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.2.1
[1.2.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.2.0
[1.1.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.1.0
[1.0.6]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.0.6
[1.0.5]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.0.5
