import type { ProgressView, ProjectStats, TranslationResult } from "../../shared/bridge.js";
import { api } from "../api.js";
import { byId, h, showError } from "../dom.js";
import { number } from "../i18n/format.js";
import { t } from "../i18n/index.js";
import { configuredRoot, currentProject, setProject } from "../state.js";
import { engineLabel } from "../view.js";

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
let stopping = false;
/** What the screen shows, kept to draw it again in another language. */
let lastProgress: ProgressView | undefined;
let lastResult: TranslationResult | undefined;
let lastEngine: { readonly engine: Parameters<typeof engineLabel>[0]; readonly model: string } | undefined;

export function setupTranslate(): void {
  window.tradforge.onProgress((event) => {
    lastProgress = event;
    showProgress();
  });
  start.addEventListener("click", () => void run());
  stop.addEventListener("click", () => {
    stopping = true;
    stop.disabled = true;
    stop.textContent = t().stopping;
    void api.stopTranslation();
  });
}

export async function enterTranslate(): Promise<void> {
  if (running) return; // the screen already shows the run
  const root = configuredRoot();
  if (root === undefined) return;
  showError(error, undefined);
  try {
    await reloadProject(root);
    const settings = await api.settings(root);
    lastEngine = { engine: settings.engine, model: settings.model };
    translateTranslate();
  } catch (failure) {
    showError(error, failure);
  }
}

/** The texts that depend on the language and are not static. */
export function translateTranslate(): void {
  if (lastEngine !== undefined) {
    engine.textContent = t().engineLine(engineLabel(lastEngine.engine, t().openAiCompatible), lastEngine.model);
  }
  showStats(currentProject()?.stats);
  stop.textContent = stopping ? t().stopping : t().stop;
  if (running) showProgress();
  if (lastResult !== undefined) showResult(lastResult);
}

async function reloadProject(root: string): Promise<void> {
  const project = currentProject();
  const reopened = await api.open(root, "", "");
  setProject(project?.file === undefined ? reopened : { ...reopened, file: project.file });
  showStats(reopened.stats);
}

async function run(): Promise<void> {
  const root = configuredRoot();
  if (root === undefined || running) return;
  running = true;
  stopping = false;
  lastProgress = undefined;
  lastResult = undefined;
  showError(error, undefined);
  result.textContent = "";
  start.hidden = true;
  retry.disabled = true;
  stop.hidden = false;
  stop.disabled = false;
  stop.textContent = t().stop;
  progressBlock.hidden = false;
  progress.value = 0;
  progressText.textContent = t().preparing;
  try {
    lastResult = await api.translate(root, retry.checked);
    showResult(lastResult);
  } catch (failure) {
    showError(error, failure);
  } finally {
    running = false;
    start.hidden = false;
    retry.disabled = false;
    stop.hidden = true;
    progressBlock.hidden = true;
    await reloadProject(root).catch(() => {});
  }
}

function showProgress(): void {
  const event = lastProgress;
  if (event === undefined) return;
  const messages = t();
  progress.max = Math.max(event.total, 1);
  progress.value = event.done;
  const parts = [messages.progress(event.done, event.total)];
  if (event.failed > 0) parts.push(messages.progressFailed(event.failed));
  if (event.remainingMs !== undefined && event.done < event.total) parts.push(messages.duration(event.remainingMs));
  if (event.waitMs !== undefined) parts.push(messages.slowDown(Math.ceil(event.waitMs / 1000)));
  progressText.textContent = parts.join(" · ");
}

function showResult(summary: TranslationResult): void {
  const messages = t();
  if (summary.total === 0) {
    const failures = currentProject()?.stats?.failed ?? 0;
    result.textContent =
      failures > 0 && !retry.checked ? messages.nothingNewRetry(failures) : messages.nothingToTranslate;
    return;
  }
  if (summary.interrupted) {
    result.textContent = messages.stopped(summary.translated);
    return;
  }
  const reused = summary.reused > 0 ? messages.reused(summary.reused) : "";
  const failed = summary.failed > 0 ? messages.doneFailed(summary.failed) : "";
  result.textContent = messages.done(summary.translated, reused) + failed;
}

function showStats(values: ProjectStats | undefined): void {
  if (values === undefined) return;
  const messages = t();
  const card = (label: string, value: number, tone = "") =>
    h(
      "div",
      { class: `stat ${tone}` },
      h("p", { class: "stat-value" }, number(value)),
      h("p", { class: "muted" }, label),
    );
  stats.replaceChildren(
    card(messages.statTotal, values.total),
    card(messages.statTranslated, values.translated, "good"),
    card(messages.statPending, values.pending),
    card(messages.statFailed, values.failed, values.failed > 0 ? "bad" : ""),
  );
}
