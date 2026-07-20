import * as THREE from "three";
import type { Court } from "../types/ocf";
import type { CourtDimensions } from "./fiba-constants";
import type { DEFAULT_COLOR_SCHEME } from "../style/color-scheme";
import { CoordinateTransformer } from "./coordinate-transformer";

function lineFromCourtPoints(
  points: { x: number; y: number }[],
  transformer: CoordinateTransformer,
  color: string,
  name: string,
  closed: boolean,
): THREE.Line {
  const worldPoints = points.map((p) => transformer.toWorld(p));
  const geometry = new THREE.BufferGeometry().setFromPoints(worldPoints);
  const material = new THREE.LineBasicMaterial({ color });
  const line = closed
    ? new THREE.LineLoop(geometry, material)
    : new THREE.Line(geometry, material);
  line.name = name;
  return line;
}

export function buildCourt(
  court: Court,
  dims: CourtDimensions,
  colors: typeof DEFAULT_COLOR_SCHEME,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "court";
  const transformer = new CoordinateTransformer(court);
  const isFull = court.type === "full_court";
  const baseline = dims.length / 2;
  const nearEdge = isFull ? -baseline : 0;
  const courtLength = baseline - nearEdge;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.width, courtLength),
    new THREE.MeshBasicMaterial({ color: colors.court_primary }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.copy(transformer.toWorld({ x: 0, y: (nearEdge + baseline) / 2 }));
  floor.name = "court-floor";
  group.add(floor);

  group.add(
    lineFromCourtPoints(
      [
        { x: -dims.width / 2, y: nearEdge },
        { x: dims.width / 2, y: nearEdge },
        { x: dims.width / 2, y: baseline },
        { x: -dims.width / 2, y: baseline },
      ],
      transformer,
      colors.court_accent,
      "boundary",
      true,
    ),
  );

  const paintHalfWidth = dims.paint_width / 2;
  const paintNearY = baseline - dims.paint_depth;
  group.add(
    lineFromCourtPoints(
      [
        { x: -paintHalfWidth, y: baseline },
        { x: -paintHalfWidth, y: paintNearY },
        { x: paintHalfWidth, y: paintNearY },
        { x: paintHalfWidth, y: baseline },
      ],
      transformer,
      colors.court_accent,
      "paint",
      false,
    ),
  );

  const ftCirclePoints = new THREE.EllipseCurve(0, 0, paintHalfWidth, paintHalfWidth)
    .getPoints(48)
    .map((p) => ({ x: p.x, y: paintNearY + p.y }));
  group.add(lineFromCourtPoints(ftCirclePoints, transformer, colors.court_accent, "free-throw-circle", true));

  const basketY = baseline - dims.basket_from_baseline;
  const arcPoints = new THREE.EllipseCurve(
    0,
    0,
    dims.three_point_distance,
    dims.three_point_distance,
    0,
    Math.PI,
    false,
  )
    .getPoints(48)
    .map((p) => ({ x: p.x, y: basketY + p.y }));
  group.add(lineFromCourtPoints(arcPoints, transformer, colors.court_accent, "three-point-arc", false));

  const backboard = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.14, 24),
    new THREE.MeshBasicMaterial({ color: colors.court_accent }),
  );
  backboard.rotation.x = -Math.PI / 2;
  backboard.position.copy(transformer.toWorld({ x: 0, y: basketY }));
  backboard.name = "backboard";
  group.add(backboard);

  if (isFull) {
    const centerCirclePoints = new THREE.EllipseCurve(0, 0, dims.center_circle_radius, dims.center_circle_radius)
      .getPoints(48)
      .map((p) => ({ x: p.x, y: p.y }));
    group.add(lineFromCourtPoints(centerCirclePoints, transformer, colors.court_accent, "center-circle", true));
  }

  return group;
}
