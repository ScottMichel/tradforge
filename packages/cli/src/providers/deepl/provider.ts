import { createHash } from "node:crypto";
import type { DeepLFormality, DeepLModel } from "../../core/config.js";
import { isObject } from "../../core/json.js";
import {
  BatchError,
  type Provider,
  ProviderUnavailableError,
  RateLimitError,
  type TranslationRequest,
} from "../../core/provider.js";
import { type HttpResponse, hideSecret, requestJson, retryAfterMs } from "../http.js";

export interface DeepLOptions {
  readonly model: DeepLModel;
  readonly apiKey?: string;
  /** Where the key comes from, named in the error messages. */
  readonly apiKeyEnv: string;
  /** Default: guessed from the key, since free and paid keys use different addresses. */
  readonly baseUrl?: string;
  readonly formality: DeepLFormality;
  /** Maximum time for one request. Default: 5 minutes. */
  readonly timeoutMs?: number;
  /** Injected in tests, so that they never need the network. */
  readonly fetch?: typeof globalThis.fetch;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const FREE_URL = "https://api-free.deepl.com";
const PAID_URL = "https://api.deepl.com";

/** DeepL takes at most 50 texts in one request. */
const MAX_TEXTS = 50;

/** The tags the pipeline puts in place of placeholders (see core/protection.ts). */
const PROTECTED_TAG = /(<x id="\d+"\s*\/>)/;

/** Target languages DeepL wants with a region or a script; the others take their base code. */
export function deeplTargetLanguage(code: string): string {
  const [base = "", region = ""] = code.split(/[-_]/);
  const language = base.toLowerCase();
  const variant = region.toUpperCase();
  if (language === "en") return variant === "GB" ? "EN-GB" : "EN-US";
  if (language === "pt") return variant === "BR" ? "PT-BR" : "PT-PT";
  if (language === "zh") return ["TW", "HK", "MO", "HANT"].includes(variant) ? "ZH-HANT" : "ZH-HANS";
  if (language === "es" && variant === "419") return "ES-419";
  return language.toUpperCase();
}

/** Source languages are always base codes. */
export function deeplSourceLanguage(code: string): string {
  return (code.split(/[-_]/)[0] ?? "").toUpperCase();
}

/**
 * With tag_handling "xml", DeepL reads the text as XML: "Tom & Jerry" or "3 < 5" would be broken XML. Everything
 * around the protected tags is escaped before the request.
 */
export function escapeXml(text: string): string {
  return text
    .split(PROTECTED_TAG)
    .map((part, index) =>
      index % 2 === 1 ? part : part.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    )
    .join("");
}

const ENTITIES: Readonly<Record<string, string>> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };

/** The answer back to plain text. One pass, so that "&amp;lt;" becomes "&lt;" and not "<". */
export function unescapeXml(text: string): string {
  return text.replace(/&(lt|gt|quot|apos|amp);/g, (entity, name: string) => ENTITIES[name] ?? entity);
}

/** Provider for DeepL: a translation engine, not a language model. It gets the texts, never a prompt. */
export function createDeepLProvider(options: DeepLOptions): Provider {
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  /** One glossary per content, created or found once per run, shared by every batch. */
  const glossaries = new Map<string, Promise<string>>();

  return {
    model: options.model,
    // DeepL cannot be told in words to keep {name} or %s: the pipeline turns them into <x id="n"/> tags first.
    protectPlaceholders: true,
    async translateBatch(request, signal) {
      const { apiKey } = options;
      if (apiKey === undefined || apiKey === "") {
        throw new ProviderUnavailableError(
          `no API key for DeepL: set the ${options.apiKeyEnv} environment variable (https://www.deepl.com/your-account/keys)`,
        );
      }
      const baseUrl = (options.baseUrl ?? (apiKey.endsWith(":fx") ? FREE_URL : PAID_URL)).replace(/\/+$/, "");
      const send = (path: string, method: "GET" | "POST" | "DELETE", body?: unknown) =>
        requestJson({
          url: `${baseUrl}${path}`,
          method,
          headers: { "content-type": "application/json", authorization: `DeepL-Auth-Key ${apiKey}` },
          ...(body !== undefined ? { body } : {}),
          timeoutMs,
          ...(signal !== undefined ? { signal } : {}),
          fetch,
          label: baseUrl,
          unreachableHint: "check your connection and provider.baseUrl",
        });
      const fail = (response: HttpResponse) => httpError(response, options, baseUrl);

      const glossaryId = await glossaryFor(request, glossaries, send, fail);
      const result = new Map<number, string>();
      for (let start = 0; start < request.items.length; start += MAX_TEXTS) {
        const items = request.items.slice(start, start + MAX_TEXTS);
        const response = await send("/v2/translate", "POST", translateRequest(request, items, options, glossaryId));
        if (response.status >= 400) throw fail(response);
        const texts = translatedTexts(response.body, items.length);
        items.forEach((item, index) => {
          const text = texts[index];
          if (text !== undefined) result.set(item.id, unescapeXml(text));
        });
      }
      return result;
    },
  };
}

