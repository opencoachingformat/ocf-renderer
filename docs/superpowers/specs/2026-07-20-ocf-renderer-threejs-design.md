# OCF Renderer — Three.js Design (Foundation + tactical_print)

**Status:** Approved (brainstorming complete)
**Date:** 2026-07-20
**Supersedes:** `2026-06-06-ocf-renderer-design.md` (SVG-only design; see note in that
file). This spec covers the shared foundation and the `tactical_print` view mode
only. `coaching_animation` is deferred to a follow-up spec.
**Depends on:** OCF spec (`opencoachingformat/spec`), schema `v1.json`. No shared
`@ocf/*` TypeScript types package exists yet (confirmed by inspecting the sibling
`ocf-validator` and `ocf-editor` repos) — types are vendored locally (§6).

---

## 1. Purpose

The OCF Renderer turns an Open Coaching Format document into a rendered
basketball diagram, using **Three.js** so the same engine can eventually support
both a static 2D print-style view and a dynamic 3D animated view, switchable via
a central `ViewModeController`.

This is a **pivot from the original SVG-string design**: that design was
static/2D-only by construction (no path to animation without a rewrite). The
Three.js foundation trades away trivial server-side string output for a single
engine that can grow into full 3D animation later, without a second rewrite.

**This spec's scope:** the shared foundation (`OCFParser`,
`CoordinateTransformer`, `ViewModeController`) plus a complete
`tactical_print` mode (2D static, orthographic, FIBA notation). `coaching_animation`
is architecturally acknowledged (a real enum value, a defined "not implemented"
result) but not built here — it gets its own brainstorming/spec pass once this
foundation is proven, per explicit user decision to decompose the original
request into two projects.

---

## 2. Tech stack

- **TypeScript + Three.js**, rendering into a DOM `<canvas>` in the browser.
  Framework-agnostic (no React/Vue binding) — confirmed against `ocf-editor`,
  the intended consumer, which is a plain esbuild/IIFE app.
- Single package (no `shared/` cross-language folder — Three.js is
  browser/JS-only, unlike the old SVG-string design which could target a
  hypothetical Python implementation).
- Build/test tooling mirrors the sibling repos: `tsup` (build), `vitest`
  (scene-graph unit tests), `@playwright/test` (pixel-regression tests).
- `package.json` ships `"private": true` until the package is deliberately
  readied for publish — a simple guard against an accidental `npm publish`
  during active development.

---

## 3. Architecture

### 3.1 Modules

- **`OCFParser`** — reads an OCF JSON document into vendored local types
  (`src/types/ocf.ts`). Assumes the document is already valid (validate → render
  is the intended pipeline, as in the old design); this module does structural
  reading, not full schema validation.
- **`CoordinateTransformer`** — resolves named/relative coordinates to absolute,
  and normalizes court boundaries to a fixed **1 unit = 1 meter** internal scale
  directly in Three.js world space (XZ = court plane, Y = up). Ruleset-
  parameterized; FIBA dimensions ship now, NBA/NCAA/NFHS hooks are left open but
  unimplemented.
- **`ViewModeController`** — owns the `VIEW_MODE` enum
  (`"tactical_print" | "coaching_animation"`), selects the camera strategy, and
  dispatches to the active `VisualPresenter`. Selecting `coaching_animation`
  returns a defined `{status: "not_implemented"}` result rather than crashing or
  silently no-op'ing — this is the proven extension point for the next spec.
- **`VisualPresenter`** — one implementation per view mode. This spec implements
  `TacticalPrintPresenter` only.

### 3.2 `TacticalPrintPresenter` pipeline

A mechanical port of the original SVG design's 6-stage pipeline. Every stage
through path math is **pure geometry, unchanged** from the original design —
only the final stages emit `THREE.Object3D` graphs instead of SVG path strings:

```
OCF document
   │
   ▼
[1] resolve            named/relative coords → absolute court coords (per ruleset)
   │
   ▼
[2] court layout        ruleset → flat court geometry (lines, zone, basket) on XZ plane
   │
   ▼
[3] entities             offense/defense/ball/coach/cone → THREE.Object3D (mesh + sprite)
   │
   ▼
[4] action geometry      each action's `moves` → CatmullRomCurve3 (smoothed, collision-aware)
   │
   ▼
[5] action styling       base curve → styled overlay (solid/wavy/dashed/T-bar) + end marker
   │
   ▼
[6] compose              assemble THREE.Scene (court + entities + actions), apply color_scheme
   │
   ▼
THREE.Scene, rendered once
```

### 3.3 Package layout

