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
action arrows derived from the frame's semantic actions). A multi-step drill is
rendered as a **series of single-frame stills — one image per frame**
(`renderFrames`), *not* a combined composite. This is the smallest useful core;
everything else builds on it.

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
  facing from nearby players. A defender's *meaningful* facing (toward the ball
  or the player they guard) is the **author's / LLM's / editor's** responsibility,
  expressed in the data — not a renderer heuristic.
- `rotation` is accepted but **not rendered** for offense (a filled circle has no
  facing).

> Process note for implementers: this orientation was initially mis-illustrated
> during design and only resolved by **rasterizing the glyph and looking at it**.
> Directional symbols MUST be verified against rendered output (see §7 visual
> tests), never against intuition.
>
> Because the renderer never infers facing, **example and test documents MUST use
> realistic `rotation` values** (defenders facing the ball / their matchup).
> Documents that omit `rotation` render every defender at the same default angle,
> which looks wrong — that is a data quality issue, not a renderer bug.

### 5.2 Symbol proportions and jersey numbers

Symbols are sized by a fixed **height** in screen units, scaled **uniformly**
(no distortion of the icon geometry); the width follows each icon's natural
aspect ratio. The FIBA tool's sizes are the **reference for relative
proportions**, not exact pixel mandates:

- **Offense:** height ≈ **30** (a circle, so ~30×30).
- **Defense:** the FIBA arms glyph scaled **uniformly to height ≈ 23**. Its true
  aspect (~2.2:1) means the width lands around **~51** on its own — wider and
  flatter than offense, as in the FIBA tool — *as a consequence of uniform
  scaling*, not a forced width.
- The exact base height is a render option (diagrams scale with output width);
  what matters is the **ratio** offense ≈ 30 : defender height ≈ 23.

**Jersey numbers** are laid out for **0–99** (one or two digits). Two-digit
numbers use a slightly smaller font so they fit the symbol. The number is always
drawn **upright and centered** on the symbol and **does not rotate** with the
glyph — a defender at `rotation: 180°` still shows an upright number, not an
upside-down one.

### 5.3 Distinct positions and the overlap safety net

Per the spec (a `Distinct Positions` rule was added — spec PR #6), two entities
in a single state must be at least one **player diameter** apart. The renderer's
two-part stance:

1. **Trust valid data.** Validated documents already guarantee separation, so
   symbols don't overlap.
2. **Safety net.** If symbols still *touch* after layout (e.g. an unvalidated
   document, or borderline-close valid positions), the renderer applies a small
   **visual nudge** to separate them — a render-only adjustment that does **not**
   change the underlying coordinates (which remain the source of truth). This is
   a last-resort legibility guard, not a substitute for the data rule.

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
- **Arrow trimming (end gap):** an arrowhead must **stop short of the target
  symbol's border**, not land on or inside it. The path end is pulled back by the
  target symbol's radius **plus a small margin** (≈ 4 px) before the arrowhead is
  placed. This matters most for `pass`, where the head points at a receiver, but
  applies to every arrowed action whose endpoint coincides with a player.

### 6.3 Dribble wave

The dribble overlay is a **smooth sine wave** along the (resampled) base path.

**Hard requirement — a dribble is ALWAYS wavy.** In a still frame the wave is the
*only* thing that distinguishes a dribble (moving with the ball) from a run
(`move`/`cut`, no ball). A dribble must therefore **never** render as a smooth
line, no matter how short — a wave-free dribble would be indistinguishable from a
run. (In a future animated renderer this is moot, since the ball moves with the
player; in a still with movement arrows it is essential.)

Defaults / shape rules:

- **Constant amplitude** across the wavy region (no amplitude fade). Default
  **amplitude ≈ 5 px**.
- **Fixed wavelength** (≈ **11–12 px**), snapped so a whole number of waves fits
  → every arc is the same size on straight and curved paths alike. A **shorter
  path yields FEWER waves, never squeezed waves**, and never fewer than ~1–2
  full arcs so the dribble stays recognizable.
- **Short flat ends** (a small fixed length, capped to a fraction of the path on
  short paths) so the line meets the symbol and arrowhead cleanly without eating
  the whole wave on short dribbles.
- **Curvature-clamped amplitude:** on a tightly curved path the amplitude is
  reduced so the wave does not self-overlap or look bulbous on the bend
  (amplitude bounded by a fraction of the local curvature radius), while staying
  visible.
- Rounded line caps/joins.

> **Implementation-tuned detail.** The *requirement* above is fixed (always wavy,
> fixed wavelength, fewer-not-squeezed on short paths, curvature-clamped, ≥1–2
> arcs). The **exact** amplitude/wavelength/clamp constants that look good across
> the full range of real paths — especially **short, sharply curved dribbles** —
> are deferred to implementation, where they are tuned against **visual snapshot
> tests** over many real cases (§7). Brainstorming reproduced the failure mode
> (short curved dribbles render squeezed/bulbous) but the polished fix belongs in
> code with a test harness, not in a static mockup.
>
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
import { renderFrame, renderFrames } from "@ocf/renderer";

// one frame → one SVG
const svg: string = renderFrame(doc, frameIndex, {
  width?: number,            // output pixel width (height derived from court aspect)
  colorScheme?: Partial<…>,  // overrides on top of doc.color_scheme and defaults
});

// whole drill → one SVG per frame (the typical "drill sheet" output)
const svgs: string[] = renderFrames(doc, opts);
```

- `renderFrame(doc, frameIndex, opts) -> string` (SVG markup) is the core.
- **`renderFrames(doc, opts) -> string[]`** renders **each frame as its own
  still** and returns the series. This is the primary v1 output for a multi-step
  drill: **a series of single-frame images, one per frame** — *not* a single
  combined "composite" diagram and *not* a single image with step numbers (both
  are deferred, see §10). The frame order conveys the sequence.
- Convenience wrappers can follow (`renderFrameToFile`, a small CLI), but the
  pure string-producing functions are the contract.
- The renderer assumes the document is **valid**; pairing with the validator
  (validate before render) is the intended workflow but not enforced inside the
  renderer.

---

## 9. Relationship to other OCF projects

- **Spec** (`opencoachingformat/spec`): the renderer is a consumer. The design
  surfaced two spec precisions, each fixed via a small spec PR:
  - the **defender `rotation` convention** (spec PR #5), and
  - the **distinct-positions / minimum-separation rule** (spec PR #6), which the
    renderer relies on (§5.3) and the validator will enforce.
  Future rendering work may surface more spec precisions; each becomes its own
  small spec PR.
- **Validator** (`opencoachingformat/ocf-validator`): complementary. Validate →
  render is the pipeline. Share document types where practical. A new validator
  rule for the minimum-separation constraint (spec PR #6) is a follow-up there.
- **Editor** (future): builds on this renderer.

---

## 10. Out of scope for v1 (summary)

- **Multi-frame composite** — a single combined diagram showing the whole play at
  once, with **step numbers** ordering the actions — is **v1.1**. v1 renders a
  multi-step drill as a **series of single-frame stills** (`renderFrames`), not a
  composite; step numbers exist only for the composite and are not drawn in v1.
- Animation / playback — later.
- Shot-type glyph differentiation — later (`variant`/`tags` already carry data).
- Non-FIBA court geometry — follows FIBA.
- Renderer-side inference of defender facing — explicitly rejected; `rotation`
  comes from the data only (§5.1).
