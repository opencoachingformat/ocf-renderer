# OCF Renderer — Design

**Status:** Approved (brainstorming complete)
**Date:** 2026-06-06
**Depends on:** OCF spec (`opencoachingformat/spec`), schema `v1.json` @ `5e18b5d`;
defender-rotation convention from spec PR #5.

---

## 1. Purpose

The OCF Renderer turns an Open Coaching Format document into a **drawn basketball
diagram**. It is the third companion project (after the spec and the validator),
and the visual foundation the future editor builds on.

It serves two consumers:

1. **Direct use (coaches / tools):** JSON → a clean SVG of a play or drill, in
   the browser or server-side (PDF/PNG export downstream).
2. **The editor (later):** the same render functions power a visual authoring
   surface.

**v1 scope:** render a **single frame** as a still SVG (court + entities +
action arrows derived from the frame's semantic actions). This is the smallest
useful core; everything else builds on it.

**Out of scope for v1 (roadmap):**
- Multi-frame **composite** ("playbook" image showing the whole play in one
  diagram with step numbers). Deliberately deferred — it builds on the
  single-frame renderer.
- **Animation** (time-based playback of frames).
- **Shot-type differentiation** (layup / dunk / floater / jump shot). v1 uses one
  shoot glyph for every shot; the spec's `variant`/`tags` on the `shoot` action
  carry the data for future glyph variants or labels.
- Rulesets beyond what the renderer's court geometry covers initially (FIBA
  first; NBA/NCAA/NFHS court geometry follow).

---

## 2. Tech Stack

- **TypeScript**, output **SVG** (string markup). Works in the browser (inject
  into the DOM) and server-side (write to file / rasterize). No DOM dependency in
  the core — it produces SVG strings, so it runs anywhere Node runs.
- Build/test tooling mirrors the validator for consistency: `tsup` (build),
  `vitest` (tests).
- **Schema/types:** the renderer consumes documents that conform to OCF v1. It
  should reuse the document's structure; where practical, share types with the
  validator rather than redefining the document shape.

---

## 3. Architecture

The renderer is a **pipeline of small, single-purpose stages**. Each stage has a
clear input/output and is independently testable. This mirrors a key lesson from
the design process: geometry must be computed deliberately and verified against
**rendered images**, not assumed.

```
OCF document
   │
   ▼
[1] resolve            named/relative coords → absolute court coords (per ruleset)
   │
   ▼
[2] court layout       ruleset → court SVG (lines, zone, basket) + world→screen transform
   │
   ▼
[3] entities           offense/defense/ball/coach/cone → symbol SVG (with rotation)
   │
   ▼
[4] action geometry    each action's `moves` → base path (smoothed, collision-aware)
   │
   ▼
[5] action styling     base path → styled overlay (solid/wavy/dashed/bar/glyph) + end marker
   │
   ▼
[6] compose            stack court + entities + actions into one <svg>, honoring color_scheme
   │
   ▼
SVG string
```

### Module layout

```
ocf-renderer/
├── shared/                         # assets shared with future Python/other impls if ever needed
│   └── (court geometry tables, symbol path constants)
├── packages/ts/
│   ├── src/
│   │   ├── types.ts                # render options, RenderResult, internal geometry types
│   │   ├── resolve.ts              # [1] coordinate resolution (named/relative → absolute)
│   │   ├── court/
│   │   │   ├── dimensions.ts       # court geometry per ruleset (lines, zone, arc, basket)
│   │   │   └── transform.ts        # world (court units) → screen (SVG px); half/full court
│   │   ├── symbols/
│   │   │   ├── offense.ts          # filled circle + number, 2px white stroke
│   │   │   ├── defense.ts          # FIBA "arms" glyph, rotation-aware
│   │   │   ├── ball.ts             # orange dot
│   │   │   ├── coach.ts            # "C" marker
│   │   │   └── cone.ts             # triangle
│   │   ├── path/
│   │   │   ├── smooth.ts           # Catmull-Rom through moves points
│   │   │   ├── resample.ts         # arc-length even resampling (KEY for uniform overlays)
│   │   │   ├── tangent.ts          # tangent/normal at a point; end tangent
│   │   │   └── collision.ts        # bend path away from entity obstacles
│   │   ├── overlays/
│   │   │   ├── solid.ts            # move/cut
│   │   │   ├── wavy.ts             # dribble (sine overlay, flat ends)
│   │   │   ├── dashed.ts           # pass/hand_off
│   │   │   ├── screen-bar.ts       # screen end bar ⊥ tangent
│   │   │   └── arrowhead.ts        # arrowhead at end tangent
│   │   ├── shoot.ts                # shoot glyph placement + rotation toward basket
│   │   ├── color-scheme.ts         # resolve semantic color roles → hex (doc overrides + defaults)
│   │   ├── render.ts               # orchestrates the pipeline; renderFrame(doc, frameIndex, opts)
│   │   └── index.ts                # public API
│   └── test/
│       ├── unit/*.test.ts          # per-module geometry/markup tests
│       └── visual/                 # rendered-SVG snapshot fixtures (see §7)
├── examples/                       # sample OCF docs + their rendered SVGs
├── README.md / LICENSE
└── .github/workflows/ci.yml
```

