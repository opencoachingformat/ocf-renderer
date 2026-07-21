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

const fixtures: Record<string, OcfDocument> = {
  "simple-cut": simpleCut as OcfDocument,
  "simple-dribble": simpleDribble as OcfDocument,
  "pass-and-screen": passAndScreen as OcfDocument,
  shoot: shoot as OcfDocument,
  "full-court-two-players": fullCourtTwoPlayers as OcfDocument,
  "custom-court": customCourt as OcfDocument,
  "pick-and-roll": pickAndRoll as OcfDocument,
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
