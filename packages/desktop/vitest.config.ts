import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Without this file, Vitest would take vite.config.ts, whose root is the page.
export default defineConfig({
  // The tests run against the sources of the library, never against a stale build of it.
  resolve: { alias: { tradforge: fileURLToPath(new URL("../cli/src/index.ts", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
