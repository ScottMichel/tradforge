import { isObject } from "../../core/json.js";
import { BatchError, type Provider, ProviderUnavailableError, RateLimitError } from "../../core/provider.js";
import { hideSecret, requestJson, retryAfterMs } from "../http.js";
import { type Completion, createLlmProvider } from "../llm/provider.js";

export interface AnthropicOptions {
  /** https://api.anthropic.com/v1, or a proxy that speaks the same API. */
  readonly baseUrl: string;
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

/** The version of the Messages API this code follows. */
const API_VERSION = "2023-06-01";

/** Low temperature: faithful, repeatable translations rather than creative ones. */
const TEMPERATURE = 0.3;

/**
 * Claude answers by calling this tool: its input must follow the schema, so the answer is always well-formed JSON.
 * Forcing a tool is the long-standing way of getting structured output from the Messages API.
 */
const toolName = (completion: Completion) => `submit_${completion.schemaName}`;

/** max_tokens is required: twice the expected answer, at least 1024, at most what every current model accepts. */
const MIN_MAX_TOKENS = 1024;
const MAX_MAX_TOKENS = 32_000;

/** Provider for Claude, through the Anthropic Messages API. */
export function createAnthropicProvider(options: AnthropicOptions): Provider {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return createLlmProvider(options.model, async (completion, signal) => {
    if (options.apiKey === undefined || options.apiKey === "") {
      throw new ProviderUnavailableError(
        `no API key for Claude: set the ${options.apiKeyEnv} environment variable (https://console.anthropic.com)`,
      );
    }
    const response = await requestJson({
      url: `${baseUrl}/messages`,
      headers: { "content-type": "application/json", "x-api-key": options.apiKey, "anthropic-version": API_VERSION },
      body: messagesRequest(options.model, completion),
      timeoutMs,
      ...(signal !== undefined ? { signal } : {}),
      fetch,
      label: baseUrl,
      unreachableHint: "check your connection and provider.baseUrl",
    });
    if (response.status >= 400) {
      const detail = hideSecret(errorDetail(response.body), options.apiKey);
      throw httpError(response.status, detail, response.headers, options, baseUrl);
    }
    return toolInput(response.body, toolName(completion));
  });
}

function messagesRequest(model: string, completion: Completion) {
  const name = toolName(completion);
  return {
    model,
    max_tokens: Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, completion.expectedOutputTokens * 2)),
    temperature: TEMPERATURE,
    system: completion.system,
    messages: [{ role: "user", content: completion.user }],
    tools: [{ name, description: `Submit the ${completion.schemaName}, by id.`, input_schema: completion.schema }],
    tool_choice: { type: "tool", name },
  };
}

/** The input of the tool call, as JSON text for parseTranslations: {"content": [{"type": "tool_use", "input": {...}}]}. */
function toolInput(body: string, name: string): string {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw new BatchError("Claude sent an answer that is not JSON", { cause: error });
  }
  if (!isObject(data)) throw new BatchError("Claude sent an answer that is not an object");
  if (data.stop_reason === "max_tokens") throw new BatchError("the answer was too long and was cut");
  if (data.stop_reason === "refusal") throw new BatchError("Claude refused to translate this batch");

  const content: unknown = data.content;
  const blocks: unknown[] = Array.isArray(content) ? content : [];
  const call = blocks.find((block) => isObject(block) && block.type === "tool_use" && block.name === name);
  if (!isObject(call) || call.input === undefined) throw new BatchError("Claude answered without the translation tool");
  return JSON.stringify(call.input);
}

/**
 * 401/403: wrong key. 404: wrong model. 429: rate limit; 529: overloaded, wait as well. Other 4xx (low credit,
 * wrong request): stop. 5xx: retry smaller.
 */
function httpError(status: number, detail: string, headers: Headers, options: AnthropicOptions, baseUrl: string) {
  if (status === 401 || status === 403) {
    return new ProviderUnavailableError(
      `Claude refused the API key (HTTP ${status}): check the ${options.apiKeyEnv} environment variable (${detail})`,
    );
  }
  if (status === 404) {
    return new ProviderUnavailableError(
      `the model "${options.model}" was not found at ${baseUrl} (HTTP 404): ${detail}`,
    );
  }
  if (status === 429 || status === 529) {
    const reason = status === 429 ? "rate limit reached" : "Claude is overloaded";
    return new RateLimitError(`${reason} (HTTP ${status}): ${detail}`, retryAfterMs(headers));
  }
  if (status < 500) return new ProviderUnavailableError(`Claude refused the request (HTTP ${status}): ${detail}`);
  return new BatchError(`Claude failed on this batch (HTTP ${status}): ${detail}`);
}

/** Anthropic errors look like {"type": "error", "error": {"type": "...", "message": "..."}}. */
function errorDetail(body: string): string {
  try {
    const data: unknown = JSON.parse(body);
    const error = isObject(data) ? data.error : undefined;
    if (isObject(error) && typeof error.message === "string") return error.message;
  } catch {
    // not JSON: use the raw text
  }
  return body.slice(0, 200);
}