---

## 4. Court (visual style: "Soft / Modern")

The default court style is **Soft / Modern**: a light neutral background
(`#f4f6f8`), a subtly tinted painted zone (`#e3ecf5`), and quiet blue-grey accent
lines (`#3b6ea5`). All of these are **defaults**; any value the document sets in
`color_scheme` overrides them.

- **Half-court** documents render only the frontcourt (`y ≥ 0`), per spec.
- **Full-court** renders both halves.
- The **world→screen transform** maps court units (meters/feet, origin at
  midcourt center, +y toward the attacking basket) to SVG pixels, with **+y
  toward the attacking basket drawn upward on screen**. This orientation is the
  reference frame for every directional symbol below.
- Court geometry (3-point arc, paint, free-throw circle, basket, lines) is
  defined per ruleset in `court/dimensions.ts`. **FIBA first**; NBA/NCAA/NFHS
  follow the same structure.

---

## 5. Entity symbols

| Entity | Symbol | Notes |
|---|---|---|
| `offense` | filled circle + number | **2px white stroke** around the circle (spec); fill = `color_scheme.offense_fill`. |
| `defense` | **FIBA "arms" glyph** + number | An arc (the outstretched arms) over an inner circle. **Directional** — see §5.1. Fill neutral dark by default; `color_scheme.defense_*`. |
| `ball` | small orange dot | Lives in the document's `balls[]`; drawn at its carrier or loose position. |
| `coach` | circle labelled "C" | |
| `cone` | small triangle | Training marker / obstacle. |

The canonical defender arm path (from the FIBA tool, verified by rendering):
`m -20,10 c 10,-16 30,-16 40,0 -5,-24 -35,-24 -40,0` over a `r=7` circle.

### 5.1 Defender orientation (`rotation`) — verified convention

