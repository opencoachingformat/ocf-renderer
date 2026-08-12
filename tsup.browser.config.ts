import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2020",
  outDir: "dist/browser",
  noExternal: ["three"],
  sourcemap: true,
});
