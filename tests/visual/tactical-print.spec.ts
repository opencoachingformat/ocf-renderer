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
    await expect(page.locator("canvas")).toHaveScreenshot(`${fixture}.png`, { maxDiffPixelRatio: 0.01 });
  });
}
