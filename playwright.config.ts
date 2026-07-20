import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/visual",
  timeout: 30_000,
});
