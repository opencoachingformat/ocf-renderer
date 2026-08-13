import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(__dirname, "..", "dist", "browser", "index.js");

if (!existsSync(bundlePath)) {
  console.error("FAIL: dist/browser/index.js does not exist");
  process.exit(1);
}

const content = readFileSync(bundlePath, "utf-8");

if (/from\s+['"]three['"]/.test(content)) {
  console.error("FAIL: browser bundle contains a bare `from 'three'` import");
  process.exit(1);
}

if (!/OCFRenderer/.test(content)) {
  console.error("FAIL: browser bundle does not export OCFRenderer");
  process.exit(1);
}

console.log("PASS: browser bundle smoke test");
