import type { ErrorView, Outcome, Requests } from "../shared/bridge.js";

/** A request the main process refused: its code, worded by the page in the language of the interface. */
export class Failure extends Error {
  constructor(readonly view: ErrorView) {
    super(view.detail ?? view.code);
    this.name = "Failure";
  }
}

async function unwrap<T>(outcome: Promise<Outcome<T>>): Promise<T> {
  const answer = await outcome;
  if (!answer.ok) throw new Failure(answer.error);
  return answer.value;
}

const bridge = () => window.tradforge;

/** The requests of the bridge, answering their value or throwing a Failure. */
export const api: Requests = {
  version: () => unwrap(bridge().version()),
  choose: (kind, title) => unwrap(bridge().choose(kind, title)),
  open: (path, from, to) => unwrap(bridge().open(path, from, to)),
  createProject: (path, from, to, chosen) => unwrap(bridge().createProject(path, from, to, chosen)),
  settings: (root) => unwrap(bridge().settings(root)),
  saveSettings: (root, settings) => unwrap(bridge().saveSettings(root, settings)),
  engineStatus: (root, settings) => unwrap(bridge().engineStatus(root, settings)),
  translate: (root, retryFailed) => unwrap(bridge().translate(root, retryFailed)),
  stopTranslation: () => unwrap(bridge().stopTranslation()),
  entries: (root) => unwrap(bridge().entries(root)),
  review: (root, source, target) => unwrap(bridge().review(root, source, target)),
  build: (root, force) => unwrap(bridge().build(root, force)),
};
