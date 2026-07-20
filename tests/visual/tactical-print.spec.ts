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
