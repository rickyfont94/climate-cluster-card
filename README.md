<div align="center">

# Climate Cluster Card

An instrument-cluster climate dial for Home Assistant that follows your theme.

[![Release](https://img.shields.io/github/v/release/rickyfont94/climate-cluster-card?style=for-the-badge&color=4fc3f7&label=Release&sort=semver)](https://github.com/rickyfont94/climate-cluster-card/releases)
[![HACS Default](https://img.shields.io/badge/HACS-Default-41BDF5?style=for-the-badge)](https://github.com/hacs/integration)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/rickyfont94/climate-cluster-card/total?style=for-the-badge)](https://github.com/rickyfont94/climate-cluster-card/releases)

<picture>
  <source srcset="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/demo.webp" type="image/webp">
  <img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/demo.png" alt="Climate Cluster Card demo" width="470">
</picture>

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
| `fan_style` | `silk` \| `breeze` \| `original` | `silk` | How the fan ring is drawn. `original` is the plain gradient arc every card drew before 2.3.0; the other two animate. |
| `fan_clover` | bool | `false` | Brings back the small spinning fan glyph from the original face, beside the status line. |
| `fan_animation` | bool | `true` | Whether that glyph spins. Only does anything with `fan_clover` on. |
| `fan_animation_speed` | `dynamic` \| `constant` \| `off` | `dynamic` | Spin behavior of that glyph. Only does anything with `fan_clover` on. |
| `show_fan` | `auto` \| `true` \| `false` | `auto` | Force the fan ring on or off. Off hides the ring and its rail button together. |
| `rail` | list | every control the unit has | Which buttons sit on the row under the dial, and in what order: `fan`, `swing`, `led`, `sound`, `extra:0` .. `extra:2`. A name this unit cannot do is skipped. |
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

### Modes and presets at a glance

<img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/modes.webp" alt="Every hvac mode on the dial" width="820">

Mode ink is spent on exactly five things: the mode word, the status dot and word, the
lit rail cell, the fan ring stroke and the comfort glyph. It never touches the two arc
gradients, the needle, the room pin, the delta segment or the steppers, which is why
six modes still read as one instrument. Override any of them with `mode_colors`.

<img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/presets.webp" alt="Every preset glyph on the dial" width="820">

Each preset keeps its own colour so it reads the same in any mode. Comfort is the one
exception and borrows the mode ink, because it means the normal state of that mode. A
preset the card does not recognise draws nothing rather than falling back to its own
first letter.

## Multi-zone card

`custom:climate-cluster-group-card` puts the whole house on one card: a house gauge
that carries the coldest and warmest room on its ring, and a live tile per room under
it. From 2.3.0 that is the default. The gauge-per-room grid that shipped before it is
still there as `layout: classic`.

<img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/group-card.webp" alt="Multi-zone group card" width="820">

```yaml
type: custom:climate-cluster-group-card
name: House
entities:
  - climate.living_room
  - climate.bedroom
  - climate.office
orientation: auto      # auto | horizontal | vertical
temp_step: 1           # what one press of plus or minus moves a room
appearance: glass-dark # theme | glass-dark | glass-light
glass_color: "#0E1A24" # tint for the frosted panel
accent: "#4ADD5F"      # used on the running count and the buttons
```

Tap a room's number and that room's sheet opens: its modes, its presets and its own
hardware toggles. It is the same object the single dial opens, so the two cards behave
identically once you are inside one. Plus and minus sit on the tile itself, and
dragging the house gauge moves every room at once.

**Every option is in the visual editor here too.**

| Option | Type | Default | Description |
|---|---|---|---|
| `entities` | list | **required** | The rooms. The order you list them is the order they are drawn. |
| `name` | string | unset | Card title. |
| `layout` | `zones` \| `classic` | `zones` | `classic` brings back the gauge-per-room grid from before 2.3.0. |
| `orientation` | `auto` \| `horizontal` \| `vertical` | `auto` | `auto` puts the gauge beside the rooms when the card is wide enough and stacks them when it is not. |
| `actions` | list | off, sync, and the first two shared presets | Which buttons sit on the bottom bar and in what order: `off`, `sync`, `preset:<name>`. A preset no room advertises is skipped. |
| `group_actions` | bool | `true` | Set false to drop the bottom bar entirely. |
| `temp_step` | number | `1` | What one press of plus or minus moves a room. Whole degrees unless you say otherwise. |
| `min_temp` / `max_temp` | number | narrowest room range | Bounds for the house gauge. |
| `temperature_unit` | `F` \| `C` | your HA unit system | Force the unit. |
| `appearance` / `accent` / `glass_color` / `glass_opacity` | | same as the dial | Both cards take the same look keys, so they can match on one dashboard. |
| `zone_rows` / `action_rows` | number | responsive | Pin the rooms or the buttons to a fixed number of rows. Columns are worked out from the count, so five rooms with `zone_rows: 2` gives three across and two below. |
| `hero` | `average` \| `hottest` | `average` | What the big gauge reads. **`layout: classic` only.** |
| `tap_zone` | `focus` \| `more-info` | `focus` | What tapping a tile does. **`layout: classic` only.** |

<img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/group-rows.webp" alt="Multi-zone card in its vertical shape" width="470">

**All off** becomes **All on** when the whole house is off, and puts each room back the
way it was rather than picking a mode for it. **Sync all** matches the temperature *and*
the mode of most of the running rooms, and leaves a room somebody deliberately turned
off alone. A preset button appears only when every room advertises that preset, and
Sync skips any `heat_cool` room rather than guessing which of its two setpoints to move.

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
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/preview.webp" alt="Two-ring dial" width="330"><br><b>Two-ring dial</b>, inner is temp, outer is fan</td>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/view-modes.webp" alt="Mode popup" width="330"><br><b>Mode popup</b> with the feature chips</td>
</tr><tr>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/zone-sheet.webp" alt="A room's sheet on the multi-zone card" width="330"><br><b>A room's sheet</b>, the same object the dial opens</td>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/dial-auto.webp" alt="The dial in auto with a comfort preset" width="330"><br><b>Auto</b> in its own colour, preset as a glyph</td>
</tr><tr>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/dial-boost.webp" alt="The dial in cool with the boost preset" width="330"><br><b>Boost</b>, and a hardware switch on the rail</td>
  <td><img src="https://raw.githubusercontent.com/rickyfont94/climate-cluster-card/main/assets/dial-fan.webp" alt="The dial in fan only" width="330"><br><b>Fan only</b>, with nothing to cool</td>
</tr></table>

Every shot is `appearance: glass-dark` over a wallpaper, which is what the frosted panel
looks like in use. On the default `theme` appearance the same card is opaque and follows
your Home Assistant colours instead.

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
