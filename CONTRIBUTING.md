# Contributing

Thanks for your interest in improving the Climate Cluster Card. This is a single vanilla JavaScript Lovelace card with no build step, so contributing is intentionally simple.

## Project layout

The entire card is one file: `climate-cluster-card.js`. There is no `node_modules`, no bundler, and no compile step. Edit the file directly.

## Local testing

1. Copy or serve the raw `climate-cluster-card.js` so Home Assistant can load it (for example under `/config/www/`).
2. Add it as a Lovelace resource of type `module` with a cache-busting query string:
   `/local/climate-cluster-card.js?v=2`
3. Bump the `?v=` value every time you change the file, then hard-refresh the browser (Ctrl+Shift+R) so the new version loads instead of the cached one.
4. Add the card to a dashboard and confirm your change works against real climate entities.

## CI gate

The only automated check is a syntax check:

```
node --check climate-cluster-card.js
```

Run it locally before opening a pull request. If it fails, the file will not load in Home Assistant.

## Versions

All dependencies and tool versions are pinned. Never use `:latest`.

## Releases

Releases are cut by the maintainer. Before tagging, update **every** place that names a version, in the same release:

1. `VERSION` constant in `climate-cluster-card.js` (so the console banner matches the release).
2. `CHANGELOG.md` - add a `## [X.Y.Z] - YYYY-MM-DD` section and the matching link reference at the bottom of the file.
3. `README.md` - update the "What's new in vX.Y.Z" heading, its Contents anchor (`#whats-new-in-vXYZ`), and the bullet list so they describe the new release.
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
