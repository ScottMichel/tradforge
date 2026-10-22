import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog } from "electron";
import { registerBridge } from "./ipc.js";
import { isSamePage, pageToLoad } from "./page.js";
import { createWorkspace } from "./workspace.js";

/**
 * The main process: it opens the window and answers the page through the bridge. The page itself has no access to
 * Node.js (sandbox, context isolation), so a text it shows can never run code on the computer.
 */

const preload = fileURLToPath(new URL("../preload/preload.cjs", import.meta.url));

function openWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    // The sizes are those of the page, as in the mockup, not of the window with its frame.
    useContentSize: true,
    title: "tradforge",
    backgroundColor: "#F6F5F2",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  // Shown once painted, so that it never flashes white.
  window.once("ready-to-show", () => window.show());
  // The application is one page: a link never opens a window nor replaces the page; the page may only reload.
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    if (!isSamePage(window.webContents.getURL(), event.url)) event.preventDefault();
  });

  const page = pageToLoad(process.env.TRADFORGE_DEV_SERVER, app.getAppPath());
  void ("url" in page ? window.loadURL(page.url) : window.loadFile(page.file));
}

app
  .whenReady()
  .then(() => {
    registerBridge(createWorkspace());
    openWindow();
    // macOS keeps the application running without a window, and opens one again from the dock.
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow();
    });
  })
  .catch((error: unknown) => {
    // Without a window, the application would keep running unseen.
    dialog.showErrorBox("tradforge", error instanceof Error ? error.message : String(error));
    app.exit(1);
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
