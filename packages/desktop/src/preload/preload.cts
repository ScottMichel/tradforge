// A preload script of a sandboxed window can require nothing but electron: it is CommonJS, and stays this small.
import { contextBridge, type IpcRendererEvent, ipcRenderer, webUtils } from "electron";
import type { Channel, Event, ProgressView, Requests, TradforgeBridge } from "../shared/bridge.js";

/** Each request goes to the channel of its name; the answer is an Outcome, unwrapped by the page. */
const request =
  (name: keyof Requests) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(`tradforge:${name}` satisfies Channel, ...args);

const progress: Event = "tradforge:progress";

const bridge: TradforgeBridge = {
  version: request("version"),
  choose: request("choose"),
  open: request("open"),
  createProject: request("createProject"),
  settings: request("settings"),
  saveSettings: request("saveSettings"),
  engineStatus: request("engineStatus"),
  translate: request("translate"),
  stopTranslation: request("stopTranslation"),
  entries: request("entries"),
  review: request("review"),
  build: request("build"),
  pathOf: (file) => webUtils.getPathForFile(file),
  onProgress: (listener) => {
    const forward = (_: IpcRendererEvent, value: ProgressView) => listener(value);
    ipcRenderer.on(progress, forward);
    return () => ipcRenderer.removeListener(progress, forward);
  },
};

contextBridge.exposeInMainWorld("tradforge", bridge);
