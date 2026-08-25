# 8. Crosscutting Concepts

## 8.1 Coordinate system and axis convention

OCF documents describe positions in court meters (`x`, `y`), origin
convention defined by `resolveCourtDimensions`. `CoordinateTransformer.toWorld`
maps this to Three.js world space as `new THREE.Vector3(x, 0, -y)`:
court X stays world X, court Y becomes **negated** world Z, and Y is always
0 (the court plane) with height reserved for symbols/labels sitting slightly
above it to avoid z-fighting. Every module that places geometry goes through
`CoordinateTransformer` — none compute world coordinates by hand — so this
single sign convention is the one place the mapping can go wrong.

## 8.2 Coordinate resolution: three variants, one entry point

An OCF coordinate is one of `{x, y}` (absolute), `{named}` (a lookup into
`src/court/named-positions.ts`), or `{relative_to, dx, dy}` (an offset from
another resolved entity/point). All three are resolved through the same
`CoordinateTransformer.resolve()` method, so callers never need to branch on
which variant they received.

## 8.3 Frames are deltas, not snapshots

An OCF document's `frames` array does not carry full entity positions per
frame — each frame carries `start_state`/`end_state` deltas relative to the
previous frame. `resolveFrameState` is the single place that walks frames
`0..N` and accumulates the actual state at frame `N`. Any new code that
needs "where is entity X at frame N" must call this function rather than
reading `frames[N]` directly — reading a single frame in isolation gives an
incomplete picture.

## 8.4 Generated types as the schema-fidelity boundary

`src/types/ocf.generated.ts` is regenerated from `@opencoachingformat/spec`
before every build and test run (`prebuild`/`pretest` hooks calling
`scripts/generate-ocf-types.mjs`). `src/types/ocf.ts` sits directly on top
of it as a thin, rename-only layer — the file's own header comment states
the rule explicitly: it may rename and re-export, it must never redeclare a
shape that already exists in the generated file. This is the direct fix for
a real historical bug (see [ADR §9](09-architecture-decisions.md)) where a
hand-maintained type file drifted from the schema in five separate ways.

## 8.5 Validate-then-render, not validate-in-render

The renderer never calls into `ocf-validator` and performs no schema or
semantic validation of its own — see [Constraints §2](02-architecture-constraints.md).
Every test fixture and every real caller is expected to have already passed
`ocf-validator`'s `validate()`. This keeps the renderer's only concern
"turn a valid document into pixels," at the cost of undefined behavior on
invalid input — an explicit, accepted trade-off, not an oversight.

## 8.6 Path pipeline: smooth → resample → avoid collisions

Every path-drawing action (`move`, `cut`, `dribble`, `pass`, `screen`)
shares one geometric pipeline rather than each implementing its own curve
logic: raw `moves` anchor points are smoothed via `CatmullRomCurve3`,
resampled at constant arc length (so dash/wave patterns look uniform
regardless of anchor spacing), then steered to avoid overlapping entity
symbols. Only the *styling* varies per action type (dashed, wave, end-bar,
arrowhead trimming) — the underlying curve math does not.

## 8.7 Testing strategy as a design concept, not an afterthought

Because visual correctness cannot be checked by the type system, the
project treats two complementary test layers as part of the architecture
itself, not bolted on after: GPU-free `vitest` scene-graph snapshots for
fast iteration, and real-browser Playwright pixel-diff tests for what
snapshots can't catch (see [Solution Strategy §4](04-solution-strategy.md)
and [Quality Requirements §10](10-quality-requirements.md)).

## 8.8 No animation loop, no hidden mutable state

`tactical_print` renders are single-shot: `composeFrame` is pure, and
`renderToCanvas` calls `renderer.render()` exactly once per invocation. No
module in the render path keeps mutable state between calls (the one
resource that *is* reused across calls without being reset — the
`WebGLRenderer` instance not being reused at all — is a known gap, not a
hidden-state bug; see [Risks §11](11-risks-technical-debt.md)).
