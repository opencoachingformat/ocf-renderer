import * as THREE from "three";

export const OFFENSE_SYMBOL_RADIUS_M = 0.5;

function numberSprite(label: string | number | undefined): THREE.Sprite | null {
  if (label === undefined) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(label), 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(0.6, 0.6, 1);
  sprite.position.y = 0.01;
  sprite.name = "jersey-number";
  return sprite;
}

export function buildOffenseSymbol(color: string, label?: string | number): THREE.Group {
  const group = new THREE.Group();
  group.name = "offense-symbol";

  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(OFFENSE_SYMBOL_RADIUS_M, 32),
    new THREE.MeshBasicMaterial({ color }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.name = "offense-fill";
  group.add(fill);

  const ring = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      new THREE.EllipseCurve(0, 0, OFFENSE_SYMBOL_RADIUS_M, OFFENSE_SYMBOL_RADIUS_M).getPoints(32),
    ),
    new THREE.LineBasicMaterial({ color: "#ffffff" }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  ring.name = "offense-ring";
  group.add(ring);

  const sprite = numberSprite(label);
  if (sprite) group.add(sprite);

  return group;
}