function translateRequest(
  request: TranslationRequest,
  items: TranslationRequest["items"],
  options: DeepLOptions,
  glossaryId: string | undefined,
) {
  const context = deeplContext(request);
  return {
    text: items.map((item) => escapeXml(item.source)),
    source_lang: deeplSourceLanguage(request.sourceLanguage),
    target_lang: deeplTargetLanguage(request.targetLanguage),
    tag_handling: "xml",
    ignore_tags: ["x"],
    ...(context !== "" ? { context } : {}),
    ...(options.formality !== "default" ? { formality: options.formality } : {}),
    ...(options.model !== "deepl" ? { model_type: options.model } : {}),
    ...(glossaryId !== undefined ? { glossary_id: glossaryId } : {}),
  };
}

/** DeepL's context parameter: read to choose the meaning, never translated, never billed. */
function deeplContext(request: TranslationRequest): string {
  const parts: string[] = [];
  if (request.instructions !== undefined) parts.push(request.instructions);
  const contexts = [...new Set(request.items.flatMap((item) => (item.context !== undefined ? [item.context] : [])))];
  if (contexts.length > 0) parts.push(`The texts are used in: ${contexts.join("; ")}.`);
  const { surrounding } = request;
  if (surrounding !== undefined) {
    for (const lines of [surrounding.before, surrounding.after]) {
      if (lines.length > 0) parts.push(lines.map((line) => line.source).join("\n"));
    }
  }
  return parts.join("\n\n");
}

/** {"translations": [{"detected_source_language": "EN", "text": "..."}]}, one per text, in order. */
function translatedTexts(body: string, expected: number): string[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw new BatchError("DeepL sent an answer that is not JSON", { cause: error });
  }
  const translations: unknown = isObject(data) ? data.translations : undefined;
  const list: unknown[] = Array.isArray(translations) ? translations : [];
  const texts = list.map((t) => (isObject(t) && typeof t.text === "string" ? t.text : undefined));
  if (texts.length !== expected || texts.some((text) => text === undefined)) {
    throw new BatchError(`DeepL sent ${texts.length} translations for ${expected} texts`);
  }
  return texts.filter((text) => text !== undefined);
}

type Send = (path: string, method: "GET" | "POST" | "DELETE", body?: unknown) => Promise<HttpResponse>;

/**
 * The id of a DeepL glossary holding the project glossary. Its name is a digest of its content: a later run with
 * the same glossary finds it and reuses it, rather than piling up copies on the account.
 */
async function glossaryFor(
  request: TranslationRequest,
  cache: Map<string, Promise<string>>,
  send: Send,
  fail: (response: HttpResponse) => Error,
): Promise<string | undefined> {
  const entries = Object.entries(request.glossary ?? {})
    .map(([term, target]) => [term.trim(), target.trim()] as const)
    // DeepL entries are tab-separated lines: a tab or a line break inside an entry cannot be sent.
    .filter(([term, target]) => term !== "" && target !== "" && !/[\t\r\n]/.test(term + target))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([term, target]) => `${term}\t${target}`)
    .join("\n");
  if (entries === "") return undefined;

  const source = deeplSourceLanguage(request.sourceLanguage).toLowerCase();
  const target = deeplSourceLanguage(request.targetLanguage).toLowerCase();
  const digest = createHash("sha256").update(`${source}\n${target}\n${entries}`).digest("hex").slice(0, 12);
  const name = `tradforge ${source}-${target} ${digest}`;

  let id = cache.get(name);
  if (id === undefined) {
    id = findOrCreateGlossary(name, { source, target, entries }, send, fail);
    cache.set(name, id);
    id.catch(() => cache.delete(name)); // a failure is not kept: the next batch may try again
  }
  return id;
}

/** DeepL's answer when the account cannot hold another glossary. */
const TOO_MANY_GLOSSARIES = 456;

