import * as THREE from "three";

export interface Obstacle {
  center: THREE.Vector3;
  radius: number;
}

/** Pushes any sampled point that falls inside an obstacle radius straight out
 *  to the radius boundary (plus a small margin). Does not move path endpoints
 *  (start/end anchors are assumed to be entity centers on purpose — e.g. a
 *  pass starts at the passer — collision-avoidance skips index 0 and the last
 *  index). */
export function avoidCollisions(
  points: THREE.Vector3[],
  obstacles: Obstacle[],
  margin = 0.1,
): THREE.Vector3[] {
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p;
    let adjusted = p;
    for (const obstacle of obstacles) {
      const delta = new THREE.Vector3().subVectors(adjusted, obstacle.center);
      delta.y = 0;
      const dist = delta.length();
      const minDist = obstacle.radius + margin;
      if (dist < minDist && dist > 1e-6) {
        adjusted = obstacle.center.clone().addScaledVector(delta.normalize(), minDist).setY(p.y);
      } else if (dist <= 1e-6) {
        // point exactly on an obstacle center: nudge along +x deterministically
        adjusted = obstacle.center.clone().add(new THREE.Vector3(minDist, 0, 0)).setY(p.y);
      }
    }
    return adjusted;
  });
}
