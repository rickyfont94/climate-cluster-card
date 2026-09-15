# Contributing

Thanks for your interest in improving the Climate Cluster Card. This is a single vanilla JavaScript Lovelace card with no build step, so contributing is intentionally simple.

## Project layout

The shipped artifact is one file: `climate-cluster-card.js`. There is no bundler and no
compile step, so you edit that file directly and what you edit is what Home Assistant
loads. `package.json`, `package-lock.json` and `test/` exist only to run the test suite
locally and in CI; nothing there is published, and the card itself has no dependencies.

## Running the tests

```
npm ci        # once, installs the single dev dependency from the lockfile
npm run check # node --check climate-cluster-card.js
npm test      # the unit suite
```

`npm test` runs `node --test` with a DOM registered by `@happy-dom/global-registrator`
(see `test/setup.js`), which imports the card for its `customElements.define` side
effect. Tests reach the classes through `document.createElement`, because the file has
no exports.

Note what that suite can and cannot prove. `test/helpers.js` deliberately stubs the
renderer in the service-payload tests, so those assert what gets SENT and nothing about
what gets drawn. Pointer and touch gestures, layout, CSS animation, computed style and
the visual editors all need a real browser, and a passing suite is not evidence about
any of them. If your change touches one of those, check it in a browser and say in the
pull request what you checked and how.

## In Home Assistant

1. Copy or serve the raw `climate-cluster-card.js` so Home Assistant can load it (for
   example under `/config/www/`).
2. Add it as a Lovelace resource of type `module` with a cache-busting query string:
   `/local/climate-cluster-card.js?v=2`
3. Bump the `?v=` value every time you change the file, then hard-refresh the browser
   (Ctrl+Shift+R) so the new version loads instead of the cached one.
4. Add the card to a dashboard and confirm your change works against real climate
   entities.

## CI gate

`.github/workflows/validate.yml` runs three jobs on every push and pull request, and
nightly: HACS validation, `node --check climate-cluster-card.js`, and `npm ci && npm
test` on Node 20. Run the check and the suite locally before opening a pull request. If
the syntax check fails, the file will not load in Home Assistant at all.

## Versions

All dependencies and tool versions are pinned. Never use `:latest`.

## Releases

Releases are cut by the maintainer. Before tagging, update **every** place that names a version, in the same release:

1. `VERSION` constant in `climate-cluster-card.js` (so the console banner matches the release).
2. `CHANGELOG.md` - add a `## [X.Y.Z] - YYYY-MM-DD` section and the matching link reference at the bottom of the file.
3. `README.md` - only when the release changes an option, the install steps, or the compatibility table. The README carries no per-version sections, so a routine release leaves it alone.
4. Any other version reference (issue templates, docs, screenshots).

Then tag the commit and push:

```
git tag vX.Y.Z
git push origin vX.Y.Z
```

The release workflow (`release.yml`) publishes from the tag. Note that HACS renders the README from the **release tag**, not `main`, so README and screenshot fixes only reach HACS users in a new tagged release. Please do not open pull requests that only bump the version.

## Questions and bugs

- Bugs and feature requests: open an issue using the provided forms.
- Questions, configs, and general help: use [GitHub Discussions](https://github.com/rickyfont94/climate-cluster-card/discussions).
