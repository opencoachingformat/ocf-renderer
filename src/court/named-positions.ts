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

    high_post_left: { x: -paintHalfWidth, y: ftLineY + 1.2 },
    high_post_right: { x: paintHalfWidth, y: ftLineY + 1.2 },

    top_of_the_key: { x: 0, y: basketY - d.three_point_distance },

    left_wing: { x: -d.three_point_distance, y: ftLineY + 0.4 },
    right_wing: { x: d.three_point_distance, y: ftLineY + 0.4 },

    left_corner: { x: -halfWidth, y: baseline - 0.02 },
    right_corner: { x: halfWidth, y: baseline - 0.02 },

    left_baseline: { x: -halfWidth, y: baseline },
    right_baseline: { x: halfWidth, y: baseline },
    free_throw_line: { x: 0, y: ftLineY },

    "backcourt.basket": { x: 0, y: -basketY },
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
  };

  const pos = table[name];
  if (!pos) {
    throw new Error(
      `Unknown named position "${name}". Known: ${Object.keys(table).filter((k) => !k.startsWith("backcourt.") && !k.startsWith("inbound.")).join(", ")}`,
    );
  }
  return pos;
}
