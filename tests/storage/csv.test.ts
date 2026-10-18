import { describe, expect, it } from "vitest";
import { CsvError, formatCsv, parseCsv } from "../../src/storage/csv.js";

describe("formatCsv", () => {
  it("quotes only the fields that need it, with CRLF line ends and a BOM for Excel", () => {
    const rows = [
      ["source", "target"],
      ["Hello, you", 'Say "hi"'],
      ["Line 1\nLine 2", " padded"],
    ];
    expect(formatCsv(rows)).toBe(
      '﻿source,target\r\n"Hello, you","Say ""hi"""\r\n"Line 1\nLine 2"," padded"\r\n',
    );
  });
});

describe("parseCsv", () => {
  it("reads back what formatCsv wrote", () => {
    const rows = [
      ["source", "target", "status"],
      ["Hello, you", 'Say "hi"', ""],
      ["Line 1\nLine 2", " padded ", "reviewed"],
    ];
    expect(parseCsv(formatCsv(rows))).toEqual(rows);
  });

  it("reads LF files without BOM or final line end, and empty fields", () => {
    expect(parseCsv("a,b\n1,,3\n,")).toEqual([["a", "b"], ["1", "", "3"], ["", ""]]);
  });

  it("reports an unterminated quoted field with its line", () => {
    expect(() => parseCsv('a,b\n1,"never closed\n2')).toThrow(CsvError);
    expect(() => parseCsv('a,b\n1,"never closed\n2')).toThrow(/line 2/);
  });
});
