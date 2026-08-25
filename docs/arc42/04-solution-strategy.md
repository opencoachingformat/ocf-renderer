# 4. Solution Strategy

| Goal | Strategy |
|---|---|
| Verified-not-assumed visual correctness (Quality Goal 1) | **Two-tier test strategy**: `vitest` scene-graph snapshot tests assert on the produced `THREE.Object3D` graph (geometry, transforms, colors — serialized via `scene-graph-snapshot.ts`) for fast, deterministic, GPU-free coverage; `@playwright/test` pixel-regression tests render real fixtures headless and diff against reference PNGs, catching WebGL-specific issues (z-fighting, layering) geometry snapshots can't. |
| Deterministic, single-shot rendering (Quality Goal 2) | `composeFrame(doc, frameIndex)` is a **pure function**: same document + frame index in, same `THREE.Scene` out, no mutable cross-call state. `renderToCanvas` calls it, builds one camera, and calls `renderer.render()` exactly once — no `requestAnimationFrame` loop in `tactical_print`. |
| Extensibility toward animation (Quality Goal 3) | **`ViewModeController` as the single dispatch point**: it owns the `ViewMode` enum and is the only place that knows which modes are actually wired up. Selecting `coaching_animation` returns `{status: "not_implemented", mode}` rather than throwing — a real, tested branch, not a TODO comment. |
| Schema fidelity (Quality Goal 4) | **Generated types + a thin compat layer**: `scripts/generate-ocf-types.mjs` runs `json-schema-to-typescript` against `@opencoachingformat/spec`'s `schema/v1.json` on every `prebuild`/`pretest`. `src/types/ocf.ts` re-exports/renames from the generated file under one hard rule — it may rename, it must never redeclare a shape. See [ADR](09-architecture-decisions.md). |
| Framework-agnostic embeddability (Quality Goal 5) | **Plain imperative class API** (`new OCFRenderer(doc, opts)`, `renderer.renderToCanvas(frameIndex, canvas)`) with zero framework imports — verified against `ocf-editor`'s plain esbuild/IIFE setup as the intended consumer shape. |

## Key technology choices

- **Three.js**, chosen specifically over the original SVG-string design so
  the *same* engine can grow from `tactical_print` (2D, static) into
  `coaching_animation` (3D, dynamic) later, without a second rewrite. See
  the superseded `docs/superpowers/specs/2026-06-06-ocf-renderer-design.md`
  and its replacement, `2026-07-20-ocf-renderer-threejs-design.md`.
- **`THREE.OrthographicCamera`**, fixed top-down (`-Y` look direction), no
  `OrbitControls` — a deliberate print-style, not 3D-navigable, view for
  `tactical_print`.
- **`tsup`** for both build targets: the standard dual ESM/CJS + `.d.ts`
  library build (`npm run build`), and a separate browser-only IIFE-style
  bundle with Three.js inlined (`npm run build:browser`, verified by
  `scripts/verify-browser-bundle.mjs` to contain no bare `from 'three'`
  import and to actually export `OCFRenderer`).
- **`vitest`** (scene-graph snapshots, `jsdom` environment) and
  **`@playwright/test`** (pixel-regression), matching the sibling repos'
  tooling choices rather than a bespoke test runner.
- **GitHub Actions + npm OIDC trusted publishing** for `release.yml` —
  chosen over a long-lived `NPM_TOKEN` after npm began deprecating
  bypass-2FA tokens (the only token type that can publish without an
  interactive OTP prompt).
