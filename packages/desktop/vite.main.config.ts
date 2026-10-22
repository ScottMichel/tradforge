import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * The main process, bundled with the sources of the library into one file: the packaged application needs no
 * node_modules, and no build of the library first. Electron and the Node.js modules stay outside.
 */
export default defineConfig({
  resolve: { alias: { tradforge: fileURLToPath(new URL("../cli/src/index.ts", import.meta.url)) } },
  ssr: { noExternal: true },
  build: {
    ssr: "src/main/main.ts",
    outDir: "dist/main",
    emptyOutDir: true,
    target: "node22",
    sourcemap: true,
    rollupOptions: {
      external: ["electron"],
      output: { format: "es", entryFileNames: "main.js" },
    },
  },
});
