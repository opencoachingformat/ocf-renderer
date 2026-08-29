# Changelog

All notable changes to `@opencoachingformat/renderer` are documented here.
This project follows [Semantic Versioning](https://semver.org). While the API is
still pre-1.0 (`0.x`), minor bumps may include additive features and refinements.

## 0.4.0

First tagged release cutting a version from the accumulated work since the
initial `0.1.0` publish. Reflects the renderer's real, tested state — not yet
1.0 (see the validator/renderer roadmaps), but well past the initial prototype.

### Added
- **`around_player` side + arc** (RFC 0004 renderer side): movement paths honor
  an author-chosen `side` (`left`/`right`, relative to travel direction) and map
  `arc` (`tight`/`normal`/`wide`) to a configurable detour distance, replacing
  the hardcoded `0.6` and the geometry-only side guess. Falls back to the
  heuristic/`normal` when the fields are absent, so existing documents are
  unchanged.
- **`around_player` routing**: move/cut/dribble steps route around a referenced
  player with an inserted clearing waypoint.
- **Bundled browser build** with an `./browser` export and browser sourcemaps.
- **Schema-driven types**: OCF types are generated from the vendored
  `@opencoachingformat/spec` schema (v1.4.0) rather than hand-maintained.
- Expanded named court positions and spec-repo example fixtures.

### Changed
- **Smoother dribble line**: the wavy dribble path is now a densely resampled
  smooth curve (CatmullRom) with a calmer amplitude/wavelength and an eased tail
  that lands cleanly, instead of a straight-segment poly-line.
- Bumped `@opencoachingformat/spec` to `^1.4.0`.

### Fixed
- Corrected `high_post` / `paint_center` coordinates and other named-position
  values.
- Schema-package resolution and the `./browser` exports map.
- Pinned `esbuild` to `^0.28.2` (Dependabot security alert).

### Packaging
- Added `repository`, `homepage`, `bugs`, `license` (CC-BY-4.0), and
  `description` metadata — required for npm trusted-publishing provenance.

## 0.1.0

Initial published prototype: top-down three.js renderer, `composeFrame` static
tactical diagrams, coordinate transformer, and the first named-position catalog.
