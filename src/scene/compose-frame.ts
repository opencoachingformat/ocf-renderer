import * as THREE from "three";
import type { OcfDocument } from "../types/ocf";
import { entityRef } from "../types/ocf";
import { resolveFrameState } from "../parser/resolve-frame-state";
import { CoordinateTransformer, resolveCourtDimensions } from "../court/coordinate-transformer";
import { buildCourt } from "../court/build-court";
import { resolveColorScheme, roleFill } from "../style/color-scheme";
import { buildOffenseSymbol, OFFENSE_SYMBOL_RADIUS_M } from "../entities/offense-symbol";
import { buildDefenseSymbol, applyDefenseRotation, DEFENSE_SYMBOL_HEIGHT_M } from "../entities/defense-symbol";
import { buildBallSymbol } from "../entities/ball-symbol";
import { buildCoachSymbol } from "../entities/coach-symbol";
import { buildConeSymbol } from "../entities/cone-symbol";
import { carriedBallOffset } from "../entities/ball-offset";
import { resolveActionPath } from "../actions/resolve-action-path";
import { resolveFrameActionAnchors } from "../actions/frame-action-anchors";
import { separateOverlappingSymbols } from "../entities/separate-overlapping";
import { smoothPath, resamplePath } from "../paths/smooth-path";
import { avoidCollisions, type Obstacle } from "../paths/avoid-collisions";
import { trimPathEnd, buildArrowhead, ARROWHEAD_LENGTH_M } from "../actions/arrowhead";
import { buildThickLine } from "../actions/thick-line";
import { buildWavyLine } from "../actions/wavy-line";
import { buildDashedLine } from "../actions/dashed-line";
import { buildScreenLine } from "../actions/screen-line";
import { buildShootGlyph } from "../actions/shoot-glyph";

export interface ComposeOptions {
  colorSchemeOverride?: OcfDocument["color_scheme"];
}

