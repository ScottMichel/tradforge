import { deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * A small ZIP reader and writer, enough for office documents (.docx, .pptx, .xlsx, .odt are ZIP archives of XML).
 * Entries are stored or deflated; ZIP64 archives and encrypted entries are refused. The writer copies an unchanged
 * entry exactly as it was compressed, so that a document keeps every part tradforge does not translate byte for byte.
 */

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

export interface ZipEntry {
  readonly name: string;
  /** 0: stored, 8: deflated. */
  readonly method: number;
  /** MS-DOS date and time of the last change. */
  readonly date: number;
  readonly time: number;
  readonly crc: number;
  readonly size: number;
  /** The data as it is stored in the archive. */
  readonly compressed: Uint8Array;
  readonly externalAttributes: number;
  /** The data, inflated and checked. */
  readonly data: () => Uint8Array;
}

/** A new or changed entry, or an entry copied as it is. */
export type ZipInput =
  | {
      readonly name: string;
      readonly data: Uint8Array;
      readonly compress: boolean;
      /** Kept from the source entry; new entries get 1980-01-01, so that a rebuild gives the same bytes. */
      readonly modified?: { readonly date: number; readonly time: number };
    }
  | { readonly raw: ZipEntry };

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
/** 1980-01-01 00:00, the first date ZIP can write. */
const EPOCH = { date: (0 << 9) | (1 << 5) | 1, time: 0 };
const UTF8_NAMES = 1 << 11;

export function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEnd(view);
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === 0xffffffff || directorySize === 0xffffffff) {
    throw new ZipError("ZIP64 archives are not supported");
  }

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL) {
      throw new ZipError("corrupted archive (bad central directory)");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const time = view.getUint16(offset + 12, true);
    const date = view.getUint16(offset + 14, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if ((flags & 1) !== 0) throw new ZipError(`${name}: encrypted entries are not supported`);
    if (method !== 0 && method !== 8) throw new ZipError(`${name}: compression method ${method} is not supported`);
    if (view.getUint32(localOffset, true) !== LOCAL)
      throw new ZipError(`${name}: corrupted archive (bad local header)`);
    const dataStart =
      localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    const data = () => {
      const inflated = method === 8 ? new Uint8Array(inflateRawSync(compressed)) : compressed;
      if (crc32(inflated) !== crc) throw new ZipError(`${name}: corrupted (CRC mismatch)`);
      return inflated;
    };
    entries.push({ name, method, date, time, crc, size, compressed, externalAttributes, data });
  }
  return entries;
}

/** The end of central directory record: the last 22 bytes, or a little before when the archive has a comment. */
function findEnd(view: DataView): number {
  const last = view.byteLength - 22;
  for (let offset = last; offset >= Math.max(0, last - 0xffff); offset--) {
    if (view.getUint32(offset, true) === END) return offset;
  }
  throw new ZipError("not a ZIP archive (no end of central directory)");
}

export function writeZip(inputs: readonly ZipInput[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const input of inputs) {
    const entry = "raw" in input ? input.raw : prepare(input);
    const name = new TextEncoder().encode(entry.name);
    const flags = /^[\x20-\x7e]*$/.test(entry.name) ? 0 : UTF8_NAMES;
    const version = entry.method === 8 ? 20 : 10;

    const local = new Uint8Array(30 + name.length);
    const header = new DataView(local.buffer);
    header.setUint32(0, LOCAL, true);
    header.setUint16(4, version, true);
    header.setUint16(6, flags, true);
    header.setUint16(8, entry.method, true);
    header.setUint16(10, entry.time, true);
    header.setUint16(12, entry.date, true);
    header.setUint32(14, entry.crc, true);
    header.setUint32(18, entry.compressed.length, true);
    header.setUint32(22, entry.size, true);
    header.setUint16(26, name.length, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const record = new DataView(central.buffer);
    record.setUint32(0, CENTRAL, true);
    record.setUint16(4, version, true);
    record.setUint16(6, version, true);
    record.setUint16(8, flags, true);
    record.setUint16(10, entry.method, true);
    record.setUint16(12, entry.time, true);
    record.setUint16(14, entry.date, true);
    record.setUint32(16, entry.crc, true);
    record.setUint32(20, entry.compressed.length, true);
    record.setUint32(24, entry.size, true);
    record.setUint16(28, name.length, true);
    record.setUint32(38, entry.externalAttributes, true);
    record.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, entry.compressed);
    centrals.push(central);
    offset += local.length + entry.compressed.length;
  }
  const directorySize = centrals.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const record = new DataView(end.buffer);
  record.setUint32(0, END, true);
  record.setUint16(8, inputs.length, true);
  record.setUint16(10, inputs.length, true);
  record.setUint32(12, directorySize, true);
  record.setUint32(16, offset, true);
  return concat([...locals, ...centrals, end]);
}

function prepare(input: Extract<ZipInput, { data: Uint8Array }>): Omit<ZipEntry, "data"> {
  const compressed = input.compress ? new Uint8Array(deflateRawSync(input.data)) : input.data;
  const { date, time } = input.modified ?? EPOCH;
  return {
    name: input.name,
    method: input.compress ? 8 : 0,
    date,
    time,
    crc: crc32(input.data),
    size: input.data.length,
    compressed,
    externalAttributes: 0,
  };
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_unused, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** The CRC-32 that ZIP uses to check every entry. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
