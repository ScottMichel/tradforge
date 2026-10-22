import { ENGINE_TYPES, type EngineStatus, type EngineType, type SettingsView } from "../../shared/bridge.js";
import { busy, byId, h, inside, showError } from "../dom.js";
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

const ADDRESS_LABELS: Partial<Record<EngineType, string>> = {
  ollama: "Adresse d'Ollama",
  "openai-compatible": "Adresse de l'API",
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
    fill(await window.tradforge.settings(root));
    await runCheck();
  } catch (failure) {
    showError(error, failure);
  }
}

/** Reads the status of the saved engine, for the menu (also when the settings screen is not shown). */
export async function refreshEngineStatus(): Promise<void> {
  const root = configuredRoot();
  if (root === undefined) return;
  const settings = await window.tradforge.settings(root);
  onEngineStatus(settings, await window.tradforge.engineStatus(root, settings));
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
    const settings = await window.tradforge.saveSettings(root, read());
    fill(settings);
    saved.hidden = false;
    // The project screen shows the languages: read the project again.
    const project = currentProject();
    if (project !== undefined) {
      setProject(await window.tradforge.openFolder(root, project.sourceLanguage, project.targetLanguage));
    }
    onEngineStatus(settings, await window.tradforge.engineStatus(root, settings));
    return true;
  } catch (failure) {
    showError(error, failure);
    return false;
  }
}

function showEngineFields(): void {
  const engine = read().engine;
  const label = ADDRESS_LABELS[engine];
  const address = inside<HTMLLabelElement>(form, ".address");
  address.hidden = label === undefined;
  if (label !== undefined) address.firstChild?.replaceWith(`${label} `);
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
  showCheck(settings, await window.tradforge.engineStatus(root, settings));
}

function showCheck(settings: SettingsView, status: EngineStatus): void {
  const [dot, text] = [inside(check, ".status-dot"), inside(check, "span:last-child")];
  const model = settings.model || (settings.engine === "ollama" ? "mistral-small" : "");
  let ready = status.ready;
  let message: string;
  if (status.kind === "ollama") {
    if (!status.ready) {
      message = `${status.message} Lance Ollama (https://ollama.com), puis reviens ici.`;
    } else {
      suggest(status.models);
      if (installedModel(model, status.models)) {
        message = `Ollama est prêt, ${model} est installé.`;
      } else {
        ready = false;
        message = `Ollama est prêt, mais ${model} n'est pas installé : lance « ollama pull ${model} » ou choisis un modèle installé.`;
      }
    }
  } else if (status.ready) {
    message = `Clé d'API trouvée dans la variable ${status.keyVariable}.`;
  } else {
    message =
      `Aucune clé d'API : crée la variable d'environnement ${status.keyVariable} avec ta clé, puis relance ` +
      "l'application. La clé n'est jamais écrite dans le projet.";
  }
  dot.classList.toggle("ready", ready);
  dot.classList.toggle("problem", !ready);
  text.textContent = message;
}
