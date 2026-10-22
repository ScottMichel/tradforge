import { isObject } from "../../core/json.js";
import { BatchError, type Provider, ProviderUnavailableError } from "../../core/provider.js";
import { requestJson } from "../http.js";
import { type Completion, createLlmProvider } from "../llm/provider.js";

export interface OllamaOptions {
  /** e.g. http://localhost:11434 */
  readonly host: string;
  readonly model: string;
  /** Maximum time for one batch. Default: 5 minutes. */
  readonly timeoutMs?: number;
  /** Injected in tests, so that they never need a running Ollama. */
  readonly fetch?: typeof globalThis.fetch;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Low temperature: faithful, repeatable translations rather than creative ones. */
const MODEL_OPTIONS = { temperature: 0.3, num_ctx: 8192 };

/** Provider for a local Ollama server, through its /api/chat endpoint. */
export function createOllamaProvider(options: OllamaOptions): Provider {
  const host = options.host.replace(/\/+$/, "");
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return createLlmProvider(options.model, async (completion, signal) => {
    const response = await requestJson({
      url: `${host}/api/chat`,
      headers: { "content-type": "application/json" },
      body: chatRequest(options.model, completion),
      timeoutMs,
      ...(signal !== undefined ? { signal } : {}),
      fetch,
      label: `Ollama at ${host}`,
      unreachableHint: 'is it running? Start it with "ollama serve"',
    });
    if (response.status >= 400) throw httpError(response.status, response.body, options.model);
    return chatContent(response.body);
  });
}

function chatRequest(model: string, completion: Completion) {
  return {
    model,
    stream: false,
    format: completion.schema,
    options: MODEL_OPTIONS,
    messages: [
      { role: "system", content: completion.system },
      { role: "user", content: completion.user },
    ],
  };
}

/** The text of the answer: {"message": {"role": "assistant", "content": "..."}}. */
function chatContent(body: string): string {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw new BatchError("Ollama sent an answer that is not JSON", { cause: error });
  }
  const message = isObject(data) ? data.message : undefined;
  const content = isObject(message) ? message.content : undefined;
  if (typeof content !== "string") throw new BatchError("Ollama sent an answer without message content");
  return content;
}

/** 4xx: the request itself is wrong (stop). 5xx: the server failed on this batch (retry smaller). */
function httpError(status: number, body: string, model: string): Error {
  const detail = errorDetail(body);
  if (status === 404) {
    return new ProviderUnavailableError(
      `the model "${model}" is not available in Ollama: install it with "ollama pull ${model}" (${detail})`,
    );
  }
  if (status < 500) return new ProviderUnavailableError(`Ollama refused the request (HTTP ${status}): ${detail}`);
  return new BatchError(`Ollama failed on this batch (HTTP ${status}): ${detail}`);
}

/** Ollama errors look like {"error": "..."}; fall back to the start of the raw body. */
function errorDetail(body: string): string {
  try {
    const data: unknown = JSON.parse(body);
    if (isObject(data) && typeof data.error === "string") return data.error;
  } catch {
    // not JSON: use the raw text
  }
  return body.slice(0, 200);
}