```
ocf-renderer/
├── src/
│   ├── types/ocf.ts                 # vendored OCF document types (see §6)
│   ├── parser/                      # OCFParser
│   ├── coordinates/                 # CoordinateTransformer, court dimension tables (FIBA)
│   ├── view-mode/                   # ViewModeController, VIEW_MODE enum
│   ├── presenters/
│   │   └── tactical-print/
│   │       ├── camera.ts            # OrthographicCamera setup
│   │       ├── symbols/             # offense, defense (arms glyph), ball, coach, cone
│   │       ├── path/                # smooth, resample, tangent, collision (ported, pure math)
│   │       ├── overlays/            # solid, wavy (dribble), dashed, screen-bar, arrowhead
│   │       ├── shoot.ts             # shoot glyph placement + rotation toward basket
│   │       ├── color-scheme.ts      # resolve color_scheme → THREE.Color
│   │       └── compose.ts           # build the final THREE.Scene
│   ├── render.ts                    # OCFRenderer public API (mount/render/dispose lifecycle)
│   └── index.ts
├── test/
│   ├── unit/                        # scene-graph JSON snapshot tests
│   └── visual/                      # Playwright pixel-regression tests
├── examples/                        # sample OCF docs + rendered output
├── README.md / LICENSE
└── .github/workflows/ci.yml
```

---

## 4. Camera & render lifecycle

- **Camera:** `THREE.OrthographicCamera`, positioned above the court center
  looking straight down (`-Y`), frustum sized to the court bounds plus a small
  margin. No `OrbitControls` — this is a fixed print-style view.
- **Static rendering:** no `requestAnimationFrame` loop. All players render at
  their frame-start positions; every action's trace renders simultaneously as a
  visible static path (no time-based animation in this mode).
- **Deterministic render-complete lifecycle:** the presenter builds the full
  scene once, calls `renderer.render(scene, camera)` exactly once, then resolves
  a promise (`OCFRenderer.renderFrame()` return value). This is designed so a
  **future** headless Playwright/Puppeteer step can load the page, `await` this
  promise, and then call `renderer.domElement.toDataURL()` with no timing races
  — without building that headless/server export capability now. No Node-side
  GL library (`headless-gl`, etc.) is used or referenced in this spec; rendering
  is DOM-`<canvas>`-only.

---

## 5. Entity symbols

All symbols are **flat `THREE.ShapeGeometry` meshes** lying on the court plane
(XZ, Y-up) plus, where needed, a canvas-texture `THREE.Sprite` label (sprites
billboard toward the camera automatically, so labels stay upright regardless of
mesh rotation — simpler than the old SVG "counter-rotate the number" rule).
Flat meshes are a deliberate choice: they lie flat for `tactical_print` today and
can double as ground-markers under 3D avatars in a future `coaching_animation`
mode.

| Entity | Geometry | Label |
|---|---|---|
| Offense | Flat disc (height ≈ 30, ported ratio from the old design), white outline ring (slightly larger disc) underneath | Jersey number sprite, centered |
| Defense | FIBA "arms" glyph (`m -20,10 c 10,-16 30,-16 40,0 -5,-24 -35,-24 -40,0` over an r=7 base circle) converted to a `THREE.Shape` via bezier commands, uniformly scaled to height ≈ 23. **Rotated around Y** per the OCF `rotation` field — directional, per explicit decision to keep the FIBA glyph over a simplified "X" symbol | Position-number sprite, centered |
| Ball | Small flat orange disc, its own entity (not a ring-on-handler). On-coordinate when loose; offset ahead + to one side of the carrier when `carried_by` is set (ahead = initial tangent of the carrier's ball action, side = right by default / `right_handed`, left for `left_handed`) — same math as the old design, applied to `(x, z)` | none |
| Coach | Flat disc | "C" sprite |
| Cone | Flat triangle | none |

**Rotation convention:** the old design's verified convention (`0°` = glyph
faces away from the attacking basket, increasing `rotation` = clockwise) is
re-verified after porting, since the rotation axis changes from screen-Z to
world-Y. Covered by a dedicated scene-graph snapshot test at 0/90/180/270°.

Jersey/position numbers: 0–99, always upright and centered (guaranteed by
sprite billboarding, not by a counter-rotation rule).

---

## 6. Action notation & path geometry

Three-layer model, ported from the old design: **base path → style overlay →
end marker**. Path math (Catmull-Rom smoothing, arc-length resampling,
tangent/normal, collision avoidance) is unchanged, now operating in 3D
(`Vector3` with constant `y = 0`) instead of 2D.

- **Base path:** `THREE.CatmullRomCurve3` through the action's `moves` points.
  Resampled to even arc-length spacing before any overlay is applied (critical —
  without it, wave/dash overlays bunch up on curves).

| Action | Line style | End marker |
|---|---|---|
| `move`, `cut` | Solid `THREE.Line` | `THREE.ArrowHelper` at end tangent |
| `dribble` | Sine-wave overlay: custom `BufferGeometry` computing a sine offset orthogonal to the local tangent at each resampled point. Constant amplitude, fixed wavelength snapped to a whole number of arcs, curvature-clamped amplitude on tight bends, short flat ends. **Always wavy, never squeezed** — same hard requirement as the old design; exact constants tuned against visual snapshot tests | `ArrowHelper` |
| `pass`, `hand_off` | `THREE.Line` + `THREE.LineDashedMaterial` (`computeLineDistances()` required before render) | `ArrowHelper`, trimmed back from the target symbol's radius + margin |
| `screen` | Solid `THREE.Line` | Perpendicular T-bar segment at the endpoint, oriented to the end tangent — no arrowhead |
| `shoot` | none (no drawn path) | Shoot glyph (`ShapeGeometry`, same outlined-arrowhead-over-stem shape as the old design), placed just outside the shooter's disc, rotated toward the basket |

