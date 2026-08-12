import { describe, it, expect } from "vitest";
import { resolveFrameState } from "../parser/resolve-frame-state";
import { composeFrame } from "../scene/compose-frame";
import type { OcfDocument } from "../types/ocf";

import simpleCut from "./simple-cut.json";
import simpleDribble from "./simple-dribble.json";
import passAndScreen from "./pass-and-screen.json";
import shoot from "./shoot.json";
import fullCourtTwoPlayers from "./full-court-two-players.json";
import customCourt from "./custom-court.json";
import pickAndRoll from "./pick-and-roll.json";
import sourceFourFrameBallScreen from "./source-four-frame-ball-screen.json";

const fixtures: Record<string, OcfDocument> = {
  "simple-cut": simpleCut as OcfDocument,
  "simple-dribble": simpleDribble as OcfDocument,
  "pass-and-screen": passAndScreen as OcfDocument,
  shoot: shoot as OcfDocument,
  "full-court-two-players": fullCourtTwoPlayers as OcfDocument,
  "custom-court": customCourt as OcfDocument,
  "pick-and-roll": pickAndRoll as OcfDocument,
  "source-four-frame-ball-screen": sourceFourFrameBallScreen as unknown as OcfDocument,
};

describe("fixtures", () => {
  for (const [name, doc] of Object.entries(fixtures)) {
    for (let frameIndex = 0; frameIndex < doc.frames.length; frameIndex++) {
      it(`${name} frame ${frameIndex} parses and composes without error`, () => {
        expect(() => resolveFrameState(doc, frameIndex, "start")).not.toThrow();
        expect(() => composeFrame(doc, frameIndex)).not.toThrow();
      });
    }
  }
});

describe("source-four-frame-ball-screen", () => {
  const doc = fixtures["source-four-frame-ball-screen"];

  it("has exactly four frames and five offense entities", () => {
    expect(doc.frames).toHaveLength(4);
    expect(doc.entities.filter((entity) => entity.type === "offense")).toHaveLength(5);
  });

  it("composes all four frames with entities and actions groups", () => {
    for (let frameIndex = 0; frameIndex < 4; frameIndex++) {
      const scene = composeFrame(doc, frameIndex);
      expect(scene.getObjectByName("entities")).toBeDefined();
      expect(scene.getObjectByName("actions")).toBeDefined();
    }
  });
});
