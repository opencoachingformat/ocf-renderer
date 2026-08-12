import * as THREE from "three";
import { buildDefenseSymbol, applyDefenseRotation } from "../entities/defense-symbol";
import { tangentBetween } from "../paths/tangent";

/** Orients the shoot glyph so it faces from `shooterPos` toward `basketPos`,
 *  reusing the same rotation convention as defender orientation
 *  (0 = arms toward -y, clockwise). */
export function buildShootGlyph(
  shooterPos: THREE.Vector3,
  basketPos: THREE.Vector3,
  color: string,
): THREE.Group {
  const toBasket = tangentBetween(shooterPos, basketPos);
  // rotation 0 faces -z (court -y); angle is measured clockwise from that heading
  const angleRad = Math.atan2(toBasket.x, -toBasket.z);
  const glyph = buildDefenseSymbol(color);
  glyph.name = "shoot-glyph";
  applyDefenseRotation(glyph, THREE.MathUtils.radToDeg(angleRad));
  glyph.position.copy(shooterPos);
  return glyph;
}
