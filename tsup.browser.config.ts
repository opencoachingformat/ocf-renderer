import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2020",
  outDir: "dist/browser",
  // Bundle three AND its subpath modules (three/examples/jsm/lines/* for Line2),
  // so the browser bundle needs no import map — the Try-it page loads it directly.
  noExternal: [/^three($|\/)/],
  sourcemap: true,
});
