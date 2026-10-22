import { defineConfig } from "vite";

// Vite builds the page only; the main process and the preload script are compiled by tsc.
export default defineConfig({
  root: "src/renderer",
  // Relative addresses: the built page is opened from the disk (file://), not from a server.
  base: "./",
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
});
