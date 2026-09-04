/**
 * SVG RENDERER SPIKE — throwaway exploration, NOT production code.
 *
 * Goal: prove that (1) our existing geometry layer (coordinate transform, action
 * path resolution, after-ordering, smoothing) can drive an SVG renderer with no
 * three.js WebGL, giving crisp <text> numbers + <marker> arrowheads, and (2) the
 * play can be animated by moving tokens along their resolved paths
 * (getPointAtLength), phase by phase — the way HoopsGeek does it.
 *
 * If the spike confirms the direction, this gets rewritten properly (design +
 * plan + TDD) into a real svg-renderer module.
 */
import * as THREE from "three";
import type { OcfDocument, Action } from "../src/types/ocf";
import { entityRef } from "../src/types/ocf";
import { resolveFrameState } from "../src/parser/resolve-frame-state";
import { CoordinateTransformer } from "../src/court/coordinate-transformer";
import { resolveActionPath } from "../src/actions/resolve-action-path";
import { resolveFrameActionAnchors } from "../src/actions/frame-action-anchors";
import { smoothPath, resamplePath } from "../src/paths/smooth-path";
import { separateOverlappingSymbols } from "../src/entities/separate-overlapping";

const SVG_NS = "http://www.w3.org/2000/svg";
const SYMBOL_RADIUS = 0.5; // court units, matches OFFENSE_SYMBOL_RADIUS_M

// --- tiny SVG helpers -------------------------------------------------------
function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** World Vector3 (x, y=0, z) -> SVG coords. Court +y maps to world -z; we plot
 *  SVG y = world z so that court +y is "up" on screen after a viewBox flip. */
function toSvg(p: THREE.Vector3): { x: number; y: number } {
  return { x: p.x, y: p.z };
}

/** Build an SVG path `d` string through world points, smoothed like the WebGL
 *  renderer (reuse smoothPath + resamplePath), so the SVG curve matches. */
function pathD(points: THREE.Vector3[]): string {
  if (points.length < 2) return "";
  const curve = smoothPath(points);
  const dense = resamplePath(curve, Math.max(24, points.length * 8));
  return dense
    .map((p, i) => {
      const { x, y } = toSvg(p);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(3)} ${y.toFixed(3)}`;
    })
    .join(" ");
}

// --- court drawing (court coords; root group already flips Y) ---------------
const COURT_STROKE = "#999";
const COURT_SW = 0.06;

/** Polyline through court-space points; `closed` joins back to the first.
 *  Court y is negated to match toSvg (svg.y = world.z = -court.y), so the court
 *  and the tokens/paths share one coordinate frame under the root's flip. */
function courtPolyline(points: { x: number; y: number }[], closed: boolean): SVGPathElement {
  const d =
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(3)} ${(-p.y).toFixed(3)}`).join(" ") +
    (closed ? " Z" : "");
  return el("path", { d, fill: "none", stroke: COURT_STROKE, "stroke-width": COURT_SW });
}

