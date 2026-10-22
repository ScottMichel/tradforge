/**
 * Builds elements with text only (textContent, never innerHTML): a text read from a translated file can never
 * become markup, so a file cannot inject anything into the page.
 */

type Child = Node | string | false | undefined;
type Attributes = Readonly<Record<string, string | boolean | undefined>>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === true) element.setAttribute(name, "");
    else if (typeof value === "string") element.setAttribute(name, value);
  }
  for (const child of children) {
    if (child !== false && child !== undefined) element.append(child);
  }
  return element;
}

/** The element with this id; the page is static, so a missing one is a bug. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`#${id} is missing from the page`);
  return element as T;
}

/** The first element matching the selector inside a parent. */
export function inside<T extends Element = HTMLElement>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T & Element>(selector);
  if (element === null) throw new Error(`${selector} is missing from the page`);
  return element;
}

/** Shows the message of an error in a paragraph, or hides it. */
export function showError(paragraph: HTMLElement, error: unknown): void {
  paragraph.textContent = error === undefined ? "" : error instanceof Error ? error.message : String(error);
  paragraph.hidden = error === undefined;
}

/** Disables a button while its action runs, so that a double click never runs it twice. */
export async function busy<T>(button: HTMLButtonElement, action: () => Promise<T>): Promise<T> {
  button.disabled = true;
  try {
    return await action();
  } finally {
    button.disabled = false;
  }
}
