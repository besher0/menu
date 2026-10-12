import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const localTemp = resolve(import.meta.dirname, ".vitest-tmp");
process.env.TEMP = localTemp;
process.env.TMP = localTemp;

export default defineConfig({
  cacheDir: resolve(import.meta.dirname, ".vitest-cache"),
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" }
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src")
    }
  },
  test: {
    environment: "node",
    pool: "threads"
  }
});
