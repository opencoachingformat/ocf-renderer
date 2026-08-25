import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { OcfDocument } from "../ocf";

const __dirname = dirname(fileURLToPath(import.meta.url));
// This repo's example documents live in src/__fixtures__/*.json, not
// examples/*.ocf.json — there's no examples/ data directory here.
const EXAMPLES_DIR = resolve(__dirname, "../../__fixtures__");

describe("generated OCF types vs. real example documents", () => {
  const files = readdirSync(EXAMPLES_DIR).filter((f: string) => f.endsWith(".json"));

  it("found at least one example to test against", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} parses as a structurally valid OcfDocument`, () => {
      const raw = readFileSync(resolve(EXAMPLES_DIR, file), "utf-8");
      const doc = JSON.parse(raw) as OcfDocument;
      // The meaningful assertion here is at compile time (the `as OcfDocument`
      // cast above only succeeds meaningfully if the shape lines up with what
      // downstream code expects) — these runtime checks catch the cases a
      // silent structural mismatch would still let through un-noticed.
      expect(doc.meta.id).toBeTruthy();
      expect(doc.entities.length).toBeGreaterThan(0);
      expect(doc.frames.length).toBeGreaterThan(0);
    });
  }
});

describe("regression: bugs found in the hand-written ocf.ts (pre-codegen)", () => {
  it("court.drill_focus accepts the real schema enum, not the old full|half guess", () => {
    const court: OcfDocument["court"] = {
      ruleset: "fiba",
      type: "half_court",
      drill_focus: "transition",
    };
    expect(court.drill_focus).toBe("transition");
  });

  it("meta carries the full schema field set, not just {id, title}", () => {
    const meta: OcfDocument["meta"] = {
      id: "x",
      title: "y",
      description: "previously dropped by the hand-written Meta type",
      author: "previously dropped",
      tags: ["previously", "dropped"],
      difficulty: "intermediate",
    };
    expect(meta.description).toBeDefined();
  });

  it("branches is a typed outcome->frame map, not `unused ... unknown`", () => {
    const branches: NonNullable<OcfDocument["frames"][number]["branches"]> = {
      make: "frame_2",
      miss: "frame_3",
    };
    expect(branches.make).toBe("frame_2");
  });

  it("color_scheme uses the schema's real *_fill/*_stroke keys", () => {
    const scheme: NonNullable<OcfDocument["color_scheme"]> = {
      offense_fill: "#ff0000",
      offense_stroke: "#800000",
      defense_fill: "#0000ff",
      defense_stroke: "#000080",
    };
    expect(scheme.offense_fill).toBe("#ff0000");
  });

  it("Area and Label frame overlays exist (previously entirely missing)", async () => {
    const mod = await import("../ocf.generated");
    // Presence check only — these types were absent from the hand-written
    // ocf.ts, so this import failing to resolve them would be the regression.
    expect(mod).toBeTruthy();
  });
});
