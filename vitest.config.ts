import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Working copies of parallel agents live inside the project: never run their tests from here.
    exclude: ["**/node_modules/**", ".claude/**"],
    coverage: {
      include: ["src/**"],
      // The executable only wires the real process to runCli, which the tests drive directly.
      exclude: ["src/cli/bin.ts"],
    },
  },
});
