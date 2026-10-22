import type { InputEncoding, TextEncoding } from "../core/encodings.js";

export { INPUT_ENCODINGS, type InputEncoding, TEXT_ENCODINGS, type TextEncoding } from "../core/encodings.js";

/** The text cannot be written in the requested encoding. */
export class EncodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncodingError";
  }
}

/** Legacy files are most often Western European: the fallback when bytes are not valid UTF-8. */
const AUTO_FALLBACK = "windows-1252";

/**
 * Turns the bytes of a file into text. "auto" looks for a byte order mark (UTF-8, UTF-16), then accepts valid
 * UTF-8, and falls back to Windows-1252: old game files are often in a legacy code page.
 */
export function decodeText(bytes: Uint8Array, encoding: InputEncoding): string {
  if (encoding === "auto") return decodeAuto(bytes);
  const label = encoding === "utf-8-bom" ? "utf-8" : encoding;
  return new TextDecoder(label).decode(bytes); // the decoder drops a byte order mark of its own encoding
}

function decodeAuto(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder(AUTO_FALLBACK).decode(bytes);
  }
}

/** Turns text into the bytes of a file. Characters the encoding cannot hold are an error, never a "?". */
export function encodeText(text: string, encoding: TextEncoding): Uint8Array {
  switch (encoding) {
    case "utf-8":
      return new TextEncoder().encode(text);
    case "utf-8-bom":
      return concat(Uint8Array.of(0xef, 0xbb, 0xbf), new TextEncoder().encode(text));
    case "utf-16le":
      return encodeUtf16le(text);
    default:
      return encodeSingleByte(text, encoding);
  }
}

function encodeUtf16le(text: string): Uint8Array {
  const result = new Uint8Array(2 + text.length * 2);
  result.set([0xff, 0xfe]);
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    result[2 + index * 2] = unit & 0xff;
    result[3 + index * 2] = unit >> 8;
  }
  return result;
}

/** Character → byte tables, built once per code page from the decoder Node.js already has. */
const tables = new Map<string, Map<string, number>>();

function encodeSingleByte(text: string, encoding: string): Uint8Array {
  const table = tableFor(encoding);
  const result = new Uint8Array(text.length);
  const unknown = new Set<string>();
  let length = 0;
  for (const char of text) {
    const byte = table.get(char);
    if (byte === undefined) unknown.add(char);
    else result[length++] = byte;
  }
  if (unknown.size > 0) {
    const list = [...unknown].map((char) => JSON.stringify(char)).join(", ");
    throw new EncodingError(`${list} cannot be written in ${encoding}`);
  }
  return result.slice(0, length);
}

function tableFor(encoding: string): Map<string, number> {
  const cached = tables.get(encoding);
  if (cached !== undefined) return cached;
  const decoder = new TextDecoder(encoding);
  const table = new Map<string, number>();
  for (let byte = 0; byte < 256; byte++) {
    const char = decoder.decode(Uint8Array.of(byte));
    // Bytes the code page leaves undefined decode to U+FFFD: they map nothing.
    if (char !== "\u{fffd}" && !table.has(char)) table.set(char, byte);
  }
  tables.set(encoding, table);
  return table;
}

function concat(first: Uint8Array, second: Uint8Array): Uint8Array {
  const result = new Uint8Array(first.length + second.length);
  result.set(first);
  result.set(second, first.length);
  return result;
}
