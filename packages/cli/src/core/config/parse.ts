/** What every part of the configuration uses to read untrusted JSON and report what is wrong in it. */

export interface ConfigProblem {
  /** Where the problem is, e.g. "sources[0].format". */
  readonly path: string;
  readonly message: string;
}

/** Thrown by parseConfig, with every problem found in the configuration. */
export class ConfigError extends Error {
  readonly problems: readonly ConfigProblem[];

  constructor(problems: readonly ConfigProblem[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p.path}: ${p.message}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

export type Report = (path: string, message: string) => void;

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function parseString(value: unknown, path: string, report: Report, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (isNonEmptyString(value)) return value;
  report(path, value === undefined ? "is required" : "must be a non-empty string");
  return "";
}

export function parseChoice<T extends string>(
  choices: readonly [T, ...T[]],
  value: unknown,
  path: string,
  report: Report,
  fallback?: T,
): T {
  if (value === undefined && fallback !== undefined) return fallback;
  const choice = choices.find((c) => c === value);
  if (choice !== undefined) return choice;
  report(path, `must be one of ${choices.join(", ")}`);
  return choices[0];
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseBoolean(value: unknown, path: string, report: Report, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  report(path, "must be true or false");
  return fallback;
}

export function parseStringList(value: unknown, path: string, report: Report): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    report(path, "must be a non-empty array of strings");
    return [];
  }
  value.forEach((item: unknown, index) => {
    if (!isNonEmptyString(item)) report(`${path}[${index}]`, "must be a non-empty string");
  });
  return value.filter(isNonEmptyString);
}

export function parseInteger(value: unknown, path: string, report: Report, fallback: number, min?: number): number {
  if (value === undefined) return fallback;
  const valid = typeof value === "number" && Number.isInteger(value) && (min === undefined || value >= min);
  if (valid) return value;
  report(path, min === undefined ? "must be an integer" : `must be an integer greater than or equal to ${min}`);
  return fallback;
}
