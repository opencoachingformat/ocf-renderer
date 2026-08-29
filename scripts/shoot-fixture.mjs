// Dev-only screenshot helper: renders a fixture (optionally a specific frame)
// to a PNG so we can eyeball the dribble/around-player output and iterate.
// Usage: node scripts/shoot-fixture.mjs <fixture> [frame] [outPath]
// Requires: npm run build (so dist/ + the browser bundle exist) first.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const [, , fixture, frameArg, outArg] = process.argv;
if (!fixture) {
  console.error("usage: node scripts/shoot-fixture.mjs <fixture> [frame] [outPath]");
  process.exit(1);
}
const frame = frameArg ?? "0";
const out = outArg ?? join(root, "screenshots", `${fixture}-f${frame}.png`);

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".png": "image/png",
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const filePath = join(root, urlPath);
  if (!existsSync(filePath)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
  res.end(readFileSync(filePath));
});

await new Promise((r) => server.listen(4173, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 820, height: 620 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:4173/examples/render-fixture.html?fixture=${fixture}&frame=${frame}`);
try {
  await page.waitForSelector("canvas[data-rendered='true']", { timeout: 8000 });
} catch {
  console.error("render failed:", errors.join("; ") || "(no page errors)");
  await browser.close(); server.close(); process.exit(1);
}
await page.locator("canvas").screenshot({ path: out });
console.log("wrote", out);
await browser.close();
server.close();
