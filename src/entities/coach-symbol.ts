import * as THREE from "three";

export const COACH_SYMBOL_RADIUS_M = 0.5;

function labelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(0.6, 0.6, 1);
  sprite.position.y = 0.01;
  sprite.name = "coach-label";
  return sprite;
}

export function buildCoachSymbol(color: string): THREE.Group {
  const group = new THREE.Group();
  group.name = "coach-symbol";

  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(COACH_SYMBOL_RADIUS_M, 32),
    new THREE.MeshBasicMaterial({ color }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.name = "coach-fill";
  group.add(fill);

  group.add(labelSprite("C"));

  return group;
}