async function findOrCreateGlossary(
  name: string,
  glossary: { readonly source: string; readonly target: string; readonly entries: string },
  send: Send,
  fail: (response: HttpResponse) => Error,
): Promise<string> {
  const listed = await send("/v2/glossaries", "GET");
  if (listed.status >= 400) throw glossaryError(listed, glossary, fail);
  const list = glossaryList(listed.body);
  const existing = list.find((item) => item.name === name);
  if (existing !== undefined) return existing.id;

  const create = () =>
    send("/v2/glossaries", "POST", {
      name,
      source_lang: glossary.source,
      target_lang: glossary.target,
      entries: glossary.entries,
      entries_format: "tsv",
    });
  let created = await create();
  if (created.status === TOO_MANY_GLOSSARIES) {
    // A free account holds very few glossaries. Those of tradforge for this pair are older versions of a project
    // glossary, made again whenever needed: they make room. The other glossaries of the account are never touched.
    const prefix = `tradforge ${glossary.source}-${glossary.target} `;
    const stale = list.filter((item) => item.name.startsWith(prefix));
    for (const item of stale) {
      const removed = await send(`/v2/glossaries/${encodeURIComponent(item.id)}`, "DELETE");
      if (removed.status >= 400 && removed.status !== 404) throw glossaryError(removed, glossary, fail);
    }
    if (stale.length > 0) created = await create();
  }
  if (created.status >= 400) throw glossaryError(created, glossary, fail);
  const data: unknown = JSON.parse(created.body);
  if (!isObject(data) || typeof data.glossary_id !== "string") {
    throw new ProviderUnavailableError("DeepL created the glossary but sent no glossary id");
  }
  return data.glossary_id;
}

function glossaryList(body: string): { id: string; name: string }[] {
  const data: unknown = JSON.parse(body);
  const glossaries: unknown = isObject(data) ? data.glossaries : undefined;
  const list: unknown[] = Array.isArray(glossaries) ? glossaries : [];
  return list.flatMap((item) =>
    isObject(item) && typeof item.glossary_id === "string" && typeof item.name === "string"
      ? [{ id: item.glossary_id, name: item.name }]
      : [],
  );
}

/** A refused key is reported as such; any other glossary failure stops with what to do instead. */
function glossaryError(
  response: HttpResponse,
  glossary: { readonly source: string; readonly target: string },
  fail: (response: HttpResponse) => Error,
): Error {
  if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) {
    return fail(response);
  }
  return new ProviderUnavailableError(
    `DeepL could not make a glossary for ${glossary.source} → ${glossary.target} (HTTP ${response.status}): ` +
      `${errorDetail(response.body)}. Remove translation.glossary, or use another engine, to translate this project.`,
  );
}

/**
 * 403: wrong key, or a free key sent to the paid address. 456: character quota used up. 429 and 503: wait.
 * 413: request too large, retry smaller. Other 4xx: stop. 5xx: retry smaller.
 */
function httpError(response: HttpResponse, options: DeepLOptions, baseUrl: string): Error {
  const { status } = response;
  const detail = hideSecret(errorDetail(response.body), options.apiKey);
  if (status === 401 || status === 403) {
    return new ProviderUnavailableError(
      `DeepL refused the API key (HTTP ${status}): check the ${options.apiKeyEnv} environment variable. A free key ` +
        `ends with ":fx" and uses ${FREE_URL} (${detail})`,
    );
  }
  if (status === 404) return new ProviderUnavailableError(`DeepL was not found at ${baseUrl} (HTTP 404): ${detail}`);
  if (status === 456) {
    return new ProviderUnavailableError(`the character quota of this DeepL account is used up (HTTP 456): ${detail}`);
  }
  if (status === 429 || status === 503 || status === 529) {
    return new RateLimitError(`DeepL asks to slow down (HTTP ${status}): ${detail}`, retryAfterMs(response.headers));
  }
  if (status === 413) return new BatchError(`the request was too large for DeepL (HTTP 413): ${detail}`);
  if (status < 500) return new ProviderUnavailableError(`DeepL refused the request (HTTP ${status}): ${detail}`);
  return new BatchError(`DeepL failed on this batch (HTTP ${status}): ${detail}`);
}

/** DeepL errors look like {"message": "...", "detail": "..."}. */
function errorDetail(body: string): string {
  try {
    const data: unknown = JSON.parse(body);
    if (isObject(data) && typeof data.message === "string") {
      return typeof data.detail === "string" ? `${data.message} ${data.detail}` : data.message;
    }
  } catch {
    // not JSON: use the raw text
  }
  return body.slice(0, 200);
}
