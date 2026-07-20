import * as THREE from "three";

export const CONE_SYMBOL_HEIGHT_M = 0.4;

export function buildConeSymbol(color: string): THREE.Group {
  const group = new THREE.Group();
  group.name = "cone-symbol";

  const h = CONE_SYMBOL_HEIGHT_M;
  const shape = new THREE.Shape();
  shape.moveTo(0, h * 0.5); // apex
  shape.lineTo(h * 0.4, -h * 0.5);
  shape.lineTo(-h * 0.4, -h * 0.5);
  shape.closePath();

  const fill = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.name = "cone-fill";
  group.add(fill);

  return group;
}