export function composeFrame(
  doc: OcfDocument,
  frameIndex: number,
  options: ComposeOptions = {},
): THREE.Scene {
  const scene = new THREE.Scene();
  const dims = resolveCourtDimensions(doc.court);
  const transformer = new CoordinateTransformer(doc.court);
  const colors = resolveColorScheme(doc.color_scheme, options.colorSchemeOverride);

  scene.add(buildCourt(doc.court, dims, colors));

  const startState = resolveFrameState(doc, frameIndex, "start");
  const entityGroup = new THREE.Group();
  entityGroup.name = "entities";
  scene.add(entityGroup);

  const obstacles: Obstacle[] = [];

  // Nudge near-coincident symbols apart for display only (data unchanged). Both
  // the symbols and the action paths below anchor on these display positions.
  const SYMBOL_SEPARATION_MARGIN = 0.15;
  const rawPositions = new Map<string, THREE.Vector3>();
  for (const entity of doc.entities) {
    const ref = entityRef(entity);
    const coord = startState.positions[ref];
    if (coord) rawPositions.set(ref, transformer.resolveToWorld(coord));
  }
  const displayPositions = separateOverlappingSymbols(
    rawPositions,
    OFFENSE_SYMBOL_RADIUS_M,
    SYMBOL_SEPARATION_MARGIN,
  );

  for (const entity of doc.entities) {
    const ref = entityRef(entity);
    const worldPos = displayPositions.get(ref);
    if (!worldPos) continue;

    let symbol: THREE.Group;
    let radius = OFFENSE_SYMBOL_RADIUS_M;
    switch (entity.type) {
      case "offense":
        symbol = buildOffenseSymbol(roleFill(colors, entity.color ?? "offense"), entity.label ?? entity.nr);
        break;
      case "defense":
        symbol = buildDefenseSymbol(roleFill(colors, entity.color ?? "defense"));
        applyDefenseRotation(symbol, entity.rotation ?? 0);
        radius = DEFENSE_SYMBOL_HEIGHT_M / 2;
        break;
      case "coach":
        symbol = buildCoachSymbol(colors.offense_fill);
        break;
      case "cone":
        symbol = buildConeSymbol(colors.grey);
        break;
      case "station":
        continue; // acknowledged, not built — no station glyph yet
    }
    symbol.position.copy(worldPos);
    entityGroup.add(symbol);
    obstacles.push({ center: worldPos, radius });
  }

  const ballGroup = new THREE.Group();
  ballGroup.name = "balls";
  scene.add(ballGroup);
  for (const [ballId, ballState] of Object.entries(startState.balls)) {
    if ("dead" in ballState) continue; // dead balls are not drawn
    const ball = buildBallSymbol(colors.yellow);
    ball.name = ballId;
    if ("carried_by" in ballState) {
      // Follow the carrier's DISPLAY position so the ball stays on the (possibly
      // nudged) symbol rather than the raw data position.
      const carrierWorldPos = displayPositions.get(ballState.carried_by) ?? new THREE.Vector3();
      // v1 simplification: always offset "forward" toward -Z (frontcourt); schema
      // entities carry no handedness data, so the offset is always right-handed.
      // TODO(post-v1): Wire handedness through when schema adds left_handed/right_handed tags.
      const forward = new THREE.Vector3(0, 0, -1);
      ball.position.copy(carriedBallOffset(carrierWorldPos, forward, false));
    } else {
      ball.position.copy(transformer.resolveToWorld(ballState.at));
    }
    ballGroup.add(ball);
  }

  const actionGroup = new THREE.Group();
  actionGroup.name = "actions";
  scene.add(actionGroup);

  // Resolve where each action starts/ends by walking the frame's actions in
  // `after` order (the possession relay): an action begins where the player's
  // previous action ended, and a pass lands where the receiver catches it.
  // Display positions keep paths anchored on the (nudged) symbols.
  const endState = resolveFrameState(doc, frameIndex, "end");
  const anchored = resolveFrameActionAnchors(
    doc.frames[frameIndex].actions ?? [],
    startState,
    endState,
    transformer,
    displayPositions,
  );

  for (const { action, startOverride, endOverride, conflict } of anchored) {
    if (action.type === "defend" || action.type === "rebound" || action.type === "pickup") continue;

    // A broken/cyclic `after` chain is drawn red so the author sees the problem.
    const actionColor = conflict ? colors.red : colors.offense_fill;

    if (action.type === "shoot") {
      const shooterPos = startOverride;
      const basketPos = transformer.resolveToWorld({ named: "basket" });
      actionGroup.add(buildShootGlyph(shooterPos, basketPos, actionColor));
      continue;
    }

    const rawPath = resolveActionPath(action, startState, transformer, { startOverride, endOverride });
    if (!rawPath) continue;

    const curve = smoothPath(rawPath);
    const resampled = resamplePath(curve, Math.max(16, rawPath.length * 8));
    const targetObstacles = obstacles.filter((o) => !rawPath[0].equals(o.center));
    const adjusted = avoidCollisions(resampled, targetObstacles);

    if (action.type === "move" || action.type === "cut") {
      const { points, endTangent } = trimPathEnd(adjusted, OFFENSE_SYMBOL_RADIUS_M + ARROWHEAD_LENGTH_M);
      const curve2 = smoothPath(points);
      const line = buildThickLine(resamplePath(curve2, points.length), actionColor);
      line.name = "move-path";
      actionGroup.add(line);
      actionGroup.add(buildArrowhead(points[points.length - 1], endTangent, actionColor));
    } else if (action.type === "dribble") {
      actionGroup.add(buildWavyLine(adjusted, actionColor));
    } else if (action.type === "pass") {
      const { points, endTangent } = trimPathEnd(adjusted, OFFENSE_SYMBOL_RADIUS_M + ARROWHEAD_LENGTH_M);
      actionGroup.add(buildDashedLine(points, actionColor));
      actionGroup.add(buildArrowhead(points[points.length - 1], endTangent, actionColor));
    } else if (action.type === "screen") {
      actionGroup.add(buildScreenLine(adjusted, actionColor));
    }
  }

  return scene;
}
