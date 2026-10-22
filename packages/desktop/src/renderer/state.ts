import type { ProjectView } from "../shared/bridge.js";
import { samePath } from "./view.js";

/** What the screens share: the open project. Each screen reads the rest again from the main process when shown. */

let project: ProjectView | undefined;
const listeners = new Set<(project: ProjectView | undefined) => void>();

export function currentProject(): ProjectView | undefined {
  return project;
}

/** The root of a project that has its configuration: the steps after the first one need it. */
export function configuredRoot(): string | undefined {
  return project?.configured === true ? project.root : undefined;
}

export function setProject(next: ProjectView | undefined): void {
  project = next;
  for (const listener of listeners) listener(project);
}

export function onProjectChange(listener: (project: ProjectView | undefined) => void): void {
  listeners.add(listener);
}

const RECENT_KEY = "tradforge.recent";
const MAX_RECENT = 5;

/** Recently opened folders, kept in this computer's browser storage: a convenience, never needed. */
export function recentFolders(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function rememberFolder(root: string): void {
  const recent = [root, ...recentFolders().filter((folder) => !samePath(folder, root))].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    // Storage refused (private mode, full): the list is only a convenience.
  }
}
