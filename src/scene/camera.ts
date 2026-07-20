import * as THREE from "three";
import type { CourtDimensions } from "../court/fiba-constants";
import type { CourtType } from "../types/ocf";

const MARGIN_M = 1.5;

export function buildCamera(
  dims: CourtDimensions,
  courtType: CourtType,
  aspect: number,
): THREE.OrthographicCamera {
  const courtLength = courtType === "full_court" ? dims.length : dims.length / 2;
  const halfWidth = dims.width / 2 + MARGIN_M;
  const halfLength = courtLength / 2 + MARGIN_M;

  // Fit both axes: pick whichever half-extent, scaled by aspect, is larger.
  const viewHalfHeight = Math.max(halfLength, halfWidth / aspect);
  const viewHalfWidth = viewHalfHeight * aspect;

  const camera = new THREE.OrthographicCamera(
    -viewHalfWidth,
    viewHalfWidth,
    viewHalfHeight,
    -viewHalfHeight,
    0.1,
    100,
  );

  const centerZ = courtType === "full_court" ? 0 : -courtLength / 2;
  camera.position.set(0, 50, centerZ);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, centerZ);
  camera.updateProjectionMatrix();
  return camera;
}
