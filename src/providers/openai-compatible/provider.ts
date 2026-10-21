import type { ResponseFormat } from "../../core/config.js";
import { isObject } from "../../core/json.js";
import { BatchError, type Provider, ProviderUnavailableError, RateLimitError } from "../../core/provider.js";
import { hideSecret, requestJson, retryAfterMs } from "../http.js";
import { type Completion, createLlmProvider } from "../llm/provider.js";

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

  return createLlmProvider(options.model, async (completion, signal) => {
    const response = await requestJson({
      url: `${baseUrl}/chat/completions`,
      headers,
      body: completionRequest(options, completion),
      timeoutMs,
      ...(signal !== undefined ? { signal } : {}),
      fetch,
      label: baseUrl,
      unreachableHint: "check provider.baseUrl and that the server is running",
    });
    const { status, body } = response;
    if (status === 429) throw rateLimitError(response.headers, body, hideSecret(errorDetail(body), options.apiKey));
    if (status >= 400) throw httpError(status, hideSecret(errorDetail(body), options.apiKey), options, baseUrl);
    return completionContent(body);
  });
}

function completionRequest(options: OpenAiCompatibleOptions, completion: Completion) {
  return {
    model: options.model,
    temperature: TEMPERATURE,
    messages: [
      { role: "system", content: completion.system },
      { role: "user", content: completion.user },
    ],
    ...responseFormat(options.responseFormat, completion),
  };
}

function responseFormat(format: ResponseFormat, completion: Completion) {
  switch (format) {
    case "json-schema":
      return {
        response_format: {
          type: "json_schema",
          json_schema: { name: completion.schemaName, strict: true, schema: completion.schema },
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
