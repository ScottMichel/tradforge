import { stripBom } from "../core/reader.js";

/** The CSV text cannot be read (e.g. a quoted field is never closed). */
export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

/**
 * RFC 4180 CSV: comma separator, CRLF line ends, quotes doubled inside quoted fields.
 * Starts with a UTF-8 BOM, without which Excel opens UTF-8 files as Latin-1 (é becomes Ã©).
 */
export function formatCsv(rows: readonly (readonly string[])[]): string {
  const lines = rows.map((row) => row.map(formatField).join(","));
  return `\uFEFF${lines.map((line) => `${line}\r\n`).join("")}`;
}

function formatField(field: string): string {
  return NEEDS_QUOTES.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}

/** Reads CSV text into rows of fields. Accepts CRLF or LF line ends, with or without a BOM. */
export function parseCsv(text: string): string[][] {
  const input = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let quoteLine = 0;
  let pos = 0;

  while (pos < input.length) {
    const char = input.charAt(pos);
    if (quoted) {
      if (char === '"' && input.charAt(pos + 1) === '"') {
        field += '"';
        pos += 2;
        continue;
      }
      if (char === '"') {
        quoted = false;
      } else {
        if (char === "\n") line++;
        field += char;
      }
      pos++;
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
      quoteLine = line;
      pos++;
    } else if (char === ",") {
      row.push(field);
      field = "";
      pos++;
    } else if (char === "\r" || char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      pos += char === "\r" && input.charAt(pos + 1) === "\n" ? 2 : 1;
      line++;
    } else {
      field += char;
      pos++;
    }
  }

  if (quoted) throw new CsvError(`line ${quoteLine}: quoted field never closed`);
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
