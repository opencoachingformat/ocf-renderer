import { test, expect } from "@playwright/test";

const fixtures = [
  "simple-cut",
  "simple-dribble",
  "pass-and-screen",
  "shoot",
  "full-court-two-players",
  "custom-court",
];

for (const fixture of fixtures) {
  test(`tactical print: ${fixture}`, async ({ page }) => {
    await page.goto(`render-fixture.html?fixture=${fixture}`);
    await page.waitForSelector("canvas[data-rendered='true']");
    // Kept tight (not the 0.01 default) because thin court/action lines only
    // cover a tiny fraction of the 800x600 canvas — a misplaced line (e.g. a
    // mirrored three-point arc) can differ by well under 1% of pixels and
    // would otherwise pass undetected.
    await expect(page.locator("canvas")).toHaveScreenshot(`${fixture}.png`, { maxDiffPixelRatio: 0.001 });
  });
}

// Multi-frame fixture: one screenshot per frame, to cover a full play
// sequence (screen -> roll -> pass/shoot) rather than just a single frame.
const pickAndRollFrameCount = 3;
for (let frameIndex = 0; frameIndex < pickAndRollFrameCount; frameIndex++) {
  test(`tactical print: pick-and-roll frame ${frameIndex}`, async ({ page }) => {
    await page.goto(`render-fixture.html?fixture=pick-and-roll&frame=${frameIndex}`);
    await page.waitForSelector("canvas[data-rendered='true']");
    await expect(page.locator("canvas")).toHaveScreenshot(`pick-and-roll-${frameIndex}.png`, {
      maxDiffPixelRatio: 0.001,
    });
  });
}

// Source-faithful four-frame ball-screen set: covers right-side action,
// dribble penetration, left-side reversal, and around_player dribble routing.
const sourceFourFrameCount = 4;
for (let frameIndex = 0; frameIndex < sourceFourFrameCount; frameIndex++) {
  test(`tactical print: source-four-frame-ball-screen frame ${frameIndex + 1}`, async ({ page }) => {
    await page.goto(`render-fixture.html?fixture=source-four-frame-ball-screen&frame=${frameIndex}`);
    await page.waitForSelector("canvas[data-rendered='true']");
    await expect(page.locator("canvas")).toHaveScreenshot(`source-four-frame-ball-screen-${frameIndex + 1}.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
