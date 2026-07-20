import type { ColorScheme } from "../types/ocf";

export const DEFAULT_COLOR_SCHEME: Required<Pick<
  ColorScheme,
  "court_primary" | "court_accent" | "offense" | "defense" | "ball"
>> = {
  court_primary: "#f5f3ee",
  court_accent: "#8ea7c1",
  offense: "#2b3a55",
  defense: "#c0392b",
  ball: "#e07b1f",
};

/** Document color_scheme wins; renderer-option override wins over the document. */
export function resolveColorScheme(
  documentScheme?: ColorScheme,
  optionOverride?: ColorScheme,
): typeof DEFAULT_COLOR_SCHEME {
  return { ...DEFAULT_COLOR_SCHEME, ...documentScheme, ...optionOverride } as typeof DEFAULT_COLOR_SCHEME;
}
