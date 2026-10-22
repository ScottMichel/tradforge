#!/usr/bin/env node
import { runCli } from "./main.js";

// First Ctrl+C: stop cleanly, the current batch is saved. Second Ctrl+C: quit at once.
const controller = new AbortController();
process.once("SIGINT", () => {
  process.stderr.write("\nStopping: saving what is done... (press Ctrl+C again to quit at once)\n");
  controller.abort();
  process.once("SIGINT", () => process.exit(130));
});

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  signal: controller.signal,
});