/** Sample an ellipse/arc in court space -> points. */
function arcPoints(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  steps = 48,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/** One basket end: paint box, FT circle, 3-point arc, backboard tick. */
function hoopEndSvg(
  dims: { paint_width: number; paint_depth: number; basket_from_baseline: number; three_point_distance: number },
  baselineY: number,
  towardCenter: 1 | -1,
): SVGElement[] {
  const hw = dims.paint_width / 2;
  const paintFarY = baselineY + towardCenter * dims.paint_depth;
  const paint = courtPolyline(
    [
      { x: -hw, y: baselineY },
      { x: -hw, y: paintFarY },
      { x: hw, y: paintFarY },
      { x: hw, y: baselineY },
    ],
    false,
  );
  const ft = courtPolyline(arcPoints(0, paintFarY, hw, 0, Math.PI * 2), true);
  const basketY = baselineY + towardCenter * dims.basket_from_baseline;
  const a0 = towardCenter === 1 ? 0 : Math.PI;
  const arc = courtPolyline(arcPoints(0, basketY, dims.three_point_distance, a0, a0 + Math.PI), false);
  const board = courtPolyline(arcPoints(0, basketY, 0.12, 0, Math.PI * 2, 16), true);
  return [paint, ft, arc, board];
}

/** Full court markings, mirroring build-court.ts, in court coordinates. */
function buildCourtSvg(type: string, dims: any): SVGGElement {
  const g = el("g");
  g.setAttribute("id", "court");
  const isFull = type === "full_court";
  const baseline = dims.length / 2;
  const nearEdge = isFull ? -baseline : 0;

  // Boundary
  g.appendChild(
    courtPolyline(
      [
        { x: -dims.width / 2, y: nearEdge },
        { x: dims.width / 2, y: nearEdge },
        { x: dims.width / 2, y: baseline },
        { x: -dims.width / 2, y: baseline },
      ],
      true,
    ),
  );
  // Far hoop
  for (const n of hoopEndSvg(dims, baseline, -1)) g.appendChild(n);
  if (isFull) {
    for (const n of hoopEndSvg(dims, nearEdge, 1)) g.appendChild(n);
    // Halfcourt line + center circle
    g.appendChild(courtPolyline([{ x: -dims.width / 2, y: 0 }, { x: dims.width / 2, y: 0 }], false));
    g.appendChild(courtPolyline(arcPoints(0, 0, dims.center_circle_radius, 0, Math.PI * 2), true));
  }
  return g;
}

/** Wavy "dribble" path `d`: sample the smoothed curve and displace each interior
 *  point perpendicular to the local tangent by a sine wave (mirrors wavy-line.ts). */
function dribbleD(points: THREE.Vector3[]): string {
  if (points.length < 2) return "";
  const curve = smoothPath(points);
  const total = curve.getLength();
  const n = Math.max(48, Math.ceil(total * 24));
  const base = resamplePath(curve, n);
  const WAVELENGTH = 0.8;
  const AMPLITUDE = 0.16;
  const cycles = Math.max(1, Math.round(total / WAVELENGTH));
  // cumulative arc length for phase
  let acc = 0;
  const cum = [0];
  for (let i = 1; i < base.length; i++) {
    acc += base[i].distanceTo(base[i - 1]);
    cum.push(acc);
  }
  const ease = (u: number) => (u <= 0 || u >= 1 ? 0 : 0.5 - 0.5 * Math.cos(Math.PI * Math.min(u, 1 - u) / 0.18));
  const out = base.map((p, i) => {
    if (i === 0 || i === base.length - 1) return toSvg(p);
    const u = cum[i] / total;
    const prev = base[i - 1], next = base[i + 1];
    const tx = next.x - prev.x, tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    // perpendicular (in x,z)
    const nx = -tz / tl, nz = tx / tl;
    const disp = AMPLITUDE * ease(u) * Math.sin(2 * Math.PI * cycles * u);
    return { x: p.x + nx * disp, y: p.z + nz * disp };
  });
  return out.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(" ");
}

interface Fixtures {
  doc: OcfDocument;
}

/** Renders one frame of the document into the given <svg>, returning per-entity
 *  token groups so the animator can move them. */
export function renderFrame(svg: SVGSVGElement, { doc }: Fixtures, frameIndex: number): void {
  svg.textContent = "";

  const court = doc.court;
  const t = new CoordinateTransformer(court);
  const dims = t.dimensions;

  // Everything is plotted in screen space directly: screen.y = -court.y (so
  // court +y is up on screen). No root flip. Court markings occupy screen.y ∈
  // [-baseline, -nearEdge]; entities live in the same range.
  const halfW = dims.width / 2 + 1;
  const baseline = dims.length / 2;
  const nearEdge = court.type === "half_court" ? 0 : -baseline; // court-y of the near edge
  // screen.y range = [-baseline, -nearEdge]
  const yTop = -baseline - 1; // screen top (most negative)
  const yBot = -nearEdge + 1; // screen bottom
  const pad = 1;
  svg.setAttribute("viewBox", `${-halfW} ${yTop} ${halfW * 2} ${yBot - yTop}`);
  void pad;
  const root = el("g");
  svg.appendChild(root);

  // --- defs: arrowhead marker (orient=auto aligns to the path tangent) -------
  // Sized in court units via userSpaceOnUse: ~0.5 units long so it reads like a
  // coaching arrow, not the giant spike marker from before.
  const AH = 0.5; // arrowhead length in court units
  const defs = el("defs");
  const marker = el("marker", {
    id: "arrow",
    markerWidth: AH,
    markerHeight: AH,
    refX: AH * 0.9, // tip sits at the path end
    refY: AH / 2,
    orient: "auto",
    markerUnits: "userSpaceOnUse",
  });
  marker.appendChild(
    el("polygon", { points: `0,0 ${AH},${AH / 2} 0,${AH} ${AH * 0.22},${AH / 2}`, fill: "#003366" }),
  );
  defs.appendChild(marker);
  svg.appendChild(defs);

  // --- court markings (mirrors src/court/build-court.ts geometry) ------------
  root.appendChild(buildCourtSvg(court.type, dims));

  // --- resolve state + display positions (reuse the real geometry layer) -----
  const startState = resolveFrameState(doc, frameIndex, "start");
  const raw = new Map<string, THREE.Vector3>();
  for (const entity of doc.entities) {
    const ref = entityRef(entity);
    const coord = startState.positions[ref];
    if (coord) raw.set(ref, t.resolveToWorld(coord));
  }
  const displayPositions = separateOverlappingSymbols(raw, SYMBOL_RADIUS, 0.15);

  // --- action paths (reuse resolver + after-ordering) ------------------------
  const endState = resolveFrameState(doc, frameIndex, "end");
  const anchored = resolveFrameActionAnchors(
    doc.frames[frameIndex].actions ?? [],
    startState,
    endState,
    t,
    displayPositions,
  );
  const pathsG = el("g", { fill: "none" });
  const OFFENSE = "#003366";
  for (const { action, startOverride, endOverride } of anchored) {
    // Shoot: straight line from shooter to basket, ending in a perpendicular bar.
    if (action.type === "shoot") {
      const from = startOverride;
      const basket = t.resolveToWorld({ named: "basket" });
      const a = toSvg(from), b = toSvg(basket);
      pathsG.appendChild(
        el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: OFFENSE, "stroke-width": 0.16 }),
      );
      // end bar perpendicular to the shot at the basket
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len, bar = 0.45;
      pathsG.appendChild(
        el("line", {
          x1: b.x + nx * bar, y1: b.y + ny * bar, x2: b.x - nx * bar, y2: b.y - ny * bar,
          stroke: OFFENSE, "stroke-width": 0.16,
        }),
      );
      continue;
    }
    // Screen: path to the screen spot, ending in a perpendicular T-bar.
    if (action.type === "screen") {
      const pts = resolveActionPath(action as Action, startState, t, { startOverride, endOverride });
      if (!pts) continue;
      pathsG.appendChild(el("path", { d: pathD(pts), stroke: OFFENSE, "stroke-width": 0.16 }));
      const end = pts[pts.length - 1], prev = pts[pts.length - 2] ?? pts[0];
      const e = toSvg(end), p = toSvg(prev);
      const dx = e.x - p.x, dy = e.y - p.y, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len, bar = 0.5;
      pathsG.appendChild(
        el("line", {
          x1: e.x + nx * bar, y1: e.y + ny * bar, x2: e.x - nx * bar, y2: e.y - ny * bar,
          stroke: OFFENSE, "stroke-width": 0.21,
        }),
      );
      continue;
    }
    if (!["move", "cut", "dribble", "pass"].includes(action.type)) continue;
    const pts = resolveActionPath(action as Action, startState, t, { startOverride, endOverride });
    if (!pts) continue;
    const isPass = action.type === "pass";
    const isDribble = action.type === "dribble";
    const line = el("path", {
      d: isDribble ? dribbleD(pts) : pathD(pts),
      stroke: OFFENSE,
      "stroke-width": 0.16,
      "stroke-linecap": "round",
      "marker-end": "url(#arrow)",
      ...(isPass ? { "stroke-dasharray": "0.35 0.28" } : {}),
    });
    line.dataset.player = action.player;
    pathsG.appendChild(line);
  }
  root.appendChild(pathsG);

  // --- entity tokens (crisp <text> numbers) ----------------------------------
  const tokensG = el("g");
  tokensG.setAttribute("id", "tokens");
  for (const entity of doc.entities) {
    const ref = entityRef(entity);
    const pos = displayPositions.get(ref);
    if (!pos) continue;
    const { x, y } = toSvg(pos);
    const g = el("g", { transform: `translate(${x} ${y})` });
    g.dataset.ref = ref;

    const isDefense = entity.type === "defense";

    // Defender arms: two forward-spread strokes forming a V (mirrors
    // defense-symbol.ts). At rotation 0 the V opens toward -y (world -z); the
    // entity's `rotation` (deg, clockwise) yaws the whole token.
    if (isDefense) {
      const rot = (entity as { rotation?: number }).rotation ?? 0;
      // rotate the arms group; in flipped svg space a clockwise court rotation
      // is a rotate() about the token origin.
      const arms = el("g", { transform: `rotate(${rot})` });
      const R = 0.32; // body radius
      const reach = 0.46, spread = 0.42;
      // Arms open toward the basket: court +y (up) == screen -y. Shoulders sit
      // slightly toward the basket side too.
      const shoulderY = -R * 0.3, handY = -reach;
      for (const sx of [-1, 1]) {
        arms.appendChild(
          el("line", {
            x1: sx * R * 0.35, y1: shoulderY, x2: sx * spread, y2: handY,
            stroke: "#58001d", "stroke-width": 0.11, "stroke-linecap": "round",
          }),
        );
      }
      g.appendChild(arms);
    }

    g.appendChild(
      el("circle", {
        r: isDefense ? 0.32 : SYMBOL_RADIUS,
        fill: isDefense ? "#58001d" : "#003366",
        stroke: "#fff",
        "stroke-width": 0.06,
      }),
    );
    const label = (entity as { label?: string; nr?: number }).label ?? (entity as { nr?: number }).nr;
    if (label !== undefined) {
      // Number lives in a nested SVG with its own viewBox (HoopsGeek trick) so it
      // stays crisp and centred, independent of the token's court-unit scale.
      const inner = el("svg", {
        x: -SYMBOL_RADIUS,
        y: -SYMBOL_RADIUS,
        width: SYMBOL_RADIUS * 2,
        height: SYMBOL_RADIUS * 2,
        viewBox: "-100 -100 200 200",
      });
      const text = el("text", {
        "text-anchor": "middle",
        "dominant-baseline": "central",
        fill: "#fff",
        "font-family": "Roboto, system-ui, sans-serif",
        "font-weight": "700",
        "font-size": "120",
        x: 0,
        y: 0,
      });
      text.textContent = String(label);
      inner.appendChild(text);
      g.appendChild(inner);
    }
    tokensG.appendChild(g);
  }
  root.appendChild(tokensG);

  // --- ball(s): a small dot offset just in front of the carrier --------------
  const ballsG = el("g");
  ballsG.setAttribute("id", "balls");
  for (const [ballId, ballState] of Object.entries(startState.balls)) {
    if ("dead" in ballState) continue;
    let pos: { x: number; y: number } | null = null;
    if ("carried_by" in ballState) {
      const carrier = displayPositions.get((ballState as { carried_by: string }).carried_by);
      if (carrier) {
        const c = toSvg(carrier);
        pos = { x: c.x, y: c.y - 0.4 }; // slight offset toward the basket (screen -y = court +y)
      }
    } else if ("at" in ballState) {
      pos = toSvg(t.resolveToWorld((ballState as { at: THREE.Vector3 }).at as never));
    }
    if (pos) {
      // Wrap in a translate-group with a stable id so the animator can move it
      // along the ball's implied path (dribble/pass/shoot) like a player token.
      const bg = el("g", { transform: `translate(${pos.x} ${pos.y})` });
      bg.dataset.ball = ballId;
      bg.appendChild(el("circle", { r: 0.15, fill: "#ffcc00", stroke: "#8a6d00", "stroke-width": 0.04 }));
      ballsG.appendChild(bg);
    }
  }
  root.appendChild(ballsG);
}

