// Local live preview for the renderer. Serves the examples/ gallery (which loads
// the freshly-built dist/ bundle) and rebuilds dist/ whenever a source file
// changes, so you can eyeball your local renderer changes in a browser — the
// way the Try-it page works, but pointed at your working tree.
//
// Usage: npm run dev   →  open http://localhost:4180/examples/
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, watch } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const PORT = Number(process.env.PORT ?? 4180);

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".png": "image/png",
  ".svg": "image/svg+xml", ".map": "application/json",
};

// --- static server (same path-traversal guard as shoot-fixture.mjs) ---
const rootPrefix = root.endsWith(sep) ? root : root + sep;
const server = createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/examples/index.html";
  let filePath = resolve(root, "." + urlPath);
  if (filePath !== root && !filePath.startsWith(rootPrefix)) {
    res.writeHead(403); res.end("forbidden"); return;
  }
  if (!existsSync(filePath)) { res.writeHead(404); res.end("not found"); return; }
  // Directory request → serve its index.html (avoids EISDIR on readFileSync).
  if (statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
    if (!existsSync(filePath)) { res.writeHead(404); res.end("not found"); return; }
  }
  res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
  res.end(readFileSync(filePath));
});

// --- rebuild dist/ on source changes (debounced) ---
let building = false;
let queued = false;
function rebuild(reason) {
  if (building) { queued = true; return; }
  building = true;
  process.stdout.write(`\n[dev] rebuilding (${reason})… `);
  const p = spawn("npm", ["run", "build"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  p.on("close", (code) => {
    building = false;
    process.stdout.write(code === 0 ? "done. reload the browser.\n" : `FAILED (exit ${code}).\n`);
    if (queued) { queued = false; rebuild("queued change"); }
  });
}

let debounce;
watch(join(root, "src"), { recursive: true }, (_event, file) => {
  if (!file) return;
  const rel = file.split(sep).join("/");
  // Ignore test files and generated output — the build's prebuild step writes
  // src/types/ocf.generated.ts, which would otherwise retrigger the build in a
  // loop.
  if (/\.(test|spec)\./.test(rel) || /\.generated\./.test(rel) || rel.startsWith("generated/")) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => rebuild(`src/${rel}`), 200);
});

server.listen(PORT, () => {
  console.log(`\n[dev] OCF renderer live preview`);
  console.log(`[dev] gallery:  http://localhost:${PORT}/examples/`);
  console.log(`[dev] watching src/ — edits rebuild dist/, then reload the browser.\n`);
  rebuild("initial build");
});
