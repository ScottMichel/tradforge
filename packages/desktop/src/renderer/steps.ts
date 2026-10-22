/** The four screens, in the order a translation goes through them. */
export const STEPS = ["project", "settings", "translate", "review"] as const;

export type Step = (typeof STEPS)[number];

function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value);
}

/** The step named by the address (#settings), so that reloading the page keeps the screen. */
export function stepFromHash(hash: string): Step {
  const name = hash.replace(/^#/, "");
  return isStep(name) ? name : "project";
}
