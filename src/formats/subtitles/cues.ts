/** The two subtitle dialects: SubRip (.srt) and WebVTT (.vtt). */
export type SubtitleDialect = "srt" | "vtt";

/** One subtitle: when it is shown, and where its text sits in the file. */
export interface Cue {
  /** 1-based position of the cue in the file. */
  readonly index: number;
  /** The SRT cue number or the WebVTT cue identifier, as written (cue numbers are not always in order). */
  readonly id?: string;
  readonly startMs: number;
  readonly endMs: number;
  /** The text lines, joined with "\n", without the spaces at the end of each line. */
  readonly text: string;
  /** 1-based line of the first text line. */
  readonly line: number;
  /** Offsets of the text in the content: from the start of its first line to the end of its last (line ending excluded). */
  readonly textStart: number;
  readonly textEnd: number;
}

/** The content is not a valid subtitle file. */
export class SubtitleSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubtitleSyntaxError";
  }
}

interface Line {
  readonly text: string;
  readonly start: number;
  /** End of the text, line ending excluded. */
  readonly end: number;
}

// Hours are optional in WebVTT; SRT uses a comma before the milliseconds, WebVTT a dot (both are accepted).
const TIMESTAMP = String.raw`(?:\d+:)?\d{1,2}:\d{2}[,.]\d{1,3}`;
const TIMESTAMP_PARTS = /^(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/;
// "start --> end", then optional cue settings (WebVTT "align:start", SRT "X1:100 ...").
const TIMING = new RegExp(String.raw`^\s*(${TIMESTAMP})\s*-->\s*(${TIMESTAMP})(?:\s.*)?$`);
const VTT_HEADER = /^WEBVTT(?:[ \t].*)?$/;
// Blocks that hold no text to translate. "NOTE:" in a cue text is not one: the keyword must stand alone.
const VTT_BLOCK = /^(?:NOTE|STYLE|REGION)(?:[ \t]|$)/;
const CUE_NUMBER = /^\s*\d+\s*$/;

/** A timestamp ("00:00:01,500", "01:02.250") in milliseconds, or undefined. */
export function parseTimestamp(value: string): number | undefined {
  const match = TIMESTAMP_PARTS.exec(value.trim());
  if (match === null) return undefined;
  const [, hours = "0", minutes = "0", seconds = "0", fraction = "0"] = match;
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(fraction.padEnd(3, "0"));
}

/**
 * Every cue of a subtitle file (without its byte order mark), with the offsets of its text.
 * Tolerant, as real files are: any line ending, extra blank lines, cue numbers in any order or missing,
 * and a missing blank line before the next cue.
 */
export function parseCues(content: string, dialect: SubtitleDialect): Cue[] {
  const lines = splitLines(content);
  let i = 0;
  if (dialect === "vtt") {
    if (!VTT_HEADER.test(lines[0]?.text ?? ""))
      throw new SubtitleSyntaxError("missing the WEBVTT header on the first line");
    i = skipBlock(lines, 0);
  }

  const cues: Cue[] = [];
  while (i < lines.length) {
    const line = lines[i]?.text ?? "";
    if (isBlank(line)) {
      i++;
      continue;
    }
    if (dialect === "vtt" && VTT_BLOCK.test(line)) {
      i = skipBlock(lines, i);
      continue;
    }

    // The timing line, with the cue number or identifier just before it if there is one.
    const timingAt = isTiming(lines[i]) ? i : isTiming(lines[i + 1]) ? i + 1 : undefined;
    if (timingAt === undefined) {
      i++; // a stray line, outside any cue: left as it is
      continue;
    }
    const id = timingAt > i ? line.trim() : undefined;
    const timing = TIMING.exec(lines[timingAt]?.text ?? "");
    const startMs = parseTimestamp(timing?.[1] ?? "") ?? 0;
    const endMs = parseTimestamp(timing?.[2] ?? "") ?? 0;

    let end = timingAt + 1;
    while (end < lines.length && !endsText(lines, end)) end++;
    const textLines = lines.slice(timingAt + 1, end);
    const first = textLines[0];
    const last = textLines.at(-1);
    const textStart = first?.start ?? lines[timingAt + 1]?.start ?? content.length;

    cues.push({
      index: cues.length + 1,
      ...(id !== undefined ? { id } : {}),
      startMs,
      endMs,
      text: textLines.map((textLine) => textLine.text.trimEnd()).join("\n"),
      line: timingAt + 2,
      textStart,
      textEnd: last?.end ?? textStart,
    });
    i = end;
  }

  if (cues.length === 0 && dialect === "srt" && lines.some((l) => !isBlank(l.text))) {
    throw new SubtitleSyntaxError(
      "no subtitle cue found (a cue needs a timing line like 00:00:01,000 --> 00:00:02,000)",
    );
  }
  return cues;
}

/** The text of a cue ends at a blank line, at the next timing line, or at the cue number just before it. */
function endsText(lines: readonly Line[], at: number): boolean {
  const text = lines[at]?.text ?? "";
  return isBlank(text) || isTiming(lines[at]) || (CUE_NUMBER.test(text) && isTiming(lines[at + 1]));
}

/** The index of the first line after the block that starts at `from` (blocks end at a blank line). */
function skipBlock(lines: readonly Line[], from: number): number {
  let i = from;
  while (i < lines.length && !isBlank(lines[i]?.text ?? "")) i++;
  return i;
}

function isTiming(line: Line | undefined): boolean {
  return line !== undefined && TIMING.test(line.text);
}

function isBlank(text: string): boolean {
  return text.trim() === "";
}

function splitLines(content: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const match of content.matchAll(/\r\n|\r|\n/g)) {
    lines.push({ text: content.slice(start, match.index), start, end: match.index });
    start = match.index + match[0].length;
  }
  lines.push({ text: content.slice(start), start, end: content.length });
  return lines;
}
