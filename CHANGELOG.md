# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-06-29

### Added
- Discoverable gestures: faint MODE / FAN / AUTO hint labels (toggle with `show_hints`) and a press-feedback highlight on the center disc, so the dial reads as interactive on a wall tablet.
- Standard `tap_action` / `hold_action` / `double_tap_action` config on the center disc, dispatched through Home Assistant's action conventions (more-info, navigate, call-service, toggle, url, none). Tap still opens the mode popup by default and hold opens the more-info dialog. The GUI editor gains an Actions section for these.

## [1.0.9] - 2026-06-29

### Fixed
- The gauge no longer disappears when an entity's minimum and maximum temperature are equal (or inverted). The arc geometry now guards the range span so a degenerate range renders a flat dial instead of producing NaN SVG paths.

### Added
- The GUI editor now shows an inline warning when the configured minimum temperature is not below the maximum, instead of leaving the card blank.

## [1.0.7] - 2026-06-29

### Fixed
- The Show option for the swing, LED, and sound toggles now forces the chip visible (previously it behaved like Auto). A forced chip with no backing entity renders as an inert, dimmed chip.

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

[1.1.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.1.0
[1.0.7]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.0.7
[1.0.5]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v1.0.5
