import { ProviderUnavailableError, TimeoutError } from "../core/provider.js";

export interface RequestOptions {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Default: POST. */
  readonly method?: "GET" | "POST";
  /** Sent as JSON; none for a GET. */
  readonly body?: unknown;
  /** Maximum time for the whole exchange. */
  readonly timeoutMs: number;
  /** The user's interruption (Ctrl+C). */
  readonly signal?: AbortSignal;
  readonly fetch: typeof globalThis.fetch;
  /** Names the engine in the messages: "Ollama", "https://api.anthropic.com/v1"... */
  readonly label: string;
  /** What to do when the server cannot be reached at all, e.g. 'Start it with "ollama serve"'. */
  readonly unreachableHint: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: string;
}

/**
 * Sends a request (JSON body) and reads the whole answer, whatever its status: each engine reads its own errors.
 * A timeout is a TimeoutError (a smaller batch answers sooner), an unreachable server a ProviderUnavailableError,
 * and the user's interruption goes through as it is.
 */
export async function requestJson(options: RequestOptions): Promise<HttpResponse> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const { signal } = options;
  try {
    const response = await options.fetch(options.url, {
      method: options.method ?? "POST",
      headers: options.headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
    });
    return { status: response.status, headers: response.headers, body: await response.text() };
  } catch (error) {
    if (signal?.aborted === true) throw signal.reason;
    if (timeout.aborted) {
      throw new TimeoutError(`${options.label} did not answer within ${options.timeoutMs / 1000} s`, { cause: error });
    }
    if (error instanceof TypeError) {
      // fetch rejects with a TypeError when the server cannot be reached at all. Only fetch is in this try:
      // a TypeError from a bug in our own code is never mistaken for a network problem.
      throw new ProviderUnavailableError(
        `cannot reach ${options.label}: ${options.unreachableHint} (${error.message})`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** The delay a server asks for: retry-after-ms, or retry-after in seconds or as an HTTP date. */
export function retryAfterMs(headers: Headers): number | undefined {
  const ms = Number(headers.get("retry-after-ms") ?? Number.NaN);
  if (Number.isFinite(ms) && ms >= 0) return ms;
  const value = headers.get("retry-after");
  if (value === null) return undefined;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** Servers sometimes repeat the key they refused: it must never reach the terminal or a log. */
export function hideSecret(text: string, secret: string | undefined): string {
  return secret === undefined || secret === "" ? text : text.replaceAll(secret, "***");
}
