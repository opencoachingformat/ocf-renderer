# OCF Renderer

Reference renderer for the [Open Coaching Format](https://github.com/opencoachingformat/spec) —
turns an OCF document into a rendered basketball diagram, using **Three.js** so
the same engine can grow from a static print-style view into full animation
without a rewrite.

Companion to the [spec](https://github.com/opencoachingformat/spec) and the
[validator](https://github.com/opencoachingformat/ocf-validator). The renderer is
the visual foundation the future editor builds on.

## Status

✅ **v1 implemented:** the `tactical_print` view mode — a single frame rendered
as a static, top-down, orthographic scene (court + entities + action paths
derived from the frame's semantic actions) via `OCFRenderer.renderToCanvas`.

This is a pivot from an earlier SVG-string design (see
`docs/superpowers/specs/2026-06-06-ocf-renderer-design.md`, superseded); the
current architecture is documented in
[`docs/superpowers/specs/2026-07-20-ocf-renderer-threejs-design.md`](docs/superpowers/specs/2026-07-20-ocf-renderer-threejs-design.md).

Try it: `npm run build && npx serve .`, then open `examples/index.html`.

## Implemented

- TypeScript + Three.js, rendering into a `<canvas>` via `OCFRenderer.renderToCanvas`
  (browser / headless-GL). Public API: `src/index.ts`.
- `ViewModeController` switches between view modes; `tactical_print` is fully
  built, `coaching_animation` is architecturally acknowledged but not yet built.
- Court styles (default "Soft / Modern"), per-ruleset court geometry — FIBA
  `half_court` and `full_court` (both baskets), plus `custom_dimensions` override.
- Entity symbols: offense (filled circle + number), defense (FIBA "arms" glyph,
  directional via `rotation`), ball (offset when carried), coach, cone.
- Action notation derived from semantic actions: move/cut (solid), dribble
  (wave), pass (dashed), screen (end bar), shoot (glyph at the shooter).
- Path geometry: smoothing through `moves` anchors, arc-length resampling,
  trimmed arrowheads, and collision avoidance (paths steer around symbols).
- Test coverage: unit tests, whole-scene snapshot tests, and Playwright
  pixel-diff visual regression tests against real-browser renders.

## Roadmap (post-v1)

- `coaching_animation` view mode (dynamic, frame-to-frame playback).
- Multi-frame composite ("playbook" image with step numbers).
- Shot-type glyph differentiation (`variant`/`tags`).
- NBA / NCAA / NFHS court geometry (`FIBA_DEFAULTS` is structured to become one
  of several rulesets).
- True FIBA corner-3 straight-line three-point boundary (v1 uses a
  constant-radius arc approximation as an intentional simplification).

## License

[CC BY 4.0](LICENSE) — same as the OCF spec.
