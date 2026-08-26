# 1. Introduction and Goals

## 1.1 Requirements Overview

The OCF Renderer turns an [Open Coaching Format](https://github.com/opencoachingformat/spec)
(OCF) document into a rendered basketball diagram. Given a document and a
frame index, it produces a `THREE.Scene` (court + entities + action paths for
that frame) that can be drawn to a `<canvas>` in the browser.

An OCF document describes a play as entities (offense/defense players, cones,
stations) placed on a court, balls with a possession lifecycle, and a
sequence of frames whose `actions` (`move`, `cut`, `dribble`, `pass`,
`screen`, `shoot`, …) advance entity/ball state from `start_state` to
`end_state`.

The renderer serves:

1. **Downstream consumers** that need a visual from OCF JSON without
   reimplementing court geometry, action notation, or path styling — the
   `opencoachingformat/spec` docs site's renderer playground today, a
   planned web editor (`ocf-editor`) next.
2. **Itself, as a foundation** — the current `tactical_print` view mode
   (static, top-down, single-frame) is deliberately built on an engine
   (Three.js) capable of a future `coaching_animation` mode (dynamic,
   frame-to-frame playback), without a second rewrite.

## 1.2 Quality Goals

| Priority | Quality Goal | Motivation |
|---|---|---|
| 1 | **Verified-not-assumed visual correctness** | Symbol placement, path geometry, and rotation conventions are subtle enough that they've historically been wrong on first implementation (defender orientation, squeezed dribble waves — see `RESUME.md`'s design history). Every geometric claim is checked against rendered/snapshotted output, not eyeballed. |
| 2 | **Deterministic, single-shot rendering** | `renderToCanvas` builds a scene and renders it exactly once per call — no animation loop, no frame-to-frame mutable state in `tactical_print`. Same document + frame index always produces the same scene graph, which is what makes both snapshot tests and pixel-diff tests meaningful at all. |
| 3 | **Extensibility toward animation without a rewrite** | The `ViewModeController` / view-mode-per-scene-builder split exists specifically so `coaching_animation` can be added later as a new branch, not a redesign. Selecting it today returns a defined `{status: "not_implemented"}` rather than crashing — a proven, not aspirational, extension point. |
| 4 | **Schema fidelity, not a hand-maintained copy** | Renderer types are generated from the canonical schema (`@opencoachingformat/spec`), not hand-written. This was learned the hard way: an earlier hand-maintained `src/types/ocf.ts` had drifted from the real schema in five concrete ways (wrong enum, a nonexistent field, a truncated `meta`, non-functional `branches`, mismatched `color_scheme` keys) before codegen replaced it. See [ADR: generated types](09-architecture-decisions.md). |
| 5 | **Framework-agnostic embeddability** | `OCFRenderer` is a plain, imperative TypeScript class with no React/Vue/framework coupling — confirmed against `ocf-editor` (a plain esbuild/IIFE app) as the intended primary consumer. |

## 1.3 Stakeholders

| Role | Expectations |
|---|---|
| Spec maintainers (`opencoachingformat/spec`) | The renderer's OCF types and named-position table stay in sync with the canonical schema and `ocf-validator`'s canonical catalog — not a silently divergent local copy. |
| Docs-site / playground (`opencoachingformat/spec`'s Astro site) | A published, versioned npm package (`@opencoachingformat/renderer`) it can pin a version of and load from a CDN — not a pinned git commit it has to clone-and-build itself. |
| Editor tooling (planned: `ocf-editor`) | A stable, framework-agnostic `OCFRenderer` API it can embed directly. |
| Validator (companion repo `ocf-validator`) | Validate → render remains the intended pipeline: the renderer assumes its input document is already schema-valid and does not re-validate it. |
| Renderer maintainers | Confidence that a change to court geometry, symbol placement, or path styling is verified against actual rendered output before merge, not just "the types compile." |
