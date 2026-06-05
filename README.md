# OCF Renderer

Reference renderer for the [Open Coaching Format](https://github.com/opencoachingformat/spec) —
turns an OCF document into a drawn basketball diagram (SVG).

Companion to the [spec](https://github.com/opencoachingformat/spec) and the
[validator](https://github.com/opencoachingformat/ocf-validator). The renderer is
the visual foundation the future editor builds on.

## Status

🚧 In development. **v1 goal:** render a single frame as a still SVG
(court + entities + action arrows derived from the frame's semantic actions).

See the [design doc](docs/superpowers/specs/2026-06-06-ocf-renderer-design.md) for
the full visual language and rendering architecture.

## Planned

- TypeScript → SVG, usable in the browser and server-side.
- Court styles (default "Soft / Modern"), per-ruleset court geometry (FIBA first).
- Entity symbols: offense (filled circle), defense (FIBA "arms" glyph, directional
  via `rotation`), ball, coach, cone.
- Action notation derived from semantic actions: move/cut (solid), dribble (wave),
  pass (dashed), screen (end bar), shoot (glyph at the shooter).
- Path geometry: smoothing through `moves` anchors, arc-length resampling,
  tangent-aware markers, and collision avoidance (paths never drawn through a symbol).

## Roadmap (post-v1)

- Multi-frame composite ("playbook" image with step numbers).
- Animation / frame playback.
- Shot-type glyph differentiation (`variant`/`tags`).
- NBA / NCAA / NFHS court geometry.

## License

[CC BY 4.0](LICENSE) — same as the OCF spec.
