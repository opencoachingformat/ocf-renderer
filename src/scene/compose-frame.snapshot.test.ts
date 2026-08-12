import { describe, it, expect } from "vitest";
import { composeFrame } from "./compose-frame";
import { summarizeScene } from "./scene-graph-snapshot";
import type { OcfDocument } from "../types/ocf";

import simpleCut from "../__fixtures__/simple-cut.json";
import simpleDribble from "../__fixtures__/simple-dribble.json";
import passAndScreen from "../__fixtures__/pass-and-screen.json";
import shoot from "../__fixtures__/shoot.json";
import fullCourtTwoPlayers from "../__fixtures__/full-court-two-players.json";
import customCourt from "../__fixtures__/custom-court.json";

const fixtures: Record<string, OcfDocument> = {
  "simple-cut": simpleCut as OcfDocument,
  "simple-dribble": simpleDribble as OcfDocument,
  "pass-and-screen": passAndScreen as OcfDocument,
  shoot: shoot as OcfDocument,
  "full-court-two-players": fullCourtTwoPlayers as OcfDocument,
  "custom-court": customCourt as OcfDocument,
};

describe("composeFrame scene-graph snapshots", () => {
  for (const [name, doc] of Object.entries(fixtures)) {
    it(`matches snapshot for fixture: ${name}`, () => {
      const scene = composeFrame(doc, 0);
      expect(summarizeScene(scene)).toMatchSnapshot();
    });
  }
});
