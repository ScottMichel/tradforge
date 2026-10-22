import { isObject } from "../../core/json.js";
import { BatchError, type Provider, ProviderUnavailableError, RateLimitError } from "../../core/provider.js";
import { hideSecret, requestJson } from "../http.js";
import { type Completion, createLlmProvider } from "../llm/provider.js";

export interface GeminiOptions {
  /** https://generativelanguage.googleapis.com/v1beta */
  readonly baseUrl: string;
  /** e.g. gemini-flash-latest; "models/gemini-flash-latest", as Google lists them, works too. */
  readonly model: string;
  readonly apiKey?: string;
  /** Where the key comes from, named in the error messages. */
  readonly apiKeyEnv: string;
  /** Maximum time for one batch. Default: 5 minutes. */
  readonly timeoutMs?: number;
  /** Injected in tests, so that they never need the network. */
  readonly fetch?: typeof globalThis.fetch;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Low temperature: faithful, repeatable translations rather than creative ones. */
const TEMPERATURE = 0.3;

/**
 * Gemini takes a subset of OpenAPI 3 for its response schema: types in capitals, and no additionalProperties
 * (which OpenAI's strict mode requires). Converted from the one reference schema, so that they never drift apart.
 */
export function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!isObject(schema)) return schema;
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties") continue;
    if (key === "type" && typeof value === "string") converted.type = value.toUpperCase();
    else if (key === "properties" && isObject(value)) {
      converted.properties = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, geminiSchema(sub)]));
    } else if (key === "items") converted.items = geminiSchema(value);
    else converted[key] = value;
  }
  return converted;
}

/** Provider for Gemini, through the Google generateContent API. */
export function createGeminiProvider(options: GeminiOptions): Provider {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const model = options.model.replace(/^models\//, "");
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return createLlmProvider(model, async (completion, signal) => {
    if (options.apiKey === undefined || options.apiKey === "") {
      throw new ProviderUnavailableError(
        `no API key for Gemini: set the ${options.apiKeyEnv} environment variable (https://aistudio.google.com/apikey)`,
      );
    }
    const response = await requestJson({
      // The key goes in a header, never in the address (?key=...), where proxies and logs would keep it.
      url: `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
      headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
      body: generateRequest(completion),
      timeoutMs,
      ...(signal !== undefined ? { signal } : {}),
      fetch,
      label: baseUrl,
      unreachableHint: "check your connection and provider.baseUrl",
    });
    if (response.status >= 400) throw httpError(response.status, response.body, options, model);
    return answerText(response.body);
  });
}

function generateRequest(completion: Completion) {
  return {
    systemInstruction: { parts: [{ text: completion.system }] },
    contents: [{ role: "user", parts: [{ text: completion.user }] }],
    generationConfig: {
      temperature: TEMPERATURE,
      responseMimeType: "application/json",
      responseSchema: geminiSchema(completion.schema),
    },
  };
}

/** The text of the first candidate, without the "thought" parts of thinking models. */
function answerText(body: string): string {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw new BatchError("Gemini sent an answer that is not JSON", { cause: error });
  }
  if (!isObject(data)) throw new BatchError("Gemini sent an answer that is not an object");
  const feedback = data.promptFeedback;
  if (isObject(feedback) && typeof feedback.blockReason === "string") {
    throw new BatchError(`Gemini blocked this batch (${feedback.blockReason})`);
  }

  const candidates: unknown = data.candidates;
  const candidate: unknown = Array.isArray(candidates) ? candidates[0] : undefined;
  if (!isObject(candidate)) throw new BatchError("Gemini sent an answer without a candidate");
  const reason = candidate.finishReason;
  if (reason === "MAX_TOKENS") throw new BatchError("the answer was too long and was cut");
  if (typeof reason === "string" && reason !== "STOP") throw new BatchError(`Gemini blocked this answer (${reason})`);

  const content = candidate.content;
  const parts: unknown = isObject(content) ? content.parts : undefined;
  const list: unknown[] = Array.isArray(parts) ? parts : [];
  const text = list
    .filter((part) => isObject(part) && part.thought !== true && typeof part.text === "string")
    .map((part) => (isObject(part) ? String(part.text) : ""))
    .join("");
  if (text === "") throw new BatchError("Gemini sent an answer without text");
  return text;
}

interface GoogleError {
  readonly message: string;
  readonly details: readonly Record<string, unknown>[];
}

/** {"error": {"code": 429, "message": "...", "status": "RESOURCE_EXHAUSTED", "details": [...]}} */
function googleError(body: string): GoogleError {
  try {
    const data: unknown = JSON.parse(body);
    const error = isObject(data) ? data.error : undefined;
    if (isObject(error)) {
      const details: unknown = error.details;
      const list: unknown[] = Array.isArray(details) ? details : [];
      return {
        message: typeof error.message === "string" ? error.message : body.slice(0, 200),
        details: list.filter(isObject),
      };
    }
  } catch {
    // not JSON: use the raw text
  }
  return { message: body.slice(0, 200), details: [] };
}

/**
 * Google answers an invalid key with a 400 (reason API_KEY_INVALID), a used-up daily quota with a 429 like a
 * per-minute limit: the details tell them apart. 503 means overloaded: wait, like a rate limit.
 */
function httpError(status: number, body: string, options: GeminiOptions, model: string): Error {
  const error = googleError(body);
  const detail = hideSecret(error.message, options.apiKey);
  const keyRefused = error.details.some((d) => d.reason === "API_KEY_INVALID");
  if (status === 401 || status === 403 || keyRefused) {
    return new ProviderUnavailableError(
      `Gemini refused the API key (HTTP ${status}): check the ${options.apiKeyEnv} environment variable (${detail})`,
    );
  }
  if (status === 404) return new ProviderUnavailableError(`the model "${model}" was not found (HTTP 404): ${detail}`);
  if (status === 429) {
    if (isDailyQuota(error)) {
      return new ProviderUnavailableError(`the daily quota of this API key is used up (HTTP 429): ${detail}`);
    }
    return new RateLimitError(`rate limit reached (HTTP 429): ${detail}`, retryDelayMs(error));
  }
  if (status === 503) return new RateLimitError(`Gemini is overloaded (HTTP 503): ${detail}`, retryDelayMs(error));
  if (status < 500) return new ProviderUnavailableError(`Gemini refused the request (HTTP ${status}): ${detail}`);
  return new BatchError(`Gemini failed on this batch (HTTP ${status}): ${detail}`);
}

/** A QuotaFailure about a per-day quota: it comes back tomorrow, not in a few seconds. */
function isDailyQuota(error: GoogleError): boolean {
  return error.details.some((detail) => {
    const violations: unknown = detail.violations;
    const list: unknown[] = Array.isArray(violations) ? violations : [];
    return list.some((v) => isObject(v) && typeof v.quotaId === "string" && v.quotaId.includes("PerDay"));
  });
}

/** RetryInfo.retryDelay, a duration such as "21s" or "1.5s". */
function retryDelayMs(error: GoogleError): number | undefined {
  for (const detail of error.details) {
    const delay = detail.retryDelay;
    const match = typeof delay === "string" ? /^(\d+(?:\.\d+)?)s$/.exec(delay) : null;
    if (match?.[1] !== undefined) return Math.round(Number(match[1]) * 1000);
  }
  return undefined;
}
