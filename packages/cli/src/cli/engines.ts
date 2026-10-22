import { ConfigError, type ProviderConfig, parseProviderConfig } from "../core/config.js";
import { UsageError } from "./command.js";

export interface EngineSpec {
  /** "gemini:gemini-flash-latest", or just "deepl" when the model is the engine itself. */
  readonly label: string;
  readonly config: ProviderConfig;
}

/**
 * Reads "ollama,gemini:gemini-flash-latest,deepl". Each spec is type[:model], cut at the first colon only, since
 * Ollama names have one (qwen3:8b). An engine of the project's type keeps the project settings (address, key
 * variable, prices); the others get their defaults, checked like a configuration file.
 */
export function parseEngines(list: string, project: ProviderConfig): EngineSpec[] {
  const specs = list
    .split(",")
    .map((spec) => spec.trim())
    .filter((spec) => spec !== "");
  if (specs.length === 0) {
    throw new UsageError('--engines needs at least one engine, e.g. --engines "ollama,gemini:gemini-flash-latest"');
  }

  const engines: EngineSpec[] = [];
  for (const spec of specs) {
    const colon = spec.indexOf(":");
    const type = colon < 0 ? spec : spec.slice(0, colon);
    const model = colon < 0 ? undefined : spec.slice(colon + 1);
    const raw = {
      ...(type === project.type ? project : { type }),
      ...(model !== undefined ? { model } : {}),
    };
    let config: ProviderConfig;
    try {
      config = parseProviderConfig(raw);
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      const problems = error.problems.map((problem) => `${problem.path} ${problem.message}`).join("; ");
      throw new UsageError(`--engines "${spec}": ${problems}`);
    }
    const label = config.model === config.type ? config.type : `${config.type}:${config.model}`;
    if (engines.some((engine) => engine.label === label)) {
      throw new UsageError(`--engines lists ${label} twice`);
    }
    engines.push({ label, config });
  }
  return engines;
}