The defender glyph is **directional** and uses the OCF `rotation` field. The
convention (defined in spec PR #5, and **verified by rendering** the raw glyph):

- **`rotation: 0°` (default) — the defender "faces down", arms open toward `−y`**
  (away from the attacking basket). This is the natural stance: the defender
  stands between the attacker and the basket they protect, with the attacker
  coming from `+y`. The **raw, unrotated** FIBA glyph already opens toward `−y`,
  so the renderer draws it **without transformation at 0°**.
- Increasing `rotation` rotates the glyph **clockwise on screen**: `90°` → arms
  toward `+x` (viewer's right), `180°` → `+y` (toward the attacking basket),
  `270°` → `−x` (viewer's left). This matches native SVG `rotate()`.
- The renderer applies `rotation` **exactly as given**; it does **not** infer
  facing from nearby players.
- `rotation` is accepted but **not rendered** for offense (a filled circle has no
  facing).

> Process note for implementers: this orientation was initially mis-illustrated
> during design and only resolved by **rasterizing the glyph and looking at it**.
> Directional symbols MUST be verified against rendered output (see §7 visual
> tests), never against intuition.

---

## 6. Action notation (the core)

OCF stores **semantic actions**, not drawn lines. The renderer derives each
action's line/arrow. The architecture separates three concerns so all action
types share consistent geometry:

**Path + Overlay + End-marker (three layers):**

1. **Base path** — computed once from the action's `moves` points
   (`path/smooth.ts`). This is the clean, editable path (the "anchors").
2. **Style overlay** — rendered *onto* the base path per action type. The overlay
   never changes the path's endpoints or tangents.
3. **End marker** — arrowhead or screen-bar, aligned to the **end tangent of the
   base path**.

### 6.1 Notation table

| Action | Line style | End marker |
|---|---|---|
| `move`, `cut` | solid | arrowhead (tangent to path end) |
| `dribble` | **sine wave** overlay (see §6.3) | arrowhead |
| `pass`, `hand_off` | **dashed** | arrowhead |
| `screen` | solid | **end bar ⊥ to the end tangent** (no arrowhead) |
| `shoot` | — (no field line) | **shoot glyph at the shooter** (see §6.4) |

### 6.2 Path geometry rules

- **Smoothing:** the base path is a **Catmull-Rom** spline through the action's
  `moves` points. Two points → a straight line. Four-plus points → a smooth
  curve through all of them.
- **Arc-length resampling (critical):** before any overlay is applied, the path
  is **resampled to even arc-length spacing** (`path/resample.ts`). Without this,
  wave/dash overlays bunch up on curves. This makes overlay features uniform on
  straight and curved paths alike.
- **Tangent-aware markers:** arrowheads and the screen bar are oriented by the
  **tangent at the path's end**, so they read correctly on curved paths (the
  screen bar is perpendicular to that tangent, not always vertical).

### 6.3 Dribble wave (verified defaults)

The dribble overlay is a **smooth sine wave** along the (resampled) base path:

- **Constant amplitude** across the wavy region (no fade-in/fade-out of
  amplitude). Default **amplitude ≈ 5 px**.
- **Wavelength** chosen so an **integer number of full waves** fits the wavy span
  exactly → every arc has the same size, including on curves. Target wavelength
  **≈ 12 px**, snapped to fit.
- **Flat (wave-free) ends of 15 px** at the start and before the arrowhead, so
  the line meets the player symbol and the arrowhead cleanly. (A fixed pixel
  length, not a percentage.)
- Rounded line caps/joins for a clean snake.

> The "wave crosses the path at 90°" coil/loop alternative was explored and
> rejected for v1 in favor of the simpler, well-established sine wave.

### 6.4 Shoot glyph (FIBA glyph)

A shot is marked by a **compact arrow glyph placed at the shooter**, not a line
across the court. The glyph (from the FIBA tool) is an outlined arrowhead over a
short stem: `m -9,-25 8,-14 8,14 -4,0 0,13 -7.5,0 0,-13 z`.

- Placed just outside the shooter's circle on the side toward the basket, at a
  small **gap ≈ 13 px**, scaled ≈ 0.85.
- **Rotated to point at the basket** (direction shooter→basket).
- White fill with a dark outline so it reads on the court.

### 6.5 Collision avoidance (path must not cross players)

Auto-smoothing is the curve strategy (no explicit `curved` flag needed). **But a
rendered action path must not pass through an entity** — another offense player,
a defender, a coach, or a cone. When the smoothed base path would intersect an
entity's symbol radius, the renderer **bends the path around the obstacle**
(`path/collision.ts`): nudge the affected control points perpendicular to the
path, away from the obstacle, until clearance is met, then re-smooth.

- This applies to movement/dribble/pass paths.
- The shooter→basket direction for the shoot glyph is a direction, not a drawn
  path, so it is exempt.
- v1 uses a simple, deterministic nudging heuristic (clear the obstacle's radius
  + a small margin). Sophisticated routing is a later refinement; the
  requirement for v1 is simply **no path is drawn straight through a symbol**.

---

## 7. Testing strategy

Two layers, reflecting the hard-won lesson that **rendered output must be looked
at**:

1. **Unit tests** (`test/unit`): pure geometry and markup. Coordinate resolution,
   the world→screen transform, tangent/normal math, arc-length resampling
   (assert even spacing), collision nudging (assert the output path clears a
   placed obstacle), color-scheme resolution, and that each symbol/overlay
   produces the expected SVG primitives.

2. **Visual snapshot tests** (`test/visual`): render a set of fixture OCF
   documents to SVG and compare against committed reference SVGs. A diff in the
   SVG string flags an unintended visual change. Fixtures include: each entity
   type, a defender at 0/90/180/270°, each action type on a straight path and on
   a ≥4-anchor curve, a path that must route around an obstacle, and a couple of
   real spec examples (e.g. pick-and-roll frame). Rasterizing a snapshot for
   human review is part of the workflow when a visual fixture changes.

CI runs both layers (one TS job initially, mirroring the validator's CI).

---

## 8. Public API (sketch)

```ts
import { renderFrame } from "@ocf/renderer";

const svg: string = renderFrame(doc, frameIndex, {
  width?: number,            // output pixel width (height derived from court aspect)
  colorScheme?: Partial<…>,  // overrides on top of doc.color_scheme and defaults
});
```

- `renderFrame(doc, frameIndex, opts) -> string` (SVG markup) is the core.
- Convenience wrappers can follow (`renderFrameToFile`, a small CLI), but the
  pure string-producing function is the contract.
- The renderer assumes the document is **valid**; pairing with the validator
  (validate before render) is the intended workflow but not enforced inside the
  renderer.

---

## 9. Relationship to other OCF projects

- **Spec** (`opencoachingformat/spec`): the renderer is a consumer. The design
  surfaced one spec gap (defender `rotation` convention), already fixed in spec
  PR #5. Future rendering work may surface more spec precisions; each becomes its
  own small spec PR.
- **Validator** (`opencoachingformat/ocf-validator`): complementary. Validate →
  render is the pipeline. Share document types where practical.
- **Editor** (future): builds on this renderer.

---

## 10. Out of scope for v1 (summary)

- Multi-frame composite (playbook image with step numbers) — v1.1.
- Animation / playback — later.
- Shot-type glyph differentiation — later (`variant`/`tags` already carry data).
- Non-FIBA court geometry — follows FIBA.
