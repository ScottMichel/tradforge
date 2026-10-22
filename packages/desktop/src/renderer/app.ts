import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./theme.css";
import "./screens.css";
import type { EngineStatus, SettingsView } from "../shared/bridge.js";
import { byId, h, inside } from "./dom.js";
import { setupBuild } from "./screens/build.js";
import { enterProject, render as renderProject, setupProject } from "./screens/project.js";
import { enterReview, setupReview } from "./screens/review.js";
import { enterSettings, refreshEngineStatus, setupSettings } from "./screens/settings.js";
import { enterTranslate, setupTranslate } from "./screens/translate.js";
import { configuredRoot, onProjectChange } from "./state.js";
import { type Step, stepFromHash } from "./steps.js";
import { engineLabel } from "./view.js";

const ENTER: Readonly<Record<Step, () => Promise<void>>> = {
  project: enterProject,
  settings: enterSettings,
  translate: enterTranslate,
  review: enterReview,
};

/** Shows one screen and marks its step in the menu; the others stay in the page, hidden. */
function show(step: Step): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-step]")) {
    if (link.dataset.step === step) link.setAttribute("aria-current", "step");
    else link.removeAttribute("aria-current");
  }
  for (const section of document.querySelectorAll<HTMLElement>("section[data-step]")) {
    section.hidden = section.dataset.step !== step;
    if (section.dataset.step !== "project") showNeedsProject(section);
  }
  void ENTER[step]();
}

/** The steps after the first one work on a project: without one, they say so instead of showing empty forms. */
function showNeedsProject(section: HTMLElement): void {
  const missing = configuredRoot() === undefined;
  const notice = inside(section, ".needs-project");
  notice.hidden = !missing;
  notice.replaceChildren(
    h("p", {}, "Ouvre d'abord un projet."),
    h("a", { class: "button dark", href: "#project" }, "Choisir un dossier"),
  );
  for (const child of section.children) {
    if (child instanceof HTMLElement && !child.matches(".screen-header, .needs-project")) child.hidden = missing;
  }
}

function showEngineStatus(settings: SettingsView, status: EngineStatus): void {
  const line = byId("engine-status");
  inside(line, ".status-dot").classList.toggle("ready", status.ready);
  inside(line, ".status-dot").classList.toggle("problem", !status.ready);
  const state =
    status.kind === "ollama" ? (status.ready ? "prêt" : "ne répond pas") : status.ready ? "clé trouvée" : "pas de clé";
  inside(line, "span:last-child").textContent = `${engineLabel(settings.engine)} ${state} · ${settings.model}`;
}

setupProject();
setupSettings(showEngineStatus);
setupTranslate();
setupReview();
setupBuild();

onProjectChange((project) => {
  renderProject(project);
  if (project?.configured === true) void refreshEngineStatus().catch(() => {});
  else inside(byId("engine-status"), "span:last-child").textContent = "Aucun projet ouvert";
});

window.addEventListener("hashchange", () => show(stepFromHash(window.location.hash)));
show(stepFromHash(window.location.hash));

void window.tradforge.version().then((number) => {
  byId("version").textContent = `tradforge ${number}`;
});
