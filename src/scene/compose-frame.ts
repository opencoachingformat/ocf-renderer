import * as THREE from "three";
import type { OcfDocument } from "../types/ocf";
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
  const symbolsByRef = new Map<string, THREE.Object3D>();

  for (const entityState of startState.entities) {
    const entityDef = doc.entities.find((e) => e.id === entityState.entity_ref);
    if (!entityDef) continue;
    const worldPos = transformer.resolveToWorld(entityState.position);

    let symbol: THREE.Group;
    let radius = OFFENSE_SYMBOL_RADIUS_M;
    switch (entityDef.type) {
      case "offense":
        symbol = buildOffenseSymbol(colors.offense, entityDef.number);
        break;
      case "defense":
        symbol = buildDefenseSymbol(colors.defense);
        applyDefenseRotation(symbol, entityState.rotation ?? 0);
        radius = DEFENSE_SYMBOL_HEIGHT_M / 2;
        break;
      case "coach":
        symbol = buildCoachSymbol(colors.offense);
        break;
      case "cone":
        symbol = buildConeSymbol(colors.court_accent);
        break;
    }
    symbol.position.copy(worldPos);
    entityGroup.add(symbol);
    symbolsByRef.set(entityDef.id, symbol);
    obstacles.push({ center: worldPos, radius });
  }

  const ballState = startState.ball;
  if (ballState) {
    const ballGroup = new THREE.Group();
    ballGroup.name = "ball";
    if (ballState.status === "carried") {
      const carrierState = startState.entities.find((e) => e.entity_ref === ballState.carried_by);
      const carrierEntity = doc.entities.find((e) => e.id === carrierState?.entity_ref);
      const carrierWorldPos = carrierState ? transformer.resolveToWorld(carrierState.position) : new THREE.Vector3();
      // v1 simplification: always offset "forward" toward -Z (frontcourt), regardless
      // of the carrier's actual action heading. The design doc's fuller rule ("forward
      // = direction of the ball action") is deferred past v1 — see RESUME.md.
      const forward = new THREE.Vector3(0, 0, -1);
      const isLeftHanded = carrierEntity?.tags?.includes("left_handed") ?? false;
      const ball = buildBallSymbol(colors.ball);
      ball.position.copy(carriedBallOffset(carrierWorldPos, forward, isLeftHanded));
      ballGroup.add(ball);
    } else {
      const ball = buildBallSymbol(colors.ball);
      ball.position.copy(transformer.resolveToWorld(ballState.position));
      ballGroup.add(ball);
    }
    scene.add(ballGroup);
  }

  const actionGroup = new THREE.Group();
  actionGroup.name = "actions";
  scene.add(actionGroup);

  for (const action of doc.frames[frameIndex].actions ?? []) {
    if (action.type === "shoot") {
      const shooterPos = entityWorldPos(startState, action.entity_ref, transformer);
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
    } else if (action.type === "pass" || action.type === "hand_off") {
      const { points, endTangent } = trimPathEnd(adjusted, OFFENSE_SYMBOL_RADIUS_M + 0.1);
      actionGroup.add(buildDashedLine(points, colors.offense));
      actionGroup.add(buildArrowhead(points[points.length - 1], endTangent, colors.offense));
    } else if (action.type === "screen") {
      actionGroup.add(buildScreenLine(adjusted, colors.offense));
    }
  }

  return scene;
}
