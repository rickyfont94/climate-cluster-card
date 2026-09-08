# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] - 2026-09-08

Both cards get a new face. Nothing you already have configured changes meaning, and
every key that shipped before this release still reads the same way.

### Added
- **A new dial face.** The temperature ring, the fan ring, the numbered scale, the
  status line and the row of buttons under it are all redrawn from one geometry, so
  they line up with each other instead of each being placed by hand. `heat_cool`
  keeps the old face, because the new one draws a single setpoint and that mode has
  two.
- **`fan_style`**: `silk` (the default from this release), `breeze`, or `original`.
  `original` is the plain gradient arc every installed card draws today, so the look
  you have now is still one setting away.
- **`fan_clover`**: brings back the small spinning fan glyph from the original face,
  beside the status line. Off by default. `fan_animation` and `fan_animation_speed`
  still drive that glyph and now only do anything when it is on.
- **`rail`**: names the buttons under the dial and their order, from `fan`, `swing`,
  `led`, `sound` and `extra:0` .. `extra:2`. It is a separate key from `show_fan` /
  `show_swing` / `show_led` / `show_sound` on purpose, because those four gate the
  popup chips as well, so folding them into an ordering key would have silently
  rewritten popup config for anyone already using them.
- **The group card is a zone card.** One house gauge carrying the coldest and warmest
  room on its ring, with a live tile per room under it. It is the default layout from
  this release; the gauge-per-room grid is still there as `layout: classic`.
- **The group card has a visual editor.** Home Assistant showed "Visual editor not
  supported" for it until now, so the only way to configure it was YAML.
- **A per-room sheet.** Tapping a room's number opens its modes, presets, fan, swing
  and its own plus and minus. It is the same object the single dial opens, not a
  second plainer copy of it.
- **`orientation`** on the group card: `auto`, `horizontal` or `vertical`. Automatic
  puts the gauge beside the rooms when the card is wide enough and stacks them when
  it is not, measured on the card rather than on the browser window.
- **`actions`** on the group card names the bottom bar's buttons and their order, the
  same idea and the same spelling as `rail` on the dial. Presets are offered from
  what the selected rooms actually advertise.
- **The house gauge is draggable** and moves every room that can take a setpoint.

### Fixed
- The face shipped its colours as dark literals baked into the markup, so on a light
  theme it drew light-grey text on a light background. Both cards now resolve their
  ink from your theme, and measure the resolved ground rather than asking the browser
  for a light or dark preference that Home Assistant does not publish.
- `show_scale`, `show_current` and `mode_colors` were silently ignored by the new
  face. All three are read again.
- The fan ring did not move under the finger, and the marker snapped back to its old
  position mid-drag while the finger was still down.
- The fan ring vanished in any mode the card had decided was "auto", including after
  switching out of auto into cool. It is drawn in every mode where the speed can be
  set, and the marker is hidden (rather than the whole ring) when it cannot.
- A fan command the unit will not accept is no longer sent and then shown as if it
  had landed. Measured against the hardware: in hvac `auto` these units refuse both
  `set_fan_mode` and `number.set_value` while still accepting `set_temperature`.
- The mode popup and the room sheet painted behind the rest of the dashboard.
- The room sheet's controls did nothing at all. The sheet is a sibling of the tile
  grid rather than a descendant of one tile, so every lookup that walked up to the
  tile found no room and bailed out silently.
- Controlling a single room had a long delay and dropped taps, because every state
  push rebuilt the whole card and destroyed the open sheet under your finger.
- **All on** did nothing on a card opened while the house was already off. It now
  asks each unit to turn itself on, falls back to that unit's own first non-off mode,
  and puts a room it watched turn off back the way it was.
- **Sync all** matched the temperature but not the mode, so five rooms at 72 with one
  drying and one circulating counted as synced. It moves the mode to whichever mode
  most of the running rooms are in, and leaves a room somebody turned off alone.
- Every room read IDLE in fan, dry, auto, and in cool once it reached its setpoint.
  The card asked "is the room warmer than the setpoint", which is only ever true of
  cooling. It reads `hvac_action` when the unit reports one.
- The group card's step was half a degree; one press now moves a whole degree unless
  `temp_step` says otherwise.
- The group card crashed rather than rendered on a `heat_cool` room, an unavailable
  room, a room with no reading, and a house with every room offline. A room name
  carrying markup landed as markup.
- `comfort` and `eco` appeared to do nothing. Measured: these units refuse a preset
  in `fan_only` and accept it in `cool`, and `comfort` reads back as `none` because
  on this hardware comfort IS the absence of a preset.
- A stray letter appeared beside the status word when a preset the card did not know
  was set, because an unknown preset fell back to its own first letter.
- DRY and AUTO were drawn in the same colour. DRY takes the card's teal.
- The ROOM caption sat at an angle beside the reading instead of under it, and the
  group card's two ring labels sat at whatever height their rooms happened to fall
  at rather than sharing a baseline.
- The spinning glyph collided with the longer status words.
- The room dot did not breathe, while the dial's status dot did. Both now run from
  one keyframe so they cannot drift to two rates that look almost the same.
