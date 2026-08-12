import * as THREE from "three";

export const BALL_CARRY_FORWARD_OFFSET_M = 0.35;
export const BALL_CARRY_SIDE_OFFSET_M = 0.25;

/**
 * Computes the carried-ball world position given the carrier's position,
 * the forward direction (unit vector, direction of the ball-relevant action —
 * e.g. the dribble/move heading, or the facing direction if the entity is
 * stationary), and the carrier's handedness tag.
 */
export function carriedBallOffset(
  carrierWorldPos: THREE.Vector3,
  forward: THREE.Vector3,
  isLeftHanded: boolean,
): THREE.Vector3 {
  const raw = forward.clone().setY(0);
  // Guard: a zero-length forward must not silently NaN through normalize().
  const fwd = raw.lengthSq() < 1e-10 ? new THREE.Vector3(0, 0, -1) : raw.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
  const sideSign = isLeftHanded ? -1 : 1;

  return carrierWorldPos
    .clone()
    .addScaledVector(fwd, BALL_CARRY_FORWARD_OFFSET_M)
    .addScaledVector(side, sideSign * BALL_CARRY_SIDE_OFFSET_M);
}
