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

/**
 * Builds the paint, free-throw circle, three-point arc, and backboard for one
 * basket. `towardCenter` is the signed y-direction (from the baseline) that
 * points toward center court — +1 when center court is at larger y than the
 * baseline (the near end of a full court), -1 when it's at smaller y (the far
 * end of a full court, or the only end of a half court).
 */
function buildHoopEnd(
  transformer: CoordinateTransformer,
  dims: CourtDimensions,
  colors: typeof DEFAULT_COLOR_SCHEME,
  baselineY: number,
  towardCenter: 1 | -1,
  nameSuffix: string,
): THREE.Object3D[] {
  const paintHalfWidth = dims.paint_width / 2;
  const paintFarY = baselineY + towardCenter * dims.paint_depth;
  const paint = lineFromCourtPoints(
    [
      { x: -paintHalfWidth, y: baselineY },
      { x: -paintHalfWidth, y: paintFarY },
      { x: paintHalfWidth, y: paintFarY },
      { x: paintHalfWidth, y: baselineY },
    ],
    transformer,
    colors.court_accent,
    `paint${nameSuffix}`,
    false,
  );

  const ftCirclePoints = new THREE.EllipseCurve(0, 0, paintHalfWidth, paintHalfWidth)
    .getPoints(48)
    .map((p) => ({ x: p.x, y: paintFarY + p.y }));
  const ftCircle = lineFromCourtPoints(
    ftCirclePoints,
    transformer,
    colors.court_accent,
    `free-throw-circle${nameSuffix}`,
    true,
  );

  const basketY = baselineY + towardCenter * dims.basket_from_baseline;
  // Sweep the half of the circle whose sin matches towardCenter's sign, so
  // the arc bulges toward center court instead of past the baseline.
  const arcStart = towardCenter === 1 ? 0 : Math.PI;
  const arcPoints = new THREE.EllipseCurve(
    0,
    0,
    dims.three_point_distance,
    dims.three_point_distance,
    arcStart,
    arcStart + Math.PI,
    false,
  )
    .getPoints(48)
    .map((p) => ({ x: p.x, y: basketY + p.y }));
  const arc = lineFromCourtPoints(arcPoints, transformer, colors.court_accent, `three-point-arc${nameSuffix}`, false);

  const backboard = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.14, 24),
    new THREE.MeshBasicMaterial({ color: colors.court_accent }),
  );
  backboard.rotation.x = -Math.PI / 2;
  backboard.position.copy(transformer.toWorld({ x: 0, y: basketY }));
  backboard.name = `backboard${nameSuffix}`;

  return [paint, ftCircle, arc, backboard];
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

  // Far end (e.g. frontcourt basket for half_court): center court is at
  // smaller y than the baseline, so the arc/paint point toward -y.
  for (const obj of buildHoopEnd(transformer, dims, colors, baseline, -1, "")) group.add(obj);

  if (isFull) {
    // Near end: center court is at larger y than this baseline (-baseline),
    // so the arc/paint mirror to point toward +y.
    for (const obj of buildHoopEnd(transformer, dims, colors, nearEdge, 1, "-near")) group.add(obj);

    const centerCirclePoints = new THREE.EllipseCurve(0, 0, dims.center_circle_radius, dims.center_circle_radius)
      .getPoints(48)
      .map((p) => ({ x: p.x, y: p.y }));
    group.add(lineFromCourtPoints(centerCirclePoints, transformer, colors.court_accent, "center-circle", true));
  }

  return group;
}
