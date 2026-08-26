# 12. Glossary

| Term | Definition |
|---|---|
| **OCF (Open Coaching Format)** | The canonical JSON schema for describing a basketball play: entities, balls, court, and a sequence of frames with semantic actions. Maintained in `opencoachingformat/spec`, published as `@opencoachingformat/spec`. |
| **OCF document** | A single JSON document conforming to the OCF schema — the input to `OCFRenderer`. |
| **Entity** | A placeable actor in a play: offense player, defense player, coach, cone, or station. |
| **Frame** | One step in a play's timeline. Frames carry `start_state`/`end_state` *deltas*, not full snapshots — see [Crosscutting Concepts §8.3](08-crosscutting-concepts.md). |
| **Action** | A semantic event within a frame describing what an entity/ball does: `move`, `cut`, `dribble`, `pass`, `screen`, `shoot`, `defend`, `rebound`, `pickup`. |
| **View mode** | The rendering strategy selected for a document: `tactical_print` (implemented — static, top-down, single frame) or `coaching_animation` (architecturally acknowledged, not yet implemented). |
| **`OCFRenderer`** | The public top-level class (`src/render.ts`) — the primary integration point for consumers. |
| **`ViewModeController`** | Dispatches a `ViewMode` to its scene-building implementation; the seam future view modes plug into. |
| **`composeFrame`** | The pure function that builds a `THREE.Scene` for a single resolved frame — the core of the `tactical_print` pipeline. |
| **`CoordinateTransformer`** | Resolves OCF's three coordinate variants (`{x,y}`, `{named}`, `{relative_to,dx,dy}`) into Three.js world-space vectors. |
| **Named position** | A well-known court location referenced by name (e.g. `top_of_the_key`, `paint_center`) instead of raw coordinates, resolved via `src/court/named-positions.ts`, which must stay in sync with `ocf-validator`'s canonical catalog. |
| **`resolveFrameState`** | Walks a document's frames from 0 up to a target index, accumulating delta-based `start_state`/`end_state` changes into the actual entity/ball state at that frame. |
| **Scene-graph snapshot test** | A `vitest` test that serializes a produced `THREE.Object3D` graph (geometry, transforms, materials) and diffs it against a stored snapshot — fast, deterministic, GPU-free correctness coverage. |
| **Pixel-diff / visual regression test** | A `@playwright/test` test that renders a real fixture in an actual browser and diffs the resulting pixels against a reference PNG — catches WebGL-specific issues snapshot tests can't. |
| **Browser bundle** | `dist/browser/index.js`, built by `tsup.browser.config.ts` (`npm run build:browser`) with Three.js inlined — no bare `from 'three'` import, verified by `scripts/verify-browser-bundle.mjs`. |
| **Generated types** | `src/types/ocf.generated.ts`, produced from `@opencoachingformat/spec`'s `schema/v1.json` via `json-schema-to-typescript`, run by `scripts/generate-ocf-types.mjs` before every build/test. |
| **OIDC trusted publishing** | npm's identity-federation-based publish authentication for CI (`id-token: write`, no long-lived token), used by `release.yml` instead of an `NPM_TOKEN` secret. |
| **FIBA defaults** | The default court dimension set (`resolveCourtDimensions`), overridable per document via `custom_dimensions`; structured so other rulesets (NBA/NCAA/NFHS) can be added later. |
