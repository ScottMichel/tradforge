import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**"],
      // The executable only wires the real process to runCli, which the tests drive directly.
      exclude: ["src/cli/bin.ts"],
    },
  },
});
