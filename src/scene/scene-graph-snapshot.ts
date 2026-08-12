import * as THREE from "three";

export function summarizeScene(obj: THREE.Object3D): unknown {
  return {
    name: obj.name || obj.type,
    type: obj.type,
    position: [round(obj.position.x), round(obj.position.y), round(obj.position.z)],
    rotationY: round(obj.rotation.y),
    children: obj.children.map(summarizeScene),
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
