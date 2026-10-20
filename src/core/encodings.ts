/** Encodings tradforge can write. The conversion itself lives in src/storage/encoding.ts. */
export const TEXT_ENCODINGS = [
  "utf-8",
  "utf-8-bom",
  "utf-16le",
  "windows-1250",
  "windows-1251",
  "windows-1252",
  "windows-1253",
  "windows-1254",
  "windows-1257",
  "iso-8859-1",
  "iso-8859-2",
  "iso-8859-15",
  "koi8-r",
  "koi8-u",
] as const;
export type TextEncoding = (typeof TEXT_ENCODINGS)[number];

/** Reading also accepts "auto": byte order mark, then valid UTF-8, then Windows-1252. */
export const INPUT_ENCODINGS = ["auto", ...TEXT_ENCODINGS] as const;
export type InputEncoding = (typeof INPUT_ENCODINGS)[number];
