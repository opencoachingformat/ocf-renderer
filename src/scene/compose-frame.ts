import * as THREE from "three";
import type { OcfDocument } from "../types/ocf";
import { entityRef } from "../types/ocf";
import { resolveFrameState } from "../parser/resolve-frame-state";
import { CoordinateTransformer, resolveCourtDimensions } from "../court/coordinate-transformer";
import { buildCourt } from "../court/build-court";
import { resolveColorScheme } from "../style/color-scheme";
import { buildOffenseSymbol, OFFENSE_SYMBOL_RADIUS_M } from "../entities/offense-symbol";
import { buildDefenseSymbol, applyDefenseRotation, DEFENSE_SYMBOL_HEIGHT_M } from "../entities/defense-symbol";
import { buildBallSymbol } from "../entities/ball-symbol";
import { buildCoachSymbol } from "../entities/coach-symbol";
import { buildConeSymbol } from "../entities/cone-symbol";
import { carriedBallOffset } from "../entities/ball-offset";
import { resolveActionPath, entityWorldPos } from "../actions/resolve-action-path";
import { smoothPath, resamplePath } from "../paths/smooth-path";
import { avoidCollisions, type Obstacle } from "../paths/avoid-collisions";
import { trimPathEnd, buildArrowhead } from "../actions/arrowhead";
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

  for (const entity of doc.entities) {
    const ref = entityRef(entity);
    const coord = startState.positions[ref];
    if (!coord) continue;
    const worldPos = transformer.resolveToWorld(coord);

    let symbol: THREE.Group;
    let radius = OFFENSE_SYMBOL_RADIUS_M;
    switch (entity.type) {
      case "offense":
        symbol = buildOffenseSymbol(colors.offense, entity.label ?? entity.nr);
        break;
      case "defense":
        symbol = buildDefenseSymbol(colors.defense);
        applyDefenseRotation(symbol, entity.rotation ?? 0);
        radius = DEFENSE_SYMBOL_HEIGHT_M / 2;
        break;
      case "coach":
        symbol = buildCoachSymbol(colors.offense);
        break;
      case "cone":
        symbol = buildConeSymbol(colors.court_accent);
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
    const ball = buildBallSymbol(colors.ball);
    ball.name = ballId;
    if ("carried_by" in ballState) {
      const carrierCoord = startState.positions[ballState.carried_by];
      const carrierWorldPos = carrierCoord ? transformer.resolveToWorld(carrierCoord) : new THREE.Vector3();
      // v1 simplification: always offset "forward" toward -Z (frontcourt); schema
      // entities carry no handedness data, so the offset is always right-handed.
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

  for (const action of doc.frames[frameIndex].actions ?? []) {
    if (action.type === "defend" || action.type === "rebound" || action.type === "pickup") continue;

    if (action.type === "shoot") {
      const shooterPos = entityWorldPos(startState, action.player, transformer);
      const basketPos = transformer.resolveToWorld({ named: "basket" });
      actionGroup.add(buildShootGlyph(shooterPos, basketPos, colors.offense));
      continue;
    }

    const rawPath = resolveActionPath(action, startState, transformer);
    if (!rawPath) continue;

    const curve = smoothPath(rawPath);
    const resampled = resamplePath(curve, Math.max(16, rawPath.length * 8));
    const targetObstacles = obstacles.filter((o) => !rawPath[0].equals(o.center));
    const adjusted = avoidCollisions(resampled, targetObstacles);

    if (action.type === "move" || action.type === "cut") {
      const { points, endTangent } = trimPathEnd(adjusted, OFFENSE_SYMBOL_RADIUS_M + 0.1);
      const curve2 = smoothPath(points);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(resamplePath(curve2, points.length)),
        new THREE.LineBasicMaterial({ color: colors.offense }),
      );
      line.name = "move-path";
      actionGroup.add(line);
      actionGroup.add(buildArrowhead(points[points.length - 1], endTangent, colors.offense));
    } else if (action.type === "dribble") {
      actionGroup.add(buildWavyLine(adjusted));
    } else if (action.type === "pass") {
      const { points, endTangent } = trimPathEnd(adjusted, OFFENSE_SYMBOL_RADIUS_M + 0.1);
      actionGroup.add(buildDashedLine(points, colors.offense));
      actionGroup.add(buildArrowhead(points[points.length - 1], endTangent, colors.offense));
    } else if (action.type === "screen") {
      actionGroup.add(buildScreenLine(adjusted, colors.offense));
    }
  }

  return scene;
}
