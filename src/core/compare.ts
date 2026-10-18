/** Locale-independent order (UTF-16 code units): same result on every machine. */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
