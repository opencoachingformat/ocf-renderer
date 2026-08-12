import * as THREE from "three";

/** Normalized direction from `from` toward `to`, flattened to the XZ plane (y=0). */
export function tangentBetween(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3().subVectors(to, from).setY(0).normalize();
}

/** The perpendicular (in the XZ plane) to a given tangent vector. */
export function perpendicularOf(tangent: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(-tangent.z, 0, tangent.x);
}
