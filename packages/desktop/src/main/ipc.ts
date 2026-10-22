import { BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain, type OpenDialogOptions } from "electron";
import { FORMATS, VERSION } from "tradforge";
import { ENGINE_TYPES, type EngineType, type Outcome, type Requests, type SettingsView } from "../shared/bridge.js";
import { AppError, describeError } from "./errors.js";
import type { Workspace } from "./workspace.js";

/**
 * Answers the requests of the page. What the page sends is checked before use, as anything that crosses a trust
 * boundary: a bug in the page must not become a wrong call to the library.
 */
export function registerBridge(workspace: Workspace): void {
  /** The running translation: one at a time, and nothing else changes the memory meanwhile. */
  let running: AbortController | undefined;
  const idle = () => {
    if (running !== undefined) throw new AppError("busy", {}, "Wait for the translation to finish, or stop it");
  };

  handle("version", () => VERSION);
  handle("choose", async (event, kind, title) => {
    const options: OpenDialogOptions =
      choice(kind) === "folder"
        ? { title: text(title), properties: ["openDirectory"] }
        : { title: text(title), properties: ["openFile"], filters: [{ name: "tradforge", extensions: EXTENSIONS }] };
    const window = BrowserWindow.fromWebContents(event.sender);
    const result =
      window === null ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options);
    return result.canceled ? undefined : result.filePaths[0];
  });
  handle("open", (_, path, from, to) => workspace.open(text(path), text(from), text(to)));
  handle("createProject", (_, path, from, to, chosen) =>
    workspace.createProject(text(path), text(from), text(to), indexes(chosen)),
  );
  handle("settings", (_, root) => workspace.settings(text(root)));
  handle("saveSettings", (_, root, settings) => {
    idle();
    return workspace.saveSettings(text(root), settingsOf(settings));
  });
  handle("engineStatus", (_, root, settings) => workspace.engineStatus(text(root), settingsOf(settings)));
  handle("translate", async (event, root, retryFailed) => {
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
  handle("stopTranslation", () => {
    running?.abort();
  });
  handle("entries", (_, root) => workspace.entries(text(root)));
  handle("review", (_, root, source, target) => {
    idle();
    return workspace.review(text(root), text(source), text(target));
  });
  handle("build", (_, root, force) => {
    idle();
    return workspace.build(text(root), flag(force));
  });
}

/** The extensions of every format, for the file dialog ("json", "docx"...). */
const EXTENSIONS = [...new Set(Object.values(FORMATS).flatMap((format) => format.extensions))]
  .map((extension) => extension.replace(/^\./, ""))
  .sort();

/** Sends the result, or the error as the page words it: see Outcome. */
function handle(request: keyof Requests, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
  ipcMain.handle(`tradforge:${request}`, async (event, ...args): Promise<Outcome<unknown>> => {
    try {
      return { ok: true, value: await listener(event, ...args) };
    } catch (error) {
      return { ok: false, error: describeError(error) };
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

function choice(value: unknown): "folder" | "file" {
  if (value !== "folder" && value !== "file") throw new TypeError("Expected folder or file");
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
