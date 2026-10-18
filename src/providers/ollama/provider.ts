import { isObject } from "../../core/json.js";
import { BatchError, ProviderUnavailableError, type Provider, type TranslationRequest } from "../../core/provider.js";
import { buildSystemPrompt, buildUserMessage } from "../llm/prompt.js";
import { parseTranslations } from "../llm/response.js";

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

/** JSON schema given to Ollama: the model can only produce an answer of this shape. */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, translation: { type: "string" } },
        required: ["id", "translation"],
      },
    },
  },
  required: ["translations"],
};

/** Provider for a local Ollama server, through its /api/chat endpoint. */
export function createOllamaProvider(options: OllamaOptions): Provider {
  const host = options.host.replace(/\/+$/, "");
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    model: options.model,
    async translateBatch(request, signal) {
      const timeout = AbortSignal.timeout(timeoutMs);
      try {
        const response = await fetch(`${host}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(chatRequest(options.model, request)),
          signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
        });
        const body = await response.text();
        if (!response.ok) throw httpError(response.status, body, options.model);
        return parseTranslations(chatContent(body), request.items.map((item) => item.id));
      } catch (error) {
        if (signal?.aborted === true) throw signal.reason; // the user interrupted: let it through as it is
        if (timeout.aborted) {
          throw new BatchError(`Ollama did not answer within ${timeoutMs / 1000} s`, { cause: error });
        }
        if (error instanceof TypeError) {
          // fetch rejects with a TypeError when the server cannot be reached at all.
          throw new ProviderUnavailableError(
            `cannot reach Ollama at ${host}: is it running? Start it with "ollama serve" (${error.message})`,
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}

function chatRequest(model: string, request: TranslationRequest) {
  return {
    model,
    stream: false,
    format: RESPONSE_SCHEMA,
    options: MODEL_OPTIONS,
    messages: [
      { role: "system", content: buildSystemPrompt(request) },
      { role: "user", content: buildUserMessage(request.items) },
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