// --- animation: move each token along its path, phase by phase ---------------
export interface AnimateOptions {
  msPerFrame?: number;
}

/** Plays the whole document: for each frame, tokens with a movement action glide
 *  along their resolved SVG path via getPointAtLength; others hold position.
 *  This mirrors HoopsGeek's phase-by-phase path-following animation. */
export async function playAnimation(
  svg: SVGSVGElement,
  fixtures: Fixtures,
  opts: AnimateOptions = {},
): Promise<void> {
  const { doc } = fixtures;
  const msPerFrame = opts.msPerFrame ?? 1400;
  const t = new CoordinateTransformer(doc.court);

  for (let f = 0; f < doc.frames.length; f++) {
    renderFrame(svg, fixtures, f);
    const startState = resolveFrameState(doc, f, "start");
    const endState = resolveFrameState(doc, f, "end");
    const displayPositions = (() => {
      const raw = new Map<string, THREE.Vector3>();
      for (const e of doc.entities) {
        const ref = entityRef(e);
        const c = startState.positions[ref];
        if (c) raw.set(ref, t.resolveToWorld(c));
      }
      return separateOverlappingSymbols(raw, SYMBOL_RADIUS, 0.15);
    })();
    const anchored = resolveFrameActionAnchors(
      doc.frames[f].actions ?? [],
      startState,
      endState,
      t,
      displayPositions,
    );

    // Build a per-player animation path. A player may have SEVERAL movement
    // actions in one frame (e.g. dribble then cut) — chain them into ONE
    // continuous path in after-order, so the token glides through every waypoint
    // to its true frame-end position instead of jumping to the last action's start.
    const tokensG = svg.querySelector("#tokens")!;
    const ballsG = svg.querySelector("#balls")!;
    const perPlayer = new Map<string, THREE.Vector3[]>();
    for (const { action, startOverride, endOverride } of anchored) {
      if (!["move", "cut", "dribble"].includes(action.type)) continue;
      const pts = resolveActionPath(action as Action, startState, t, { startOverride, endOverride });
      if (!pts || pts.length < 2) continue;
      const existing = perPlayer.get(action.player);
      if (existing) {
        // Append, skipping the duplicated join point (prev end == this start).
        existing.push(...pts.slice(1));
      } else {
        perPlayer.set(action.player, [...pts]);
      }
    }
    const movers: { g: SVGGElement; d: string }[] = [];
    for (const [player, pts] of perPlayer) {
      const g = tokensG.querySelector(`g[data-ref="${player}"]`) as SVGGElement | null;
      if (g) movers.push({ g, d: pathD(pts) });
    }

    // Ball follows its implied path this frame (possession relay, no spec change):
    //  - dribble  -> the dribbler's path (ball stays with the player)
    //  - pass     -> straight line from passer to the receiver's catch point
    //  - shoot    -> straight line from shooter to the basket
    // We take the FIRST such action per ball in after-order.
    const ballG = ballsG.querySelector("g[data-ball]") as SVGGElement | null;
    if (ballG) {
      const ballD = ballPathForFrame(anchored, startState, t);
      if (ballD) movers.push({ g: ballG, d: ballD });
    }

    // Animate all movers together over msPerFrame using a hidden path + getPointAtLength.
    await animateAlong(svg, movers, msPerFrame);
  }
}

