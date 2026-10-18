import { BatchError, type Provider, type TranslationRequest } from "../../core/provider.js";

export interface MockOptions {
  /** Returns the translation of a source, or undefined to leave it out of the answer. */
  readonly translate?: (source: string, request: TranslationRequest) => string | undefined;
  /** Returns true to fail the batch, like an unreadable model answer. */
  readonly failBatch?: (request: TranslationRequest) => boolean;
  readonly model?: string;
}

export interface MockProvider extends Provider {
  /** Every request received, in order: tests check what was sent. */
  readonly requests: readonly TranslationRequest[];
}

/** A deterministic, offline provider for tests and dry runs. Default translation: "[fr] Hello". */
export function createMockProvider(options: MockOptions = {}): MockProvider {
  const requests: TranslationRequest[] = [];
  const translate = options.translate ?? ((source, request) => `[${request.targetLanguage}] ${source}`);

  return {
    model: options.model ?? "mock",
    requests,
    async translateBatch(request, signal) {
      signal?.throwIfAborted();
      requests.push(request);
      if (options.failBatch?.(request) === true) throw new BatchError("mock: unreadable answer");
      const result = new Map<number, string>();
      for (const item of request.items) {
        const translation = translate(item.source, request);
        if (translation !== undefined) result.set(item.id, translation);
      }
      return result;
    },
  };
}
