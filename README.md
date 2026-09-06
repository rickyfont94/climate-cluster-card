<div align="center">

# Climate Cluster Card

An instrument-cluster climate dial for Home Assistant that follows your theme.

[![Release](https://img.shields.io/github/v/release/rickyfont94/climate-cluster-card?style=for-the-badge&color=4fc3f7&label=Release&sort=semver)](https://github.com/rickyfont94/climate-cluster-card/releases)
[![HACS Default](https://img.shields.io/badge/HACS-Default-41BDF5?style=for-the-badge)](https://github.com/hacs/integration)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/rickyfont94/climate-cluster-card/total?style=for-the-badge)](https://github.com/rickyfont94/climate-cluster-card/releases)

<img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/demo.gif" alt="Climate Cluster Card demo" width="470">

</div>

## Why this card

- **Two rings you drag.** The inner ring sets the target temperature, the outer ring sets the fan speed. No other climate card gives you a draggable fan ring.
- **Glass mode popup.** Tap the center for a frosted mode picker with per-mode glyphs, plus swing, LED and sound chips.
- **Presets and steppers.** Eco, boost, sleep and whatever else your unit advertises, as chips in the pop-up. Plus and minus buttons on the face for when dragging is not what you want.
- **Zero YAML.** Every option below is in the visual editor. Add the card from the dashboard UI and click Edit.
- **Follows your theme.** Light and dark, automatically, or force a translucent frosted-glass panel that frosts your wallpaper.

Works with any `climate.*` entity. Vanilla single-file web component, no dependencies, no build step.

## Install

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rickyfont94&repository=climate-cluster-card&category=dashboard)

1. Open **HACS** in Home Assistant and search for **Climate Cluster Card**.
2. Click **Download**.
3. Hard-refresh your browser (Ctrl+F5 or Cmd+Shift+R).

Then add the card to a dashboard:

```yaml
type: custom:climate-cluster-card
entity: climate.living_room
```

That is the whole minimum config. Requires Home Assistant 2024.1.0 or newer. HACS registers the resource as `type: module` for you.

<details><summary>Manual install (no HACS)</summary>

1. Download `climate-cluster-card.js` from the [latest release](https://github.com/rickyfont94/climate-cluster-card/releases).
2. Copy it to `config/www/climate-cluster-card.js`.
3. Add a resource under **Settings > Dashboards > menu > Resources**: URL `/local/climate-cluster-card.js`, type **JavaScript Module**.
4. Hard-refresh your browser.

</details>

## Options

**Every option is in the visual editor.** This table is reference material for YAML users. Only `entity` is required.

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | `climate.*` | **required** | The climate entity to control. |
| `name` | string | friendly name | Card title. |
| `appearance` | `theme` \| `glass-dark` \| `glass-light` | `theme` | Follow the active theme, or force a frosted-glass panel. |
| `accent` | color | your theme's accent | Primary accent color. Unset, the card uses your theme's `--accent-color`. |
| `temperature_unit` | `auto` \| `F` \| `C` | `auto` | `auto` follows your Home Assistant unit system. |
| `modes` | list | entity `hvac_modes` | Which HVAC modes appear in the popup. |
| `fan_entity` | `number.*` | auto-discovered | Percent entity behind the fan ring. |
| `show_presets` | `auto` \| `true` \| `false` | `auto` | Preset row in the pop-up. Auto shows it when the entity advertises `preset_modes`. |
| `show_steppers` | `auto` \| `true` \| `false` | `auto` | Plus and minus buttons on the face. Auto shows them on a single-setpoint dial. |
| `show_humidity` | `auto` \| `true` \| `false` | `auto` | Humidity line. Auto shows it when the entity reports `current_humidity`. |
| `extra_toggles` | list | unset | Your own chips in the mode popup. See [Compatibility](#compatibility). |
| `max_height` | CSS length | unset | Caps the card height, useful in a Sections grid cell. |

<details><summary><b>All other options</b> (styling, temperature range, chips, actions)</summary>

| Option | Type | Default | Description |
|---|---|---|---|
| `glass_color` | color | per-variant | Tints the frosted-glass panel. Glass appearances only. |
| `glass_opacity` | number `0`..`1` | per-variant | Panel solidity, `0` clear to `1` solid. Glass appearances only. |
| `mode_colors` | map | built-in | Per-mode color overrides, for example `cool: "#4fc3f7"`. |
| `mode_names` | map | unset | Rename mode buttons, for example `{ fan_only: Fan }`. |
| `preset_names` | map | unset | Rename preset chips, for example `{ eco: iECO }`. The written value is unchanged. |
| `font` | string | unset | Font family prepended to the default stack. |
| `font_url` | string | unset | Stylesheet URL that loads `font`. Nothing is fetched by default. |
| `min_temp` / `max_temp` | number | entity range | Dial bounds, for example `61` and `86` in Fahrenheit. |
| `temp_step` | number | entity step | Setpoint increment. |
| `show_scale` / `show_current` / `show_hints` | bool | `true` | Numbered ticks, the NOW reading, the gesture hints. |
| `fan_animation` | bool | `true` | The spinning clover. |
| `fan_animation_speed` | `dynamic` \| `constant` \| `off` | `dynamic` | Spin behavior. |
| `show_fan` | `auto` \| `true` \| `false` | `auto` | Force the fan ring on or off. |
| `swing_entity` / `led_entity` / `sound_entity` | `switch.*` | Midea sibling | Override the auto-discovered chip entity. |
| `swing_h_entity` | `switch.*` | auto-discovered | Horizontal swing override. |
| `show_swing_h` | `auto` \| `true` \| `false` | `auto` | Second swing chip. Auto shows it when a horizontal axis resolves. |
| `show_swing` / `show_led` / `show_sound` | `auto` \| `true` \| `false` | `auto` | Force each chip on or off. |
| `tap_action` | action | mode popup | Center tap. Leave unset to keep the mode popup. |
| `hold_action` | action | `more-info` | Center press and hold. |
| `double_tap_action` | action | `none` | Center double tap. |

Resolution order everywhere: explicit config, then auto-discovered Midea sibling, then a generic climate attribute, then hidden.

</details>

<details><summary><b>Styling example</b></summary>

```yaml
type: custom:climate-cluster-card
entity: climate.living_room
name: Living Room
appearance: glass-dark
glass_color: "#2a6f6a"
accent: "#ffb74d"
temperature_unit: F
min_temp: 61
max_temp: 86
max_height: 34vh
```

</details>

## Multi-zone card

`custom:climate-cluster-group-card` shows a house gauge plus every zone as a live mini instrument. Tap a zone to promote it into the hero.

```yaml
type: custom:climate-cluster-group-card
name: House
entities:
  - climate.living_room
  - climate.bedroom
  - climate.office
hero: average          # average | hottest | a named entity
tap_zone: focus        # focus | more-info
```

A preset button appears only when every zone advertises that preset, and Sync skips any `heat_cool` zone rather than guessing which of its two setpoints to move.

## Compatibility

The card drives any `climate.*` entity. Midea units get their extra hardware controls discovered for free, and every other brand adds the same controls through `extra_toggles`.

| Feature | Any climate entity | Midea (`midea_ac_lan`) | Other brands |
|---|---|---|---|
| Temperature ring, mode popup, theming | Yes | Yes | Yes |
| Dual setpoints in `heat_cool` | Yes, a two-tone comfort band and a `68 - 74` readout | Yes | Yes |
| Fan ring | Yes, driving named `fan_modes` as discrete stops | Auto, a smooth percent ring from the `number.*_fan_speed` sibling | Point `fan_entity` at a percent `number.*` for the smooth ring |
| Preset row (eco, boost, sleep, comfort) | Yes, from the entity's own `preset_modes` | Yes | Yes |
| Plus / minus setpoint buttons | Yes | Yes | Yes |
| Horizontal swing | Yes, from `swing_horizontal_modes` | Yes, from the switch sibling | Set `swing_h_entity` |
| Humidity readout | Yes, when `current_humidity` is reported | Yes | Yes |
| Swing chip | Yes, from the entity's own `swing_modes`, with a long-press position picker | Auto, from the swing `switch` sibling | Set `swing_entity`, or use `extra_toggles` |
| LED display and beep chips | Not exposed by the climate domain | Auto, from the `switch` siblings | Set `led_entity` and `sound_entity`, or use `extra_toggles` |
| Anything else (anti-mildew, UV, eco, gentle wind) | Add it with `extra_toggles` | Add it with `extra_toggles` | Add it with `extra_toggles` |

**`extra_toggles` is the escape hatch**, and the answer to most "does it support X" questions. Point it at up to 8 `switch`, `input_boolean`, `select` or `input_select` entities and each becomes a chip in the mode popup. Switches toggle, selects cycle their options. Name each chip in the visual editor, or add an icon in YAML.

```yaml
type: custom:climate-cluster-card
entity: climate.bedroom
extra_toggles:
  - switch.bedroom_ac_anti_mildew
  - entity: select.bedroom_ac_smart_wind
    name: Wind
    icon: mdi:weather-windy
```

<details><summary><b>More screenshots</b></summary>

<table border="0"><tr>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/preview.png" alt="Two-ring dial" width="330"><br><b>Two-ring dial</b>, inner is temp, outer is fan</td>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/view-modes.png" alt="Mode popup" width="330"><br><b>Mode popup</b> with the feature chips</td>
</tr><tr>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/theme-light.png" alt="Light theme" width="330"><br><b>Light theme</b></td>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/theme-dark.png" alt="Dark theme" width="330"><br><b>Dark theme</b></td>
</tr><tr>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/glass-aurora.png" alt="Aurora glass" width="330"><br><b>Frosted glass</b>, aurora tint</td>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/glass-purple.png" alt="Purple glass" width="330"><br><b>Frosted glass</b>, purple tint</td>
</tr></table>

</details>

## Troubleshooting

- **Blank card.** The resource must be registered as `type: module`. HACS does that for you, so this is almost always a leftover manual resource of the wrong type. Fix it and hard-refresh.
- **An update looks like it did nothing.** The browser is serving a cached build. Hard-refresh with Ctrl+F5 or Cmd+Shift+R after every HACS update.
- **No fan ring.** The entity has neither a percent `number.*` fan entity nor named `fan_modes`. Set `fan_entity`, or force the ring with `show_fan: true`.
- **A swing, LED or sound chip is missing.** Nothing was auto-discovered. Set the matching `swing_entity`, `led_entity` or `sound_entity`, or add the control as an `extra_toggles` chip.

## Notes

English and Spanish ship built in and auto-select from your Home Assistant language, and everything else falls back to English. Mode and fan mode names come from Home Assistant itself, so they always match the rest of your dashboard. To add a language, edit the `LOCALE` map near the top of `climate-cluster-card.js`. Partial translations are fine.

The card prefers the **Rajdhani** font for its numerals when it is installed locally, but never bundles or downloads it. Without Rajdhani it falls back to your theme font, then the system UI font. Set `font` and `font_url` to use your own.

Midea is a trademark of its respective owner. This project is independent and unaffiliated.

## Links

- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Report an issue or request a feature](https://github.com/rickyfont94/climate-cluster-card/issues)
- [MIT License](LICENSE)

<div align="center">

If this card is useful to you, you can support its development with a beer.

[![Buy me a beer](https://img.shields.io/badge/Buy%20me%20a%20beer-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/rickyfont9l)

</div>
