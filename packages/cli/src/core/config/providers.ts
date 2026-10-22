import { isObject } from "../json.js";
import { ConfigError, type ConfigProblem, parseChoice, parseString, type Report } from "./parse.js";

export const PROVIDER_TYPES = ["ollama", "openai-compatible", "anthropic", "gemini", "deepl"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

/**
 * How an OpenAI-compatible server is asked for JSON. json-schema: the answer must follow our schema (OpenAI,
 * Mistral, OpenRouter, LM Studio, vLLM). json-object: any JSON (older servers). none: the prompt alone asks for it.
 */
export const RESPONSE_FORMATS = ["json-schema", "json-object", "none"] as const;
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

/** A local model served by Ollama. */
export interface OllamaProviderConfig {
  readonly type: "ollama";
  readonly model: string;
  readonly host: string;
}

/** What every engine reached over the network has. */
export interface RemoteProviderSettings {
  readonly model: string;
  /** e.g. https://api.openai.com/v1, http://localhost:1234/v1 */
  readonly baseUrl: string;
  /** Name of the environment variable that holds the API key. The key itself never goes in the configuration. */
  readonly apiKeyEnv: string;
  /** Prices of the engine, for the cost estimate of a dry run. Not built in: prices change too often. */
  readonly pricing?: Pricing;
}

/** Any server that speaks the OpenAI chat completions protocol: OpenAI, Mistral, OpenRouter, Groq, LM Studio, vLLM... */
export interface OpenAiCompatibleProviderConfig extends RemoteProviderSettings {
  readonly type: "openai-compatible";
  readonly responseFormat: ResponseFormat;
}

/** Claude, through the Anthropic Messages API. */
export interface AnthropicProviderConfig extends RemoteProviderSettings {
  readonly type: "anthropic";
}

/** Gemini, through the Google generateContent API. */
export interface GeminiProviderConfig extends RemoteProviderSettings {
  readonly type: "gemini";
}

/** "deepl" lets DeepL choose; the others are DeepL's own model types. */
export const DEEPL_MODELS = ["deepl", "quality_optimized", "prefer_quality_optimized", "latency_optimized"] as const;
export type DeepLModel = (typeof DEEPL_MODELS)[number];

/** Form of address. The "prefer_" values fall back to the default for languages that have no such distinction. */
export const DEEPL_FORMALITIES = ["default", "more", "less", "prefer_more", "prefer_less"] as const;
export type DeepLFormality = (typeof DEEPL_FORMALITIES)[number];

/** DeepL bills the characters of the source texts. */
export interface CharacterPricing {
  readonly perMillionCharacters: number;
}

/** DeepL: a translation engine, not a language model. It gets the texts, never a prompt. */
export interface DeepLProviderConfig {
  readonly type: "deepl";
  readonly model: DeepLModel;
  readonly apiKeyEnv: string;
  /** Default: https://api-free.deepl.com for a free key (ending in ":fx"), https://api.deepl.com otherwise. */
  readonly baseUrl?: string;
  readonly formality: DeepLFormality;
  readonly pricing?: CharacterPricing;
}

/** In any currency, per million tokens, as API price lists show them. */
export interface Pricing {
  readonly inputPerMillion: number;
  readonly outputPerMillion: number;
}

/** Discriminated by type: each engine has its own settings. */
export type ProviderConfig =
  | OllamaProviderConfig
  | OpenAiCompatibleProviderConfig
  | AnthropicProviderConfig
  | GeminiProviderConfig
  | DeepLProviderConfig;

const DEFAULT_PROVIDER: OllamaProviderConfig = {
  type: "ollama",
  model: "mistral-small",
  host: "http://localhost:11434",
};

/** One engine's settings, with the same defaults and checks as in a configuration file (compare --engines). */
export function parseProviderConfig(raw: unknown): ProviderConfig {
  const problems: ConfigProblem[] = [];
  const provider = parseProvider(raw, (path, message) => problems.push({ path, message }));
  if (problems.length > 0) throw new ConfigError(problems);
  return provider;
}

export function parseProvider(value: unknown, report: Report): ProviderConfig {
  if (value === undefined) return DEFAULT_PROVIDER;
  if (!isObject(value)) {
    report("provider", "must be an object");
    return DEFAULT_PROVIDER;
  }
  const type = parseChoice(PROVIDER_TYPES, value.type, "provider.type", report, DEFAULT_PROVIDER.type);
  switch (type) {
    case "ollama":
      return {
        type,
        model: parseString(value.model, "provider.model", report, DEFAULT_PROVIDER.model),
        host: parseString(value.host, "provider.host", report, DEFAULT_PROVIDER.host),
      };
    case "openai-compatible":
      return {
        type,
        ...parseRemote(value, { baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" }, report),
        responseFormat: parseChoice(
          RESPONSE_FORMATS,
          value.responseFormat,
          "provider.responseFormat",
          report,
          "json-schema",
        ),
      };
    case "anthropic":
      return {
        type,
        ...parseRemote(value, { baseUrl: "https://api.anthropic.com/v1", apiKeyEnv: "ANTHROPIC_API_KEY" }, report),
      };
    case "deepl":
      return parseDeepL(value, report);
    case "gemini":
      return {
        type,
        ...parseRemote(
          value,
          { baseUrl: "https://generativelanguage.googleapis.com/v1beta", apiKeyEnv: "GEMINI_API_KEY" },
          report,
        ),
      };
  }
}

/** The usual shape of an environment variable name, which also works on Windows. */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The settings every remote engine shares, checked the same way for all of them. */
function parseRemote(
  value: Record<string, unknown>,
  defaults: { readonly baseUrl: string; readonly apiKeyEnv: string },
  report: Report,
): RemoteProviderSettings {
  const baseUrl = parseString(value.baseUrl, "provider.baseUrl", report, defaults.baseUrl);
  if (baseUrl !== "" && !/^https?:\/\/[^/]/.test(baseUrl)) {
    report("provider.baseUrl", "must start with http:// or https://");
  }
  const model = parseString(value.model, "provider.model", report);
  const apiKeyEnv = parseApiKeyEnv(value, defaults.apiKeyEnv, report);
  const pricing = value.pricing === undefined ? undefined : parsePricing(value.pricing, report);
  return { model, baseUrl, apiKeyEnv, ...(pricing !== undefined ? { pricing } : {}) };
}

/** The name of the variable that holds the key; a key written in the configuration itself is refused. */
function parseApiKeyEnv(value: Record<string, unknown>, fallback: string, report: Report): string {
  const apiKeyEnv = parseString(value.apiKeyEnv, "provider.apiKeyEnv", report, fallback);
  if (apiKeyEnv !== "" && !ENV_NAME.test(apiKeyEnv)) {
    report("provider.apiKeyEnv", `must be the name of an environment variable, such as ${fallback}`);
  }
  if (value.apiKey !== undefined) {
    // The configuration file is often committed: a key written there ends up public. Never echo it back.
    report(
      "provider.apiKey",
      `never write an API key in the configuration: put it in the ${apiKeyEnv || fallback} environment variable`,
    );
  }
  return apiKeyEnv;
}

function parseDeepL(value: Record<string, unknown>, report: Report): DeepLProviderConfig {
  const model = parseChoice(DEEPL_MODELS, value.model, "provider.model", report, "deepl");
  const baseUrl = value.baseUrl === undefined ? undefined : parseString(value.baseUrl, "provider.baseUrl", report);
  if (baseUrl !== undefined && baseUrl !== "" && !/^https?:\/\/[^/]/.test(baseUrl)) {
    report("provider.baseUrl", "must start with http:// or https://");
  }
  const formality = parseChoice(DEEPL_FORMALITIES, value.formality, "provider.formality", report, "default");
  const apiKeyEnv = parseApiKeyEnv(value, "DEEPL_API_KEY", report);
  let pricing: CharacterPricing | undefined;
  if (value.pricing !== undefined) {
    const amount = isObject(value.pricing) ? value.pricing.perMillionCharacters : undefined;
    if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0)
      pricing = { perMillionCharacters: amount };
    else report("provider.pricing.perMillionCharacters", "must be a number, 0 or more: DeepL bills characters");
  }
  return {
    type: "deepl",
    model,
    apiKeyEnv,
    formality,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(pricing !== undefined ? { pricing } : {}),
  };
}

function parsePricing(value: unknown, report: Report): Pricing | undefined {
  if (!isObject(value)) {
    report("provider.pricing", 'must be an object such as { "inputPerMillion": 0.4, "outputPerMillion": 1.6 }');
    return undefined;
  }
  const price = (key: "inputPerMillion" | "outputPerMillion"): number => {
    const amount = value[key];
    if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0) return amount;
    report(`provider.pricing.${key}`, "must be a number, 0 or more");
    return 0;
  };
  return { inputPerMillion: price("inputPerMillion"), outputPerMillion: price("outputPerMillion") };
}
