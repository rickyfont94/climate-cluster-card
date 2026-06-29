<div align="center">

# Climate Cluster Card

A wide-arc, **instrument-cluster** climate card for Home Assistant, drag the **inner ring** for temperature and the **outer ring** for fan speed, with a glass mode popup, swing / LED / sound toggles, a numbered gauge scale, and a full visual editor.

[![Release](https://img.shields.io/github/v/release/rickyfont94/climate-cluster-card?style=for-the-badge&color=4fc3f7&label=Release)](https://github.com/rickyfont94/climate-cluster-card/releases)
<!-- HACS Custom for now. This becomes "HACS Default" once the card is accepted into the HACS default store. Leave the badge unchanged until then. -->
[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5?style=for-the-badge)](https://github.com/hacs/integration)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/rickyfont94/climate-cluster-card/total?style=for-the-badge)](https://github.com/rickyfont94/climate-cluster-card/releases)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/rickyfont9l)

[![Validate](https://github.com/rickyfont94/climate-cluster-card/actions/workflows/validate.yml/badge.svg)](https://github.com/rickyfont94/climate-cluster-card/actions/workflows/validate.yml)
[![Last commit](https://img.shields.io/github/last-commit/rickyfont94/climate-cluster-card)](https://github.com/rickyfont94/climate-cluster-card/commits/main)
[![Stars](https://img.shields.io/github/stars/rickyfont94/climate-cluster-card?style=social)](https://github.com/rickyfont94/climate-cluster-card/stargazers)

</div>

The **dual-ring AC control** card: set temperature on the inner ring and fan speed on the outer ring at once, in an automotive instrument-cluster face. Built for and tested with **Midea** (`midea_ac_lan`), and works with any `climate.*` entity. Vanilla single-file web component, no dependencies, no build step.

## Demo

<img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/demo.gif" alt="Climate Cluster Card demo" width="470">

## Features

- **Wide-arc instrument dial** - a car-cluster gauge with a numbered tick scale, a glowing setpoint needle, and a current-temp marker.
- **Two-ring control** - drag the **inner ring** to set the target temperature and the **outer ring** to set the fan speed.
- **Glass mode popup** - tap the center to open a frosted mode picker (`cool` / `heat` / `heat_cool` / `dry` / `fan_only` / `auto` / `off`) with per-mode glyphs; the center caret follows `hvac_action` (down = cooling, up = heating).
- **On-card feature toggles** - swing, LED display, and beep/sound toggles, auto-wired to Midea sibling entities when present.
- **Fan animation** - a clover fan that can spin proportional to the fan value, at a constant rate, or off.
- **Fahrenheit & Celsius** - unit, range, and step auto-detected from Home Assistant (or set them explicitly).
- **Fully GUI-configurable** - every option is exposed in a visual editor; no YAML required.
- **Glass theme** - translucent card that blends with dashboard wallpapers.

## Screenshots

<table border="0"><tr>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/preview.png" alt="Two-ring dial" width="360"><br><b>Two-ring dial</b> - inner=temp, outer=fan</td>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/view-modes.png" alt="Mode popup" width="360"><br><b>Mode popup</b> - modes + Swing/LED/Sound</td>
</tr></table>

## Requirements

- Home Assistant with any `climate.*` entity.
- Requires **Home Assistant 2024.1.0** or newer (matches `hacs.json`).
- Built for and tested with **Midea** units via [`midea_ac_lan`](https://github.com/wuwentao/midea_ac_lan). It works with any climate entity, but auto-discovery of the fan / swing / LED / sound siblings is tuned for Midea.
- The **fan ring** needs one of:
  - a `number.*_fan_speed` (percent) entity, a smooth draggable 1-100 % ring, or
  - named `fan_modes` on the climate entity, driven as discrete stops.
  - If neither exists, the fan ring is hidden automatically.

## Installation

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rickyfont94&repository=climate-cluster-card&category=dashboard)

One-click: the **My Home Assistant** badge above opens this repository directly in HACS on your own instance. Otherwise follow the manual HACS steps below.

### HACS (recommended)

1. In Home Assistant, open **HACS**.
2. Click the **⋮** menu (top right) → **Custom repositories**.
3. Add `https://github.com/rickyfont94/climate-cluster-card`, set **Category** to **Dashboard**, and click **Add**.
4. Find **Climate Cluster Card** in HACS and click **Download**.
5. Hard-refresh your browser.

HACS registers the resource as `type: module` automatically, no manual resource entry or `?v=` cache-buster needed.

### Manual

1. Download `climate-cluster-card.js` from the [latest release](https://github.com/rickyfont94/climate-cluster-card/releases).
2. Copy it to `config/www/climate-cluster-card.js`.
3. Add a resource under **Settings → Dashboards → ⋮ → Resources**: URL `/local/climate-cluster-card.js`, type **JavaScript Module**.
4. Hard-refresh your browser.

## Usage

> A full **visual editor** is built in, add the card from the dashboard UI and click **Edit** to configure everything below without YAML.

**Minimal**

```yaml
type: custom:climate-cluster-card
entity: climate.living_room
```

**Midea (with title + height cap)**

```yaml
type: custom:climate-cluster-card
entity: climate.living_room
name: Living Room
max_height: 34vh
```

**Generic climate with an explicit fan entity**

```yaml
type: custom:climate-cluster-card
entity: climate.bedroom
fan_entity: number.bedroom_fan_speed
```

**Customized (accent, unit, mode subset, animation)**

```yaml
type: custom:climate-cluster-card
entity: climate.office
accent: "#4fc3f7"
temperature_unit: F
modes: [cool, dry, fan_only, "off"]
fan_animation: true
fan_animation_speed: dynamic
```

## Options

All options are optional except `entity`. Defaults reproduce sensible behavior, and the visual editor exposes every option.

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | `climate.*` | **required** | The climate entity to control. |
| `name` | string | entity friendly name | Card title. |

#### Appearance

| Option | Type | Default | Description |
|---|---|---|---|
| `accent` | color | theme accent | Primary accent color. |
| `mode_colors` | map | built-in | Per-mode color overrides (e.g. `cool: "#4fc3f7"`). |
| `temperature_unit` | `auto` \| `F` \| `C` | `auto` | `auto` uses HA's unit system / the entity's `temperature_unit`. |
| `min_temp` | number | entity `min_temp` | Lower bound of the dial. |
| `max_temp` | number | entity `max_temp` | Upper bound of the dial. |
| `temp_step` | number | entity `target_temp_step` | Setpoint step increment. |
| `show_scale` | bool | `true` | Show the numbered tick scale. |
| `show_current` | bool | `true` | Show the current ("NOW") reading. |

#### Modes

| Option | Type | Default | Description |
|---|---|---|---|
| `modes` | list | entity `hvac_modes` | Which HVAC modes appear in the popup. |

#### Fan

| Option | Type | Default | Description |
|---|---|---|---|
| `fan_entity` | `number.*` | auto-discovered | Percent entity for the draggable fan ring. |
| `show_fan` | bool | auto | Force show/hide the fan ring. |
| `fan_animation` | bool | `true` | Enable the clover spin. |
| `fan_animation_speed` | `dynamic` \| `constant` \| `off` | `dynamic` | Spin behavior. |

#### Features

| Option | Type | Default | Description |
|---|---|---|---|
| `swing_entity` | `switch.*` | Midea sibling | Swing toggle override. |
| `led_entity` | `switch.*` | Midea sibling | LED-display toggle override. |
| `sound_entity` | `switch.*` | Midea sibling | Beep/sound toggle override. |
| `show_swing` / `show_led` / `show_sound` | `auto` \| `true` \| `false` | `auto` | Force show/hide each toggle. |

#### Layout

| Option | Type | Default | Description |
|---|---|---|---|
| `max_height` | CSS length | unset | Caps the card height. |
| `power_switch` | `switch.*` | unset | Optional power switch. |

**Resolution order (everywhere):** explicit config → auto-discovered Midea sibling → generic climate attribute → hide.

## Troubleshooting

- **Blank card.** The resource must be registered as **`type: module`** (HACS does this automatically). A stale manual resource of the wrong type is the usual cause, fix it and hard-refresh.
- **Fan ring missing.** The entity has neither a `number.*_fan_speed` nor named `fan_modes`. Set `fan_entity` explicitly or add a percent number helper.
- **A toggle (swing/LED/sound) doesn't appear.** Nothing resolved, set the matching `*_entity`, or set `show_swing` / `show_led` / `show_sound` to `true`.

## FAQ

**How does the fan ring map to speeds?**

When the fan is a percent entity (`number.*_fan_speed`), the outer ring is a continuous 1-100 % control that reads back into named bands:

| Fan ring position | Band |
|---|---|
| <= 20% | Silent |
| 21-40% | Low |
| 41-60% | Medium |
| 61-80% | High |
| 81-100% | Full |
| Center tap | Auto |

Dragging a percent nudges the climate `fan_mode` off `auto` so the chosen speed actually applies (a unit left on `auto` overrides a manual percent). Tapping the center returns the fan to `auto`.

If the climate entity exposes named `fan_modes` instead of a percent entity, the ring drives those discrete stops rather than a 1-100 % sweep.

## Known limitations

- **Tuned for `midea_ac_lan`.** The swing / LED / sound toggles and the fan / swing / LED / sound auto-discovery target Midea units. For a generic `climate.*` entity, set `swing_entity` / `led_entity` / `sound_entity` / `fan_entity` explicitly.
- **Fan ring needs a source.** The fan ring is hidden unless a `number.*_fan_speed` entity or named `fan_modes` exist.
- **Limited feature surface.** Only the Swing / LED / Sound toggles are surfaced on the card. Expose any other features (boost, eco, sleep, and so on) with your own cards.
- **Rajdhani font not bundled.** The card references the **Rajdhani** font by name for its numerals but does not bundle it; it degrades gracefully to your UI font when Rajdhani is unavailable.

## Notes

The card references the **Rajdhani** font by name for its numerals but does **not** bundle it; it degrades gracefully to your UI font if Rajdhani isn't available.

Midea is a trademark of its respective owner. This project is independent and unaffiliated.

## Contributing

Issues and pull requests are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md) or open an issue.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Support

If this card is useful to you, you can support its development with a coffee:

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-green.png" alt="Buy Me a Coffee" height="44">](https://www.buymeacoffee.com/rickyfont9l)

## License

[MIT](LICENSE)
