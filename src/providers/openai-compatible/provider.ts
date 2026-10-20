import type { ResponseFormat } from "../../core/config.js";
import { isObject } from "../../core/json.js";
import {
  BatchError,
  type Provider,
  ProviderUnavailableError,
  RateLimitError,
  type TranslationRequest,
} from "../../core/provider.js";
import { buildSystemPrompt, buildUserMessage } from "../llm/prompt.js";
import { parseTranslations, RESPONSE_SCHEMA } from "../llm/response.js";

export interface OpenAiCompatibleOptions {
  /** e.g. https://api.openai.com/v1, http://localhost:1234/v1 */
  readonly baseUrl: string;
  readonly model: string;
  /** Absent for local servers that need none. */
  readonly apiKey?: string;
  /** Where the key comes from, named in the error messages. */
  readonly apiKeyEnv: string;
  readonly responseFormat: ResponseFormat;
  /** Maximum time for one batch. Default: 5 minutes. */
  readonly timeoutMs?: number;
  /** Injected in tests, so that they never need the network. */
  readonly fetch?: typeof globalThis.fetch;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Low temperature: faithful, repeatable translations rather than creative ones. */
const TEMPERATURE = 0.3;

/** Provider for any server that speaks the OpenAI chat completions protocol. */
export function createOpenAiCompatibleProvider(options: OpenAiCompatibleOptions): Provider {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.apiKey !== undefined && options.apiKey !== "") headers.authorization = `Bearer ${options.apiKey}`;

  /** Servers sometimes repeat the key they refused: never let it reach the terminal or a log. */
  const hideKey = (text: string): string =>
    options.apiKey === undefined || options.apiKey === "" ? text : text.replaceAll(options.apiKey, "***");

  return {
    model: options.model,
    async translateBatch(request, signal) {
      const timeout = AbortSignal.timeout(timeoutMs);
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(completionRequest(options, request)),
          signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
        });
        const body = await response.text();
        if (response.status === 429) throw rateLimitError(response.headers, body, hideKey(errorDetail(body)));
        if (!response.ok) throw httpError(response.status, hideKey(errorDetail(body)), options, baseUrl);
        return parseTranslations(
          completionContent(body),
          request.items.map((item) => item.id),
        );
      } catch (error) {
        if (signal?.aborted === true) throw signal.reason; // the user interrupted: let it through as it is
        if (timeout.aborted) {
          throw new BatchError(`${baseUrl} did not answer within ${timeoutMs / 1000} s`, { cause: error });
        }
        if (error instanceof TypeError) {
          // fetch rejects with a TypeError when the server cannot be reached at all.
          throw new ProviderUnavailableError(
            `cannot reach ${baseUrl}: check provider.baseUrl and that the server is running (${error.message})`,
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}

function completionRequest(options: OpenAiCompatibleOptions, request: TranslationRequest) {
  return {
    model: options.model,
    temperature: TEMPERATURE,
    messages: [
      { role: "system", content: buildSystemPrompt(request) },
      { role: "user", content: buildUserMessage(request) },
    ],
    ...responseFormat(options.responseFormat),
  };
}

function responseFormat(format: ResponseFormat) {
  switch (format) {
    case "json-schema":
      return {
        response_format: {
          type: "json_schema",
          json_schema: { name: "translations", strict: true, schema: RESPONSE_SCHEMA },
        },
      };
    case "json-object":
      return { response_format: { type: "json_object" } };
    case "none":
      return {};
  }
}

/** The text of the answer: {"choices": [{"finish_reason": "stop", "message": {"content": "..."}}]}. */
function completionContent(body: string): string {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw new BatchError("the server sent an answer that is not JSON", { cause: error });
  }
  const choices: unknown = isObject(data) ? data.choices : undefined;
  const choice: unknown = Array.isArray(choices) ? choices[0] : undefined;
  const message = isObject(choice) ? choice.message : undefined;
  if (!isObject(choice) || !isObject(message)) throw new BatchError("the server sent an answer without a message");

  if (typeof message.refusal === "string" && message.refusal !== "") {
    throw new BatchError(`the model refused to translate this batch: ${message.refusal}`);
  }
  if (choice.finish_reason === "length") {
    // The answer was cut in the middle of the JSON: a smaller batch has a shorter answer.
    throw new BatchError("the answer was too long and was cut");
  }
  if (typeof message.content !== "string") throw new BatchError("the server sent an answer without text");
  return message.content;
}

/**
 * 429 means "slow down", except when the quota or the credit is used up: then waiting will not help.
 * OpenAI says how long to wait in retry-after-ms or retry-after (seconds, or an HTTP date).
 */
function rateLimitError(headers: Headers, body: string, detail: string): Error {
  if (errorCode(body) === "insufficient_quota") {
    return new ProviderUnavailableError(`the quota of this API key is used up (HTTP 429): ${detail}`);
  }
  return new RateLimitError(`rate limit reached (HTTP 429): ${detail}`, retryAfterMs(headers));
}

function retryAfterMs(headers: Headers): number | undefined {
  const ms = Number(headers.get("retry-after-ms") ?? Number.NaN);
  if (Number.isFinite(ms) && ms >= 0) return ms;
  const value = headers.get("retry-after");
  if (value === null) return undefined;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** 401/403: wrong key. 404: wrong model or address. Other 4xx: wrong request (stop). 5xx: retry smaller. */
function httpError(status: number, detail: string, options: OpenAiCompatibleOptions, baseUrl: string): Error {
  if (status === 401 || status === 403) {
    return new ProviderUnavailableError(
      `${baseUrl} refused the API key (HTTP ${status}): set it in the ${options.apiKeyEnv} environment variable (${detail})`,
    );
  }
  if (status === 404) {
    return new ProviderUnavailableError(
      `the model "${options.model}" or the address ${baseUrl} is wrong (HTTP 404): ${detail}`,
    );
  }
  if (status < 500) {
    const hint =
      options.responseFormat === "none"
        ? ""
        : ` If the server does not support this answer format, set provider.responseFormat to "${options.responseFormat === "json-schema" ? "json-object" : "none"}".`;
    return new ProviderUnavailableError(`the server refused the request (HTTP ${status}): ${detail}.${hint}`);
  }
  return new BatchError(`the server failed on this batch (HTTP ${status}): ${detail}`);
}

/** The machine-readable code of an OpenAI error, such as insufficient_quota. */
function errorCode(body: string): string | undefined {
  try {
    const data: unknown = JSON.parse(body);
    const error = isObject(data) ? data.error : undefined;
    if (isObject(error) && typeof error.code === "string") return error.code;
  } catch {
    // not JSON: no code
  }
  return undefined;
}

/** OpenAI errors look like {"error": {"message": "..."}}; some servers send {"error": "..."}. */
function errorDetail(body: string): string {
  try {
    const data: unknown = JSON.parse(body);
    const error = isObject(data) ? data.error : undefined;
    if (typeof error === "string") return error;
    if (isObject(error) && typeof error.message === "string") return error.message;
  } catch {
    // not JSON: use the raw text
  }
  return body.slice(0, 200);
}
