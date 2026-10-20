import { describe, expect, it } from "vitest";
import { decodeText, EncodingError, encodeText } from "../../src/storage/encoding.js";

const bytes = (...values: number[]) => Uint8Array.from(values);

describe("decodeText", () => {
  it("detects UTF-8 and UTF-16 by their byte order mark, and removes it", () => {
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, 0x48, 0x69), "auto")).toBe("Hi");
    expect(decodeText(bytes(0xff, 0xfe, 0x48, 0x00, 0x69, 0x00), "auto")).toBe("Hi");
    expect(decodeText(bytes(0xfe, 0xff, 0x00, 0x48, 0x00, 0x69), "auto")).toBe("Hi");
  });

  it("reads valid UTF-8 as UTF-8, and anything else as Windows-1252", () => {
    expect(decodeText(bytes(0x43, 0x61, 0x66, 0xc3, 0xa9), "auto")).toBe("Café");
    expect(decodeText(bytes(0x43, 0x61, 0x66, 0xe9, 0x80), "auto")).toBe("Café€");
  });

  it("follows an explicit encoding", () => {
    expect(decodeText(bytes(0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2), "windows-1251")).toBe("Привет");
  });
});

describe("encodeText", () => {
  it("writes UTF-8, with a byte order mark when asked to", () => {
    expect([...encodeText("é", "utf-8")]).toEqual([0xc3, 0xa9]);
    expect([...encodeText("é", "utf-8-bom")]).toEqual([0xef, 0xbb, 0xbf, 0xc3, 0xa9]);
  });

  it("writes UTF-16 little endian with its byte order mark", () => {
    expect([...encodeText("Hé", "utf-16le")]).toEqual([0xff, 0xfe, 0x48, 0x00, 0xe9, 0x00]);
  });

  it("writes legacy Windows code pages", () => {
    expect([...encodeText("Café €", "windows-1252")]).toEqual([0x43, 0x61, 0x66, 0xe9, 0x20, 0x80]);
    expect([...encodeText("Привет", "windows-1251")]).toEqual([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
  });

  it("refuses characters the encoding cannot hold, instead of writing question marks", () => {
    expect(() => encodeText("Café 日本", "windows-1252")).toThrow(EncodingError);
    expect(() => encodeText("Café 日本", "windows-1252")).toThrow(/"日", "本".*windows-1252/);
  });

  it("reads back what it writes", () => {
    for (const encoding of ["utf-8", "utf-8-bom", "utf-16le", "windows-1252"] as const) {
      expect(decodeText(encodeText("Été « ok » €", encoding), "auto")).toBe("Été « ok » €");
    }
  });
});