/** The ball's implied path for a frame, in SVG `d`, derived from ALL possession
 *  actions in after-order (dribble → pass → shoot), chained into one continuous
 *  ball trajectory. Returns null if the ball is idle this frame. */
function ballPathForFrame(
  anchored: { action: Action; startOverride: THREE.Vector3; endOverride?: THREE.Vector3 }[],
  startState: ReturnType<typeof resolveFrameState>,
  t: CoordinateTransformer,
): string | null {
  const segments: { x: number; y: number }[][] = [];
  for (const { action, startOverride, endOverride } of anchored) {
    if (action.type === "dribble") {
      const pts = resolveActionPath(action as Action, startState, t, { startOverride, endOverride });
      if (pts) segments.push(pts.map(toSvg));
    } else if (action.type === "pass") {
      segments.push([toSvg(startOverride), toSvg(endOverride ?? startOverride)]);
    } else if (action.type === "shoot") {
      segments.push([toSvg(startOverride), toSvg(t.resolveToWorld({ named: "basket" }))]);
    }
  }
  if (segments.length === 0) return null;
  // Concatenate, dropping duplicated join points.
  const flat: { x: number; y: number }[] = [];
  for (const seg of segments) {
    for (const p of seg) {
      const last = flat[flat.length - 1];
      if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) continue;
      flat.push(p);
    }
  }
  return flat.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(" ");
}

function animateAlong(
  svg: SVGSVGElement,
  movers: { g: SVGGElement; d: string }[],
  duration: number,
): Promise<void> {
  if (movers.length === 0) {
    return new Promise((r) => setTimeout(r, duration * 0.4));
  }
  // Create hidden measuring paths in the SVG so getPointAtLength works.
  const measured = movers.map(({ g, d }) => {
    const p = el("path", { d, visibility: "hidden" });
    svg.appendChild(p);
    return { g, p, len: p.getTotalLength() };
  });

  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      const tt = Math.min(1, (now - start) / duration);
      const ease = tt < 0.5 ? 2 * tt * tt : 1 - Math.pow(-2 * tt + 2, 2) / 2; // easeInOutQuad
      for (const { g, p, len } of measured) {
        const pt = p.getPointAtLength(ease * len);
        g.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
      }
      if (tt < 1) {
        requestAnimationFrame(step);
      } else {
        for (const { p } of measured) p.remove();
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}