- A unit reporting `current_humidity` drew "RH 54%" straight across its own setpoint.
  The humidity readout is the fourth line of the ORIGINAL centre stack, at a height
  the new numeral occupies. It moves to the clear band under the numeral, and goes
  back where it was on `heat_cool`, which keeps the original face.
- `action_rows` worked on `layout: classic` only, so on the layout this release makes
  the default it was accepted by the editor and then ignored.
- Three ways a ring drag wrote a value nobody chose. The move and release listeners
  live on the window, so they hear every pointer on the page, and nothing checked
  which one: a second finger lifting anywhere ended the drag and committed while the
  first was still down, and a stray pointer moving dragged the ring on its way past.
  Nothing checked the event TYPE either, so a `pointercancel` (a scroll winning the
  touch, the app going to the background, a pen leaving range) committed whatever the
  finger happened to be over, when the finger was never lifted at all. And a unit
  that went unavailable in the middle of a drag was still written to on release. All
  three now abandon the gesture and put the face back on what the unit reports.
- Tapping the big number did nothing unless you hit its exact middle. The centre disc
  is 124 across in face units and the new numeral renders 117 by 125, so its box is
  bigger than the disc and every corner of the digits falls outside it; the <text>
  node then takes the tap and drops it. Measured in a browser: five of six points on
  "74" were dead, by mouse and by touch. The numeral now answers as the centre itself,
  through the same handler as the disc, so hold and double-tap behave identically
  wherever on the number you press. Twelve of twelve points now open the sheet.
- On a unit with named fan speeds the marker sat one stop ahead of the finger. The
  card held two ideas of where a stop sits on the ring: the settled reading, and the
  percentage the rail prints under FAN, put stop i at (i + 1) / n, while the PICK put
  it at i / (n - 1). They agree only on the top stop, so on a three speed unit a
  finger on "low" drew the ring a third of the way round and the marker stepped
  forward the moment it lifted. Both now come from one pair of functions, and the
  round trip is asserted for every stop count.
- The group card's house gauge had the same three, where a release writes every room
  rather than one setpoint, plus a fourth: a second finger landing on the gauge
  rebound its move and release handlers and stranded the old pair on the window,
  where nothing could ever remove them. The group card also had no teardown at all,
  so a card removed from the dashboard mid-drag left those handlers behind; Lovelace
  detaches and re-attaches cards freely, entering edit mode does it.

### Changed
- Every screenshot reshot against this release, and the demo animation rebuilt on the
  new dial. The light-theme frame is gone from the gallery: the card still follows a
  light theme, but the frame was a worse advertisement than the two it sat between.
  A room's sheet takes its place. The asset directory drops from 8.0 MB to 5.2 MB.

### Removed
- The handoff face's dashed fan ring. `fan_style` was never able to select it.

## [2.2.1] - 2026-09-06

### Changed
- Every screenshot and the demo animation reshot at 3x device scale, so they stay sharp on a retina display instead of softening the moment GitHub scales them.
- The frosted-glass screenshots were taken over a nearly flat backdrop, which gave the panel's blur nothing to blur and made the glass read as a plain dark box. They are reshot over a layered backdrop with light and colour moving across it, which is what the card actually looks like on a real wallpaper.
- The demo animation is no longer a GIF. A smooth two-tone arc gradient sweeping across a frosted panel is the worst case for a 256-colour palette: dithered it speckles, undithered it bands into visible steps, and both were measured against these exact frames. It ships as an animated WebP with an APNG fallback, both truecolour, at twice the width the README renders it at.

## [2.2.0] - 2026-09-06

### Added
- The group card takes `appearance`, `glass_color`, `glass_opacity` and `accent`, the same four keys and the same rules as the single dial. Until now the frosted-glass look stopped at the dial, so a dashboard running both cards could not hold one look. The zone tiles and the group buttons read as glass too, rather than punching opaque holes in the panel.
- `accent` on the group card colours the running count and the preset buttons, so a configured accent is visible at rest and not only on hover.

### Fixed
- A `glass_color` tinted the frosted panel but not the mode popup, which stayed the stock indigo. Both surfaces now derive from the same tint, with the sheet slightly more opaque so its text stays readable over the dial behind it.
- `action_rows` could force four buttons into a track narrower than their labels, and the labels painted straight out of their own buttons and over each other. They truncate now, and a forced row gives the label more characters before it has to.
- A pinned `zone_rows` left the zone strip much shorter than the hero column beside it, which read as a hole in the card. The strip is centred in the free space instead.

### Changed
- Screenshots and the demo animation reshot on the frosted glass, and the two tint samples replaced with a pink and a green accent on different wallpapers, so the README shows what `glass_color` and `accent` actually do rather than two similar dark panels.

## [2.1.1] - 2026-09-06

### Fixed
- The horizontal swing chip sat far enough out that the `85` tick numeral rendered inside it. Both chips are pulled inboard of the numbered ring.
- With two swing axes on show, the two chip captions overlapped and read as one run-on string. They shrink while both are visible.

