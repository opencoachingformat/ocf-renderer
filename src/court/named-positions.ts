import type { CourtDimensions } from "./fiba-constants";

/**
 * Renderer-default named positions for FIBA-style courts, relative to the
 * offense basket (+y half). All positions are frontcourt; for full-court
 * documents that need a defensive-half named spot, use `relative_to` + dx/dy
 * from a frontcourt name, or free x/y coordinates.
 */
export function fibaNamedPosition(
  name: string,
  d: CourtDimensions,
): { x: number; y: number } {
  const baseline = d.length / 2;
  const basketY = baseline - d.basket_from_baseline;
  const ftLineY = baseline - d.free_throw_distance;
  const paintHalfWidth = d.paint_width / 2;

  const table: Record<string, { x: number; y: number }> = {
    half_court: { x: 0, y: 0 },
    basket: { x: 0, y: basketY },
    free_throw_line: { x: 0, y: ftLineY },
    top_of_key: { x: 0, y: ftLineY },
    left_elbow: { x: -paintHalfWidth, y: ftLineY },
    right_elbow: { x: paintHalfWidth, y: ftLineY },
    left_block: { x: -paintHalfWidth, y: baseline - 1.5 },
    right_block: { x: paintHalfWidth, y: baseline - 1.5 },
    left_baseline: { x: -d.width / 2, y: baseline },
    right_baseline: { x: d.width / 2, y: baseline },
    left_corner: { x: -d.width / 2 + 0.9, y: baseline - 0.9 },
    right_corner: { x: d.width / 2 - 0.9, y: baseline - 0.9 },
    left_wing: { x: -d.three_point_distance * 0.7, y: ftLineY + 1.5 },
    right_wing: { x: d.three_point_distance * 0.7, y: ftLineY + 1.5 },
  };

  const pos = table[name];
  if (!pos) {
    throw new Error(
      `Unknown named position "${name}". Known: ${Object.keys(table).join(", ")}`,
    );
  }
  return pos;
}
