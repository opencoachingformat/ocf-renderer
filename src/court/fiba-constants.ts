export interface CourtDimensions {
  length: number;
  width: number;
  basket_from_baseline: number;
  three_point_distance: number;
  paint_width: number;
  paint_depth: number;
  free_throw_distance: number;
  restricted_area_radius: number;
  center_circle_radius: number;
}

export const FIBA_DEFAULTS: CourtDimensions = {
  length: 28,
  width: 15,
  basket_from_baseline: 1.575,
  three_point_distance: 6.75,
  paint_width: 4.9,
  paint_depth: 5.8,
  free_throw_distance: 5.8,
  restricted_area_radius: 1.25,
  center_circle_radius: 1.8,
};
