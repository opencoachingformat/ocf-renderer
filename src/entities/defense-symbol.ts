import * as THREE from "three";

export const DEFENSE_SYMBOL_HEIGHT_M = 0.46; // ~23px at reference camera, see Task 13

/** Simple "arms out" glyph: a body wedge plus two arm strokes, built pointing
 *  toward -y at rotation 0, matching the spec's rotation convention. */
export function buildDefenseSymbol(color: string): THREE.Group {
  const group = new THREE.Group();
  group.name = "defense-symbol";

  const h = DEFENSE_SYMBOL_HEIGHT_M;
  const w = h * (51 / 23); // preserve the spec's icon aspect ratio, no distortion

  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(0, h * 0.5);
  bodyShape.lineTo(w * 0.5, -h * 0.5);
  bodyShape.lineTo(-w * 0.5, -h * 0.5);
  bodyShape.closePath();
  const body = new THREE.Mesh(
    new THREE.ShapeGeometry(bodyShape),
    new THREE.MeshBasicMaterial({ color }),
  );
  body.rotation.x = -Math.PI / 2;
  body.name = "defense-body";
  group.add(body);

  const armGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-w * 0.5, 0, -h * 0.1),
    new THREE.Vector3(w * 0.5, 0, -h * 0.1),
  ]);
  const arms = new THREE.Line(armGeom, new THREE.LineBasicMaterial({ color }));
  arms.name = "defense-arms";
  group.add(arms);

  return group;
}

/** rotation: degrees, 0 = arms toward -y, clockwise (spec PR #5 convention). */
export function applyDefenseRotation(group: THREE.Object3D, rotationDeg: number): void {
  group.rotation.y = THREE.MathUtils.degToRad(rotationDeg);
}
