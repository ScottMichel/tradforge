// Starts the page on Vite's development server, then Electron on it: a change to the page shows at once.
// A change to the main process or the preload script needs a new start (npm run desktop).
import { spawn } from "node:child_process";
import electron from "electron";
import { createServer } from "vite";

const server = await createServer();
await server.listen();
const url = server.resolvedUrls?.local[0];
if (url === undefined) throw new Error("Vite gave no address");

// Set in the terminals of VS Code (itself an Electron application), it would start Electron as a plain Node.js.
const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
const app = spawn(electron, ["."], { stdio: "inherit", env: { ...env, TRADFORGE_DEV_SERVER: url } });
app.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
