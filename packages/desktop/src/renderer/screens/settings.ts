import { ENGINE_TYPES, type EngineStatus, type EngineType, type SettingsView } from "../../shared/bridge.js";
import { api } from "../api.js";
import { busy, byId, h, inside, showError } from "../dom.js";
import { t } from "../i18n/index.js";
import { configuredRoot, currentProject, setProject } from "../state.js";
import { installedModel } from "../view.js";

/** Step 2: the languages, the engine and the instructions, saved in tradforge.config.json. */

/** Models suggested for the engines that do not list theirs. */
const SUGGESTED_MODELS: Readonly<Record<Exclude<EngineType, "ollama">, readonly string[]>> = {
  deepl: ["deepl", "quality_optimized", "prefer_quality_optimized", "latency_optimized"],
  gemini: ["gemini-flash-latest", "gemini-pro-latest"],
  anthropic: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
  "openai-compatible": ["gpt-5-mini", "mistral-small-latest"],
};

/** Waits for typing to pause before asking the engine again. */
const CHECK_DELAY_MS = 400;

const form = byId<HTMLFormElement>("settings-form");
const error = byId("settings-error");
const saved = byId("settings-saved");
const check = byId("engine-check");
const field = (name: string) => inside<HTMLInputElement>(form, `[name="${name}"]`);
const engineField = inside<HTMLSelectElement>(form, '[name="engine"]');
const instructionsField = inside<HTMLTextAreaElement>(form, '[name="instructions"]');

/** Called with the status of the saved engine, for the menu. */
let onEngineStatus: (settings: SettingsView, status: EngineStatus) => void = () => {};
let checkTimer: ReturnType<typeof setTimeout> | undefined;
/** The last check shown, drawn again when the language of the interface changes. */
let lastCheck: { readonly settings: SettingsView; readonly status: EngineStatus } | undefined;

export function setupSettings(engineStatusShown: typeof onEngineStatus): void {
  onEngineStatus = engineStatusShown;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void save();
  });
  const proceed = byId<HTMLButtonElement>("settings-continue");
  proceed.addEventListener("click", () =>
    busy(proceed, async () => {
      if (await save()) window.location.hash = "#translate";
    }),
  );
  engineField.addEventListener("change", () => {
    // Another engine: its own model and address, chosen by its defaults until the user picks some.
    field("model").value = "";
    field("address").value = "";
    showEngineFields();
    scheduleCheck();
  });
  for (const name of ["model", "address"]) field(name).addEventListener("input", scheduleCheck);
  form.addEventListener("input", () => {
    saved.hidden = true;
  });
}

export async function enterSettings(): Promise<void> {
  const root = configuredRoot();
  if (root === undefined) return;
  showError(error, undefined);
  saved.hidden = true;
  try {
    fill(await api.settings(root));
    await runCheck();
  } catch (failure) {
    showError(error, failure);
  }
}

/** The texts that depend on the language and are not static. */
export function translateSettings(): void {
  showEngineFields();
  if (lastCheck !== undefined) showCheck(lastCheck.settings, lastCheck.status);
}

/** Reads the status of the saved engine, for the menu (also when the settings screen is not shown). */
export async function refreshEngineStatus(): Promise<void> {
  const root = configuredRoot();
  if (root === undefined) return;
  const settings = await api.settings(root);
  onEngineStatus(settings, await api.engineStatus(root, settings));
}

function fill(settings: SettingsView): void {
  field("sourceLanguage").value = settings.sourceLanguage;
  field("targetLanguage").value = settings.targetLanguage;
  engineField.value = settings.engine;
  field("model").value = settings.model;
  field("address").value = settings.address;
  instructionsField.value = settings.instructions;
  showEngineFields();
}

function read(): SettingsView {
  const engine = ENGINE_TYPES.find((type) => type === engineField.value) ?? "ollama";
  return {
    sourceLanguage: field("sourceLanguage").value,
    targetLanguage: field("targetLanguage").value,
    engine,
    model: field("model").value,
    address: field("address").value,
    instructions: instructionsField.value,
  };
}

async function save(): Promise<boolean> {
  const root = configuredRoot();
  if (root === undefined) return false;
  showError(error, undefined);
  try {
    const settings = await api.saveSettings(root, read());
    fill(settings);
    saved.hidden = false;
    // The project screen shows the languages: read the project again.
    const project = currentProject();
    if (project !== undefined) {
      const reopened = await api.open(root, project.sourceLanguage, project.targetLanguage);
      setProject(project.file === undefined ? reopened : { ...reopened, file: project.file });
    }
    onEngineStatus(settings, await api.engineStatus(root, settings));
    return true;
  } catch (failure) {
    showError(error, failure);
    return false;
  }
}

function showEngineFields(): void {
  const engine = read().engine;
  const address = inside<HTMLLabelElement>(form, ".address");
  const hasAddress = engine === "ollama" || engine === "openai-compatible";
  address.hidden = !hasAddress;
  byId("address-label").textContent = engine === "ollama" ? t().ollamaAddress : t().apiAddress;
  field("address").placeholder = engine === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1";
  field("model").placeholder = engine === "ollama" ? "mistral-small" : engine === "deepl" ? "deepl" : "";
  if (engine !== "ollama") suggest(SUGGESTED_MODELS[engine]);
}

function suggest(models: readonly string[]): void {
  byId("model-suggestions").replaceChildren(...models.map((model) => h("option", { value: model })));
}

function scheduleCheck(): void {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => void runCheck(), CHECK_DELAY_MS);
}

async function runCheck(): Promise<void> {
  const root = configuredRoot();
  if (root === undefined) return;
  const settings = read();
  showCheck(settings, await api.engineStatus(root, settings));
}

function showCheck(settings: SettingsView, status: EngineStatus): void {
  lastCheck = { settings, status };
  const messages = t();
  const [dot, text] = [inside(check, ".status-dot"), inside(check, "span:last-child")];
  const model = settings.model || (settings.engine === "ollama" ? "mistral-small" : "");
  let ready = status.ready;
  let message: string;
  if (status.kind === "ollama") {
    if (!status.ready) {
      message =
        status.httpStatus !== undefined
          ? messages.ollamaError(status.host, status.httpStatus)
          : messages.ollamaDown(status.host);
    } else {
      suggest(status.models);
      ready = installedModel(model, status.models);
      message = ready ? messages.ollamaReady(model) : messages.ollamaMissingModel(model);
    }
  } else {
    message = status.ready ? messages.apiKeyFound(status.keyVariable) : messages.apiKeyMissing(status.keyVariable);
  }
  dot.classList.toggle("ready", ready);
  dot.classList.toggle("problem", !ready);
  text.textContent = message;
}
