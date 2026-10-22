import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSamePage, pageToLoad } from "../src/main/page.js";

describe("isSamePage", () => {
  it("lets the page reload itself, whatever its step", () => {
    const page = "file:///C:/app/dist/renderer/index.html#review";
    expect(isSamePage(page, "file:///C:/app/dist/renderer/index.html")).toBe(true);
    expect(isSamePage(page, "file:///C:/app/dist/renderer/index.html#project")).toBe(true);
    expect(isSamePage("http://localhost:5173/#settings", "http://localhost:5173/")).toBe(true);
  });

  it("refuses any other address", () => {
    const page = "file:///C:/app/dist/renderer/index.html";
    expect(isSamePage(page, "https://example.com/")).toBe(false);
    expect(isSamePage(page, "file:///C:/Users/me/notes.html")).toBe(false);
    expect(isSamePage(page, "not a url")).toBe(false);
  });
});

describe("pageToLoad", () => {
  it("loads the built page when no development server runs", () => {
    expect(pageToLoad(undefined, "/app")).toEqual({ file: join("/app", "dist", "renderer", "index.html") });
    expect(pageToLoad("", "/app")).toEqual({ file: join("/app", "dist", "renderer", "index.html") });
  });

  it("loads the development server, for hot reload", () => {
    expect(pageToLoad("http://localhost:5173/", "/app")).toEqual({ url: "http://localhost:5173/" });
    expect(pageToLoad("http://127.0.0.1:5174/", "/app")).toEqual({ url: "http://127.0.0.1:5174/" });
  });

  it("refuses a development server on another machine, which would get the bridge to Node.js", () => {
    expect(() => pageToLoad("https://example.com/", "/app")).toThrow(/this computer/);
    expect(() => pageToLoad("file:///C:/page.html", "/app")).toThrow(/this computer/);
    expect(() => pageToLoad("not a url", "/app")).toThrow(/this computer/);
  });
});
