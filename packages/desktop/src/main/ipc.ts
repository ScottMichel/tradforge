import { BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain } from "electron";
import { VERSION } from "tradforge";
import { type Channel, ENGINE_TYPES, type EngineType, type Outcome, type SettingsView } from "../shared/bridge.js";
import type { Workspace } from "./workspace.js";

/**
 * Answers the requests of the page. What the page sends is checked before use, as anything that crosses a trust
 * boundary: a bug in the page must not become a wrong call to the library.
 */
export function registerBridge(workspace: Workspace): void {
  /** The running translation: one at a time, and nothing else changes the memory meanwhile. */
  let running: AbortController | undefined;
  const idle = () => {
    if (running !== undefined) throw new Error("Wait for the translation to finish, or stop it");
  };

  handle("tradforge:version", () => VERSION);
  handle("tradforge:choose-folder", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = { properties: ["openDirectory" as const] };
    const result =
      window === null ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options);
    return result.canceled ? undefined : result.filePaths[0];
  });
  handle("tradforge:open-folder", (_, root, from, to) => workspace.openFolder(text(root), text(from), text(to)));
  handle("tradforge:create-project", (_, root, from, to, chosen) =>
    workspace.createProject(text(root), text(from), text(to), indexes(chosen)),
  );
  handle("tradforge:settings", (_, root) => workspace.settings(text(root)));
  handle("tradforge:save-settings", (_, root, settings) => {
    idle();
    return workspace.saveSettings(text(root), settingsOf(settings));
  });
  handle("tradforge:engine-status", (_, root, settings) => workspace.engineStatus(text(root), settingsOf(settings)));
  handle("tradforge:translate", async (event, root, retryFailed) => {
    idle();
    const controller = new AbortController();
    running = controller;
    try {
      return await workspace.translate(text(root), {
        retryFailed: flag(retryFailed),
        signal: controller.signal,
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send("tradforge:progress", progress);
        },
      });
    } finally {
      running = undefined;
    }
  });
  handle("tradforge:stop-translation", () => {
    running?.abort();
  });
  handle("tradforge:entries", (_, root) => workspace.entries(text(root)));
  handle("tradforge:review", (_, root, source, target) => {
    idle();
    return workspace.review(text(root), text(source), text(target));
  });
  handle("tradforge:build", (_, root, force) => {
    idle();
    return workspace.build(text(root), flag(force));
  });
}

/** Sends the result, or the message of the error: see Outcome. */
function handle(channel: Channel, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args): Promise<Outcome<unknown>> => {
    try {
      return { ok: true, value: await listener(event, ...args) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  });
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Expected a text");
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new TypeError("Expected true or false");
  return value;
}

function indexes(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every((item) => Number.isInteger(item))) throw new TypeError("Expected indexes");
  return value;
}

function isEngine(value: unknown): value is EngineType {
  return (ENGINE_TYPES as readonly unknown[]).includes(value);
}

function settingsOf(value: unknown): SettingsView {
  if (typeof value !== "object" || value === null) throw new TypeError("Expected settings");
  const { sourceLanguage, targetLanguage, engine, model, address, instructions } = value as Record<string, unknown>;
  if (!isEngine(engine)) throw new TypeError(`Unknown engine: ${String(engine)}`);
  return {
    sourceLanguage: text(sourceLanguage),
    targetLanguage: text(targetLanguage),
    engine,
    model: text(model),
    address: text(address),
    instructions: text(instructions),
  };
}
