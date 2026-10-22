import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./theme.css";
import "./screens.css";
import type { EngineStatus, SettingsView } from "../shared/bridge.js";
import { api } from "./api.js";
import { byId, h, inside } from "./dom.js";
import { UI_LANGUAGES } from "./i18n/catalog.js";
import { currentLanguage, onLanguageChange, setLanguage, startLanguage, t } from "./i18n/index.js";
import { setupBuild, translateBuild } from "./screens/build.js";
import { enterProject, render as renderProject, setupProject } from "./screens/project.js";
import { enterReview, render as renderReview, setupReview } from "./screens/review.js";
import { enterSettings, refreshEngineStatus, setupSettings, translateSettings } from "./screens/settings.js";
import { enterTranslate, setupTranslate, translateTranslate } from "./screens/translate.js";
import { configuredRoot, currentProject, onProjectChange } from "./state.js";
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
    h("p", {}, t().needsProject),
    h("a", { class: "button dark", href: "#project" }, t().chooseProject),
  );
  for (const child of section.children) {
    if (child instanceof HTMLElement && !child.matches(".screen-header, .needs-project")) child.hidden = missing;
  }
}

/** The engine in the menu, kept to be worded again in another language. */
let engineShown: { readonly settings: SettingsView; readonly status: EngineStatus } | undefined;

function showEngineStatus(settings: SettingsView, status: EngineStatus): void {
  engineShown = { settings, status };
  drawEngineStatus();
}

function drawEngineStatus(): void {
  const line = byId("engine-status");
  const text = inside(line, "span:last-child");
  const dot = inside(line, ".status-dot");
  if (engineShown === undefined || configuredRoot() === undefined) {
    dot.classList.remove("ready", "problem");
    text.textContent = t().noProject;
    return;
  }
  const { settings, status } = engineShown;
  const messages = t();
  const name = engineLabel(settings.engine, messages.openAiCompatible);
  const word =
    status.kind === "ollama"
      ? status.ready
        ? messages.menuReady
        : messages.menuDown
      : status.ready
        ? messages.menuKey
        : messages.menuNoKey;
  dot.classList.toggle("ready", status.ready);
  dot.classList.toggle("problem", !status.ready);
  text.textContent = word(name, settings.model);
}

function setupLanguageMenu(): void {
  const select = byId<HTMLSelectElement>("ui-language");
  select.replaceChildren(
    ...UI_LANGUAGES.map((language) => h("option", { value: language.code, lang: language.code }, language.name)),
  );
  select.value = currentLanguage();
  select.addEventListener("change", () => {
    const chosen = UI_LANGUAGES.find((language) => language.code === select.value);
    if (chosen !== undefined) setLanguage(chosen.code);
  });
}

startLanguage();
setupLanguageMenu();
setupProject();
setupSettings(showEngineStatus);
setupTranslate();
setupReview();
setupBuild();

onProjectChange((project) => {
  renderProject(project);
  if (project?.configured === true) void refreshEngineStatus().catch(() => {});
  drawEngineStatus();
});

// Another language: the static texts are already done (i18n/index.ts); each screen words its own texts again.
onLanguageChange(() => {
  renderProject(currentProject());
  for (const section of document.querySelectorAll<HTMLElement>("section[data-step]")) {
    if (section.dataset.step !== "project") showNeedsProject(section);
  }
  translateSettings();
  translateTranslate();
  if (configuredRoot() !== undefined) renderReview();
  translateBuild();
  drawEngineStatus();
});

window.addEventListener("hashchange", () => show(stepFromHash(window.location.hash)));
show(stepFromHash(window.location.hash));
drawEngineStatus();

void api.version().then((number) => {
  byId("version").textContent = `tradforge ${number}`;
});
