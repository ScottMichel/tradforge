/** An explicit locale: the same output on every machine, whatever its language settings. */
const counts = new Intl.NumberFormat("en-US");

/** 98000 → "98,000". */
export function formatCount(value: number): string {
  return counts.format(value);
}

/** 45 s, 12 min, 1 h 05 min. Precise enough for an estimate. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours} h ${minutes} min`;
}

/** "1 file", "3 files". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : pluralForm}`;
}

/** A text shown in a report: quoted and escaped, so that line breaks and spaces stay visible. */
export function quote(text: string): string {
  return JSON.stringify(text);
}
