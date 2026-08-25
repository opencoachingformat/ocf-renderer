import type { ColorRole, ColorScheme } from "../types/ocf";

export const DEFAULT_COLOR_SCHEME: Required<ColorScheme> = {
  offense_fill: "#003366",
  offense_stroke: "#ffffff",
  defense_fill: "#58001d",
  defense_stroke: "#ffffff",
  black: "#000000",
  grey: "#7f7f7f",
  yellow: "#ffff00",
  green: "#7ce86a",
  red: "#ff0000",
  blue: "#5dd5ff",
  white: "#ffffff",
};

/** Document color_scheme wins; renderer-option override wins over the document. */
export function resolveColorScheme(
  documentScheme?: ColorScheme,
  optionOverride?: ColorScheme,
): Required<ColorScheme> {
  return { ...DEFAULT_COLOR_SCHEME, ...documentScheme, ...optionOverride };
}

/**
 * Resolves a semantic color role (from an entity/area's `color` field, or the
 * renderer's own offense/defense defaults) to a fill hex value. `offense` and
 * `defense` are two-tone (fill/stroke); the remaining roles are flat colors
 * reused for both.
 */
export function roleFill(colors: Required<ColorScheme>, role: ColorRole): string {
  if (role === "offense") return colors.offense_fill;
  if (role === "defense") return colors.defense_fill;
  return colors[role];
}

/** Stroke counterpart of `roleFill` — flat roles have no separate stroke, so fill doubles as stroke. */
export function roleStroke(colors: Required<ColorScheme>, role: ColorRole): string {
  if (role === "offense") return colors.offense_stroke;
  if (role === "defense") return colors.defense_stroke;
  return colors[role];
}
