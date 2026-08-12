import * as THREE from "three";

export const BALL_SYMBOL_RADIUS_M = 0.15;

export function buildBallSymbol(color: string): THREE.Group {
  const group = new THREE.Group();
  group.name = "ball-symbol";

  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_SYMBOL_RADIUS_M, 24),
    new THREE.MeshBasicMaterial({ color }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.01; // sits above entity symbols so it never z-fights
  fill.name = "ball-fill";
  group.add(fill);

  return group;
}
