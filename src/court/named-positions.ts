import type { CourtDimensions } from "./fiba-constants";

export function fibaNamedPosition(
  name: string,
  d: CourtDimensions,
): { x: number; y: number } {
  const baseline = d.length / 2;
  const basketY = baseline - d.basket_from_baseline;
  const ftLineY = baseline - d.free_throw_distance;
  const paintHalfWidth = d.paint_width / 2;
  const halfWidth = d.width / 2;

  const table: Record<string, { x: number; y: number }> = {
    half_court: { x: 0, y: 0 },

    basket: { x: 0, y: basketY },

    left_block: { x: -paintHalfWidth, y: baseline - 3.0 },
    right_block: { x: paintHalfWidth, y: baseline - 3.0 },

    left_short_corner: { x: -halfWidth, y: baseline - 2.5 },
    right_short_corner: { x: halfWidth, y: baseline - 2.5 },

    left_elbow: { x: -paintHalfWidth, y: ftLineY },
    right_elbow: { x: paintHalfWidth, y: ftLineY },

    // "Above the elbow" = toward midcourt from the free-throw line, so y is
    // 1.2m SMALLER than the elbow, not larger. Matches @opencoachingformat/spec
    // positions (fiba 7.0, nba/ncaa 26.8, nfhs 21.8).
    high_post_left: { x: -paintHalfWidth, y: ftLineY - 1.2 },
    high_post_right: { x: paintHalfWidth, y: ftLineY - 1.2 },

    top_of_the_key: { x: 0, y: basketY - d.three_point_distance },

    // "Center of the lane" is a defined landmark 1.925m up-court from the
    // basket, not the geometric midpoint basket↔free-throw line. Matches the
    // spec positions (fiba 10.5, nba/ncaa 39.825, nfhs 34.825).
    paint_center: { x: 0, y: basketY - 1.925 },

    left_wing: { x: -d.three_point_distance, y: ftLineY + 0.4 },
    right_wing: { x: d.three_point_distance, y: ftLineY + 0.4 },

    left_corner: { x: -halfWidth, y: baseline - 0.02 },
    right_corner: { x: halfWidth, y: baseline - 0.02 },

    left_baseline: { x: -halfWidth, y: baseline },
    right_baseline: { x: halfWidth, y: baseline },
    free_throw_line: { x: 0, y: ftLineY },

    "midcourt.center": { x: 0, y: 0 },
    "midcourt.left": { x: -halfWidth, y: 0 },
    "midcourt.right": { x: halfWidth, y: 0 },

    "backcourt.basket": { x: 0, y: -basketY },
    "backcourt.free_throw_line": { x: 0, y: -ftLineY },
    "backcourt.left_block": { x: -paintHalfWidth, y: -(baseline - 3.0) },
    "backcourt.right_block": { x: paintHalfWidth, y: -(baseline - 3.0) },
    "backcourt.left_elbow": { x: -paintHalfWidth, y: -ftLineY },
    "backcourt.right_elbow": { x: paintHalfWidth, y: -ftLineY },
    "backcourt.top_of_the_key": { x: 0, y: -(basketY - d.three_point_distance) },
    "backcourt.left_wing": { x: -d.three_point_distance, y: -(ftLineY + 0.4) },
    "backcourt.right_wing": { x: d.three_point_distance, y: -(ftLineY + 0.4) },
    "backcourt.left_corner": { x: -halfWidth, y: -(baseline - 0.02) },
    "backcourt.right_corner": { x: halfWidth, y: -(baseline - 0.02) },

    "inbound.baseline_left": { x: -3.0, y: baseline },
    "inbound.baseline_right": { x: 3.0, y: baseline },
    "inbound.baseline_center": { x: 0, y: baseline },

    "inbound.sideline_left_fc": { x: -halfWidth, y: ftLineY },
    "inbound.sideline_right_fc": { x: halfWidth, y: ftLineY },
    "inbound.sideline_left_mid": { x: -halfWidth, y: 0 },
    "inbound.sideline_right_mid": { x: halfWidth, y: 0 },
    "inbound.sideline_left_bc": { x: -halfWidth, y: -ftLineY },
    "inbound.sideline_right_bc": { x: halfWidth, y: -ftLineY },
  };

  const pos = table[name];
  if (!pos) {
    throw new Error(
      `Unknown named position "${name}". Known: ${Object.keys(table).filter((k) => !k.startsWith("backcourt.") && !k.startsWith("inbound.") && !k.startsWith("midcourt.")).join(", ")}`,
    );
  }
  return pos;
}
