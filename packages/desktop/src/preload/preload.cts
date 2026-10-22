// A preload script of a sandboxed window can require nothing but electron: it is CommonJS, and stays this small.
import { contextBridge, type IpcRendererEvent, ipcRenderer, webUtils } from "electron";
import type { Channel, Event, Outcome, ProgressView, TradforgeBridge } from "../shared/bridge.js";

/** Sends a request, and throws the error of the main process again with its own message. */
async function call<T>(channel: Channel, ...args: unknown[]): Promise<T> {
  const outcome: Outcome<T> = await ipcRenderer.invoke(channel, ...args);
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.value;
}

const progress: Event = "tradforge:progress";

const bridge: TradforgeBridge = {
  version: () => call("tradforge:version"),
  chooseFolder: () => call("tradforge:choose-folder"),
  pathOf: (file) => webUtils.getPathForFile(file),
  openFolder: (root, from, to) => call("tradforge:open-folder", root, from, to),
  createProject: (root, from, to, chosen) => call("tradforge:create-project", root, from, to, chosen),
  settings: (root) => call("tradforge:settings", root),
  saveSettings: (root, settings) => call("tradforge:save-settings", root, settings),
  engineStatus: (root, settings) => call("tradforge:engine-status", root, settings),
  translate: (root, retryFailed) => call("tradforge:translate", root, retryFailed),
  stopTranslation: () => call("tradforge:stop-translation"),
  onProgress: (listener) => {
    const forward = (_: IpcRendererEvent, value: ProgressView) => listener(value);
    ipcRenderer.on(progress, forward);
    return () => ipcRenderer.removeListener(progress, forward);
  },
  entries: (root) => call("tradforge:entries", root),
  review: (root, source, target) => call("tradforge:review", root, source, target),
  build: (root, force) => call("tradforge:build", root, force),
};

contextBridge.exposeInMainWorld("tradforge", bridge);
