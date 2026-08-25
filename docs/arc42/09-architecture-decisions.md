# 9. Architecture Decisions

Recorded inline (MADR-style, condensed) rather than as a separate
`docs/adr/` directory — the renderer's decision history is small enough
today that one chapter is proportionate; this can split out later if it
grows, following `ocf-validator`'s convention at that point.

## ADR-01: Three.js over the original SVG-string design

- **Status**: Accepted (supersedes the original design).
- **Context**: The first design (`docs/superpowers/specs/2026-06-06-ocf-renderer-design.md`)
  rendered directly to an SVG string. It covered `tactical_print` well but
  had no credible growth path to a future animated `coaching_animation`
  view mode without a rewrite.
- **Decision**: Rebuild on Three.js (`docs/superpowers/specs/2026-07-20-ocf-renderer-threejs-design.md`),
  even though v1 only needs a static top-down view, so `coaching_animation`
  can be added as a new view mode later on the same engine.
- **Consequences**: Adds a WebGL/Three.js runtime dependency and rules out
  a pure server-side/headless-GL rendering path (see [Constraints §2](02-architecture-constraints.md),
  [Risks §11](11-risks-technical-debt.md)) in exchange for a real extension
  point instead of a hypothetical one.

## ADR-02: Generated types, never hand-maintained

- **Status**: Accepted.
- **Context**: An earlier hand-maintained `src/types/ocf.ts` had drifted
  from the real schema in five concrete, discovered ways: a wrong enum, a
  field that didn't exist, a truncated `meta` shape, non-functional
  `branches`, and mismatched `color_scheme` keys. This class of bug is what
  caused the "Unknown named position 'top_of_the_key'" runtime failure that
  motivated auditing the type layer in the first place.
- **Decision**: Generate `src/types/ocf.generated.ts` from
  `@opencoachingformat/spec`'s `schema/v1.json` via
  `json-schema-to-typescript`, run automatically before every build and
  test (`prebuild`/`pretest`). `src/types/ocf.ts` may only rename/re-export
  from the generated file, enforced by convention and code review, not
  tooling.
- **Consequences**: Requires `@opencoachingformat/spec` as a devDependency
  and a working codegen script; a broken or skipped codegen step fails
  loudly (missing module) rather than silently serving stale types — as it
  did once, when the codegen script had a `require()`-in-ESM bug that threw
  and silently fell back to a stale sibling-checkout copy.

## ADR-03: `renderToCanvas` is synchronous

- **Status**: Accepted (deviates from the original design doc).
- **Context**: `docs/superpowers/specs/2026-07-20-ocf-renderer-threejs-design.md`
  originally specified `renderFrame(doc, frameIndex): Promise<RenderResult>`
  and a `constructor(container, opts)` taking a DOM container. The
  implemented API is synchronous (`renderFrame`/`renderToCanvas` return
  directly, no `Promise`) and takes the OCF document, not a container, in
  the constructor (`constructor(document, options)`).
- **Decision**: Keep the simpler synchronous, document-first shape that was
  actually built, and treat the design doc as historical/superseded on
  this point rather than retrofitting an async API with no current async
  work inside it (`tactical_print` has no `await` anywhere in its path).
- **Consequences**: This arc42 documents the real, current API as ground
  truth; the design doc under `docs/superpowers/specs/` is kept for
  historical rationale but is not authoritative where it conflicts with
  `src/`. A future `coaching_animation` implementation may reopen this
  decision if it needs genuine async work (e.g. streaming/loading).

## ADR-04: OIDC trusted publishing over a long-lived npm token

- **Status**: Accepted.
- **Context**: npm began deprecating "bypass-2FA" granular access tokens —
  the only token type that can `npm publish` from CI without an interactive
  OTP prompt — first losing account/org management ability, later losing
  the ability to publish at all.
- **Decision**: Authenticate `release.yml` via npm's OIDC trusted
  publishing (`id-token: write`, no `NPM_TOKEN` secret) instead of any
  token, matching the same choice made in `spec` and `ocf-validator`.
- **Consequences**: Requires the package to already exist (one manual
  bootstrap publish) and a trusted publisher configured on npmjs.com
  pointing at this exact repo + workflow file; also requires npm CLI
  ≥ 11.5.1 in the runner, which `actions/setup-node@v6` + Node 22 does not
  provide by default (bundles 10.9.8) — worked around with an explicit
  `npm install -g npm@latest` step.

## ADR-05: Renderer does not validate

- **Status**: Accepted.
- **Context**: `ocf-validator` already owns schema and semantic validation,
  including the canonical named-position catalog.
- **Decision**: The renderer trusts its input is already valid and performs
  no validation of its own; validate-then-render is a documented usage
  convention, not an enforced runtime dependency.
- **Consequences**: Simpler renderer, no `ocf-validator` runtime dependency
  or version coupling — but undefined behavior (as opposed to a clear
  error) on invalid input, and a standing risk that the renderer's local
  `named-positions.ts` catalog silently drifts from the validator's
  canonical one (see [Risks §11](11-risks-technical-debt.md)).
