import * as THREE from "three";
import { buildThickLine } from "../actions/thick-line";

export const DEFENSE_SYMBOL_HEIGHT_M = 0.46; // overall footprint incl. arms, ~23px at reference camera

const BODY_RADIUS_M = 0.32; // the defender's body/torso disc
const ARM_REACH_M = 0.46; // how far the arms spread forward
const ARM_SPREAD_M = 0.42; // half-distance between the two hands (V opening width)
const ARM_WIDTH_M = 0.11; // thick arm strokes so they read clearly

/** Defender glyph: a filled body disc with two arms spread *forward* in a shallow
 *  V — a defensive stance. At rotation 0 the arms open toward -y (world -Z), the
 *  direction the defender faces; the whole group yaws about Y to face any way.
 *  Body + arm children are named "defense-body"/"defense-arms" so callers
 *  (shoot-glyph, tests) that reuse this glyph keep working. */
export function buildDefenseSymbol(color: string): THREE.Group {
  const group = new THREE.Group();
  group.name = "defense-symbol";

  // Body: a flat disc in the court plane, like the offense circle but distinct.
  const body = new THREE.Mesh(
    new THREE.CircleGeometry(BODY_RADIUS_M, 32),
    new THREE.MeshBasicMaterial({ color }),
  );
  body.rotation.x = -Math.PI / 2; // lie flat in XZ, facing the top-down camera
  body.name = "defense-body";
  group.add(body);

  // Arms: two thick strokes from the shoulders out to the hands, forming a V
  // that opens forward (toward -Z at rotation 0). Shoulders sit at the front
  // edge of the body; hands reach out and to the sides.
  const shoulderZ = -BODY_RADIUS_M * 0.3;
  const handZ = -ARM_REACH_M;
  const y = 0.01; // hover just above the body fill so arms stay visible
  const leftArm = buildThickLine(
    [
      new THREE.Vector3(-BODY_RADIUS_M * 0.35, y, shoulderZ),
      new THREE.Vector3(-ARM_SPREAD_M, y, handZ),
    ],
    color,
    ARM_WIDTH_M,
  );
  const rightArm = buildThickLine(
    [
      new THREE.Vector3(BODY_RADIUS_M * 0.35, y, shoulderZ),
      new THREE.Vector3(ARM_SPREAD_M, y, handZ),
    ],
    color,
    ARM_WIDTH_M,
  );
  const arms = new THREE.Group();
  arms.name = "defense-arms";
  arms.add(leftArm, rightArm);
  group.add(arms);

  return group;
}

/** rotation: degrees, 0 = arms toward -y (world -Z), clockwise (spec PR #5 convention). */
export function applyDefenseRotation(group: THREE.Object3D, rotationDeg: number): void {
  group.rotation.y = THREE.MathUtils.degToRad(rotationDeg);
}
