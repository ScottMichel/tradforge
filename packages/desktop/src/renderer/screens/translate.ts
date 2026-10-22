import type { ProgressView, ProjectStats, TranslationResult } from "../../shared/bridge.js";
import { byId, h, showError } from "../dom.js";
import { configuredRoot, currentProject, setProject } from "../state.js";
import { count, duration, engineLabel, plural } from "../view.js";

/** Step 3: translate what the memory does not have yet, with a live progress, and stop at any time. */

const stats = byId("translate-stats");
const engine = byId("translate-engine");
const progressBlock = byId("progress-block");
const progress = byId<HTMLProgressElement>("progress");
const progressText = byId("progress-text");
const result = byId("translate-result");
const error = byId("translate-error");
const retry = byId<HTMLInputElement>("retry-failed");
const start = byId<HTMLButtonElement>("translate-start");
const stop = byId<HTMLButtonElement>("translate-stop");

let running = false;

export function setupTranslate(): void {
  window.tradforge.onProgress(showProgress);
  start.addEventListener("click", () => void run());
  stop.addEventListener("click", () => {
    stop.disabled = true;
    stop.textContent = "Arrêt après le lot en cours…";
    void window.tradforge.stopTranslation();
  });
}

export async function enterTranslate(): Promise<void> {
  if (running) return; // the screen already shows the run
  const root = configuredRoot();
  if (root === undefined) return;
  showError(error, undefined);
  try {
    const project = await window.tradforge.openFolder(root, "", "");
    setProject(project);
    showStats(project.stats);
    const settings = await window.tradforge.settings(root);
    engine.textContent = `Moteur : ${engineLabel(settings.engine)} · ${settings.model}`;
  } catch (failure) {
    showError(error, failure);
  }
}

async function run(): Promise<void> {
  const root = configuredRoot();
  if (root === undefined || running) return;
  running = true;
  showError(error, undefined);
  result.textContent = "";
  start.hidden = true;
  retry.disabled = true;
  stop.hidden = false;
  stop.disabled = false;
  stop.textContent = "Arrêter";
  progressBlock.hidden = false;
  progress.value = 0;
  progressText.textContent = "Préparation…";
  try {
    showResult(await window.tradforge.translate(root, retry.checked));
  } catch (failure) {
    showError(error, failure);
  } finally {
    running = false;
    start.hidden = false;
    retry.disabled = false;
    stop.hidden = true;
    progressBlock.hidden = true;
    const project = currentProject();
    if (project !== undefined) {
      const updated = await window.tradforge.openFolder(root, "", "").catch(() => project);
      setProject(updated);
      showStats(updated.stats);
    }
  }
}

function showProgress(event: ProgressView): void {
  progress.max = Math.max(event.total, 1);
  progress.value = event.done;
  const left = event.remainingMs !== undefined && event.done < event.total ? ` · ${duration(event.remainingMs)}` : "";
  const failed = event.failed > 0 ? ` · ${plural(event.failed, "échec")}` : "";
  const wait =
    event.waitMs !== undefined ? ` · le moteur demande de ralentir, pause de ${Math.ceil(event.waitMs / 1000)} s` : "";
  progressText.textContent = `${count(event.done)} sur ${plural(event.total, "texte")}${failed}${left}${wait}`;
}

function showResult(summary: TranslationResult): void {
  if (summary.total === 0) {
    result.textContent = retry.checked
      ? "Rien à traduire : tous les textes ont une traduction."
      : "Rien à traduire. Coche « Réessayer les échecs » pour reprendre ceux qui ont échoué.";
    return;
  }
  const reused = summary.reused > 0 ? ` (dont ${count(summary.reused)} repris d'un texte presque identique)` : "";
  const failed =
    summary.failed > 0 ? ` ${count(summary.failed)} en échec : corrige-les dans la relecture, ou réessaie-les.` : "";
  result.textContent = summary.interrupted
    ? `Arrêté : ${plural(summary.translated, "texte traduit", "textes traduits")}, tout est enregistré. Relance pour continuer.`
    : `Terminé : ${plural(summary.translated, "texte traduit", "textes traduits")}${reused}.${failed}`;
}

function showStats(values: ProjectStats | undefined): void {
  if (values === undefined) return;
  const card = (label: string, value: number, tone = "") =>
    h(
      "div",
      { class: `stat ${tone}` },
      h("p", { class: "stat-value" }, count(value)),
      h("p", { class: "muted" }, label),
    );
  stats.replaceChildren(
    card("textes dans le projet", values.total),
    card("traduits", values.translated, "good"),
    card("à traduire", values.pending),
    card("en échec", values.failed, values.failed > 0 ? "bad" : ""),
  );
}
