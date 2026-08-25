import { describe, it, expect } from "vitest";
import { resolveColorScheme, DEFAULT_COLOR_SCHEME } from "./color-scheme";

describe("resolveColorScheme", () => {
  it("falls back to defaults when nothing is provided", () => {
    expect(resolveColorScheme()).toEqual(DEFAULT_COLOR_SCHEME);
  });

  it("lets the document color_scheme override defaults", () => {
    const result = resolveColorScheme({ offense_fill: "#123456" });
    expect(result.offense_fill).toBe("#123456");
    expect(result.defense_fill).toBe(DEFAULT_COLOR_SCHEME.defense_fill);
  });

  it("lets a renderer option override beat the document scheme", () => {
    const result = resolveColorScheme({ offense_fill: "#123456" }, { offense_fill: "#abcdef" });
    expect(result.offense_fill).toBe("#abcdef");
  });
});