- **Collision avoidance:** when the smoothed path would pass within an entity's
  symbol radius, control points are nudged perpendicular to the path (in the XZ
  plane) until clear, then re-smoothed. Applies to move/dribble/pass; the shoot
  glyph is exempt (a direction, not a drawn path).
- **Arrow trimming:** `ArrowHelper` length is pulled back by the target symbol's
  radius + a small margin so the head stops short of the border.

---

## 7. Public API & `ViewModeController`

```ts
class OCFRenderer {
  constructor(container: HTMLElement, opts?: { colorScheme?: Partial<ColorScheme> });

  setMode(mode: "tactical_print" | "coaching_animation"): void;

  // Resolves after the scene is built and renderer.render() has completed
  // exactly once — the deterministic hook a future headless capture step awaits.
  renderFrame(doc: OcfDocument, frameIndex: number): Promise<RenderResult>;

  dispose(): void;
}

type RenderResult =
  | { status: "ok" }
  | { status: "not_implemented"; mode: "coaching_animation" };
```

- `setMode("coaching_animation")` + `renderFrame(...)` resolves
  `{status: "not_implemented", mode: "coaching_animation"}` — no exception, no
  partial scene. `ViewModeController` is the single place that knows which modes
  are wired up.
- `dispose()` tears down the `WebGLRenderer`, geometries, materials, and label
  textures — required since this is a long-lived DOM-mounted object, unlike the
  old SVG API's one-shot string return.
- No framework binding; a plain imperative class, matching `ocf-editor`'s
  esbuild/IIFE setup.

---

## 8. Court style

Carries over the old design's default **"Soft / Modern"** palette (light
neutral background, subtly tinted painted zone, blue-grey accent lines) as
`THREE.Color` material values, overridable via `doc.color_scheme` — same
override mechanism as before, resolved to Three.js materials instead of SVG
attributes. Half-court documents render only `y ≥ 0` (world Z, per the XZ court
plane); full-court renders both halves. FIBA court geometry (paint, arc,
free-throw circle, basket, lines) is defined per ruleset; FIBA ships first,
NBA/NCAA/NFHS structurally possible but not implemented.

---

## 9. Testing strategy

Two layers, mirroring the old design's "verify against rendered output, not
assumption" discipline:

1. **Scene-graph snapshot tests** (`test/unit`): assert on the produced
   `THREE.Object3D` graph — geometry control points, vertex positions, colors,
   transforms — serialized to JSON and diffed. Fast, deterministic, no GPU
   required. Covers path smoothing, arc-length resampling (even spacing),
   collision nudging, wave/T-bar/ball-offset math, and defender rotation at
   0/90/180/270°.
2. **Playwright pixel-regression tests** (`test/visual`): a focused set of
   full-scene fixtures rendered headless and screenshotted, compared against
   reference PNGs. Catches WebGL-specific visual bugs (z-fighting, layering,
   texture scaling) that geometry snapshots can't. Leverages the
   render-complete promise from §4 for deterministic capture timing. Fixtures:
   each entity type, each action type on straight and curved paths, a path
   routed around an obstacle, carried-ball offset (right/left/loose), and a
   short sharply-curved dribble (the squeeze failure mode).

CI runs both layers.

---

## 10. Types (§6 reference)

No published `@ocf/*` types package exists yet (checked `ocf-validator` — its
exported `OcfDoc` type is an untyped `Record<string, unknown>` — and confirmed
nothing is published to npm). OCF document types are vendored locally in a
single isolated module, `src/types/ocf.ts`, hand-written from
`ocf-repo/schema/v1.json`. Kept isolated from the renderer's internal logic so
that once a shared types package is published, this file can be deleted and
replaced with a single import statement.

---

## 11. Relationship to other OCF projects

- **Spec** (`opencoachingformat/spec`): source of truth for the document schema
  and the FIBA notation conventions (defender rotation, distinct positions,
  handedness tags) carried over from the original design.
- **Validator** (`opencoachingformat/ocf-validator`): validate → render remains
  the intended pipeline; no shared types package yet (§10).
- **Editor** (`opencoachingformat/ocf-editor`): the intended consumer. Currently
  renders with Konva in a plain esbuild/IIFE app — confirms the framework-
  agnostic, imperative API shape in §7.

---

## 12. Out of scope for this spec

- **`coaching_animation`** full implementation (3D avatars, pose blending,
  perspective/orbit camera, timeline-driven movement, duration/intensity
  timing engine) — deferred to a dedicated follow-up spec, built on this
  foundation.
- Multi-frame composite ("playbook" image with step numbers).
- NBA/NCAA/NFHS court geometry (architecture allows it; tables not written).
- Headless/server-side export (PNG/PDF generation without a real browser) — the
  render-complete lifecycle hook is designed for this, but the headless capture
  step itself is not built here.
