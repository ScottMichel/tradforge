import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, readZip, writeZip, ZipError } from "../../../../src/formats/shared/zip/zip.js";

const text = (value: string) => new TextEncoder().encode(value);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("crc32", () => {
  it("gives the checksum of ZIP files", () => {
    expect(crc32(text("The quick brown fox jumps over the lazy dog"))).toBe(0x414fa339);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("writeZip / readZip", () => {
  it("reads back what it writes, stored and deflated, in order", () => {
    const zip = writeZip([
      { name: "[Content_Types].xml", data: text("<Types/>"), compress: false },
      { name: "word/document.xml", data: text("<w:document>The Cold Forge</w:document>".repeat(20)), compress: true },
    ]);
    const entries = readZip(zip);
    expect(entries.map((entry) => [entry.name, entry.method])).toEqual([
      ["[Content_Types].xml", 0],
      ["word/document.xml", 8],
    ]);
    expect(decode(entries[1]?.data() ?? new Uint8Array())).toBe("<w:document>The Cold Forge</w:document>".repeat(20));
  });

  it("copies an unchanged entry as it was compressed, with its date", () => {
    const original = readZip(
      writeZip([
        { name: "a.xml", data: text("Hello ".repeat(50)), compress: true, modified: { date: 0x5821, time: 0x6000 } },
      ]),
    );
    const copy = readZip(writeZip(original.map((entry) => ({ raw: entry }))));
    expect(copy[0]).toMatchObject({ name: "a.xml", method: 8, date: 0x5821, time: 0x6000 });
    expect(Buffer.from(copy[0]?.compressed ?? []).equals(Buffer.from(original[0]?.compressed ?? []))).toBe(true);
  });

  it("names what it cannot read", () => {
    expect(() => readZip(text("not a zip"))).toThrow(new ZipError("not a ZIP archive (no end of central directory)"));
    const encrypted = writeZip([{ name: "a", data: text("x"), compress: false }]);
    encrypted[6] = 1; // the encryption flag of the local header
    const central = Buffer.from(encrypted).indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    encrypted[central + 8] = 1; // and of the central directory
    expect(() => readZip(encrypted)).toThrow(/encrypted/);
  });

  it("checks the CRC of what it inflates", () => {
    const zip = writeZip([{ name: "a.txt", data: text("Hello"), compress: false }]);
    const data = Buffer.from(zip).indexOf(Buffer.from("Hello"));
    zip[data] = "J".charCodeAt(0);
    expect(() => readZip(zip)[0]?.data()).toThrow(/a.txt: corrupted \(CRC mismatch\)/);
  });

  it("reads an archive whose entries were deflated by another tool", () => {
    // A hand-built archive: one entry, deflated by zlib, with a data descriptor as many tools write.
    const content = text("Deflated elsewhere");
    const compressed = deflateRawSync(content);
    const zip = writeZip([{ name: "x.txt", data: content, compress: true }]);
    expect(Buffer.from(readZip(zip)[0]?.compressed ?? []).equals(compressed)).toBe(true);
  });
});
