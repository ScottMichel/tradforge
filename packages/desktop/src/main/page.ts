import { join } from "node:path";

/** What the window shows: the built page, or the development server that reloads it on each change. */
export type Page = { readonly file: string } | { readonly url: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True when a navigation only reloads the page (Ctrl+R, a full reload of the development server). */
export function isSamePage(current: string, target: string): boolean {
  if (!URL.canParse(current) || !URL.canParse(target)) return false;
  const [from, to] = [new URL(current), new URL(target)];
  from.hash = "";
  to.hash = "";
  return from.href === to.href;
}

/**
 * The page to load. A development server is used only on this computer: the page it serves gets the bridge to
 * Node.js, so an address from elsewhere would let another machine drive the application.
 */
export function pageToLoad(devServer: string | undefined, appDir: string): Page {
  if (devServer === undefined || devServer === "") return { file: join(appDir, "dist", "renderer", "index.html") };
  const url = URL.canParse(devServer) ? new URL(devServer) : undefined;
  if (url === undefined || url.protocol !== "http:" || !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`The development server must run on this computer (http://localhost), not at ${devServer}`);
  }
  return { url: url.href };
}