### Changed
- Screenshots and the demo animation reshot against this release, and taken on Home Assistant's stock light and dark palettes rather than one particular custom theme, so they show what a new install actually looks like. The README now also pictures `zone_rows` rather than only describing it.
- Six geometry tests now guard the dial face: the lower shelf may not cross the arc tips, the numeral must clear the chip row, the fan cluster must stay inboard of the numeral, the chips may not reach into the numbered ring, and the two captions may not overlap. Every one of these collisions shipped at some point without a single failing test.

## [2.1.0] - 2026-09-06

### Added
- `zone_rows` and `action_rows` on the group card. Say how many rows you want the zone tiles or the group buttons laid out in and the columns are worked out from the count, so five zones with `zone_rows: 2` gives three across and two below. Leave either out and that grid stays responsive as before. A value of zero, a negative or anything non-numeric falls back to the responsive grid rather than breaking the layout.

### Changed
- The setpoint numeral is smaller and the whole lower shelf of the dial moved up. The fan clover, its readout, the swing chips and their captions were sitting below the arc's own lower tips, so they read as falling out of the instrument rather than sitting inside it. Everything on that shelf is now above the tip line, and the numeral shrinks further when a humidity line sits above it.
- Three geometry tests now guard this: nothing on the lower shelf may cross the arc tip line, the numeral must clear the chip row, and the fan cluster must stay inboard of the numeral. The collisions this release fixes were all introduced by earlier changes that no test could see.

## [2.0.2] - 2026-09-06

### Fixed
- The swing chips drew on a hardcoded dark fill, so on a light theme they rendered as solid grey blocks instead of quiet outlined chips. Same fault the ring tracks had in 1.5.0 and the same fix: the resting fill now derives from the theme, with the old value left as a fallback for engines without `color-mix`.
- The setpoint numeral had grown into the chip row. The chip got taller in 1.5.1 and a second one arrived in 1.8.0, and between them the big number was overlapping both. The numeral, the chip row and the chip captions all have room now, and the numeral shrinks further when a humidity line is present.

### Changed
- Screenshots and the demo animation reshot against the current card. The previous set predated 1.2.0, so it showed neither the preset row, the plus and minus buttons, the second swing axis, nor any of the theme fixes. The multi-zone card now has an image in the README instead of only a config block.

## [2.0.1] - 2026-09-06

### Fixed
- The group card laid out badly in a normal dashboard column. The hero gauge drew inside a 600 by 392 canvas while only using a third of it, so it rendered small and floated off to one side, and the zone grid collapsed to a single column, which made a five-zone card over 1200 pixels tall. Both boxes are now tight around what they actually draw, the zone grid fits two columns in a normal column width, and the group buttons sit under the hero instead of stretching the card. The same card is now about a third of the height.
- Zone labels sharing a prefix all truncated to the same stub ("Aire-Sala", "Aire-Ricky" and "Aire-Master" every one reading "AIRE-..."). A shared prefix is now dropped from the tile labels, so those read "Sala", "Ricky" and "Master". It only applies when every zone shares the prefix and every remainder is still at least three characters, so "Office 1" and "Office 2" are left alone rather than reduced to "1" and "2". The full name stays on the tooltip.
- The hero setpoint numeral overlapped the line beneath it, and the zone humidity line sat on the arc ends. Both have room now.

## [2.0.0] - 2026-09-06

### Added
- **A second card type: `custom:climate-cluster-group-card`.** One house gauge plus every zone as a live mini instrument. It is the same instrument at three sizes, drawn with the same helpers as the single dial, so the two cards cannot drift apart visually.
  - The hero reads the average, the hottest zone, or a named entity. Tap any zone to promote it into the hero, tap it again to go back.
  - Group actions: turn everything off, sync every single-setpoint zone to the hero temperature, or apply a preset. A preset button only appears when EVERY zone advertises it, so a group write can never be rejected by one member. Sync deliberately skips a `heat_cool` zone, because guessing which of its two setpoints to move would be worse than leaving it alone.
  - Zones live in a responsive grid, so the card takes any number of entities and reflows rather than dropping the overflow.
  - It repaints only when something it actually shows has changed, so watching six entities does not mean rebuilding on every unrelated state change in the house.
  - Entity names are escaped on the way into the markup. A friendly name carrying a tag or a quote cannot break out of the card.

### Fixed
- A stray NUL byte in the shipped file, introduced with the preset row in 1.6.0 and present in 1.6.0, 1.7.0 and 1.8.0. It never changed behavior, since it was a string separator, but it made the file read as binary to grep, diff and some editors.

### Notes
- Nothing about the existing card changed and no config key moved, so every `custom:climate-cluster-card` config keeps working untouched. The major version marks the new card type, not a break.

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

[2.1.1]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v2.1.1
[2.1.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v2.1.0
[2.0.2]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v2.0.2
[2.0.1]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v2.0.1
[2.0.0]: https://github.com/rickyfont94/climate-cluster-card/releases/tag/v2.0.0
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
