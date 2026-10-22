/**
 * What batches running at the same time share: one pause when the engine asks to slow down, a wait that Ctrl+C ends,
 * and saves made one after the other. Nothing here knows about translation.
 */

/** One wait shared by every batch of the run. A rate limit met during a wait joins it rather than adding another. */
export class SharedPause {
  private current: Promise<void> | undefined;

  constructor(
    private readonly wait: (ms: number, signal?: AbortSignal) => Promise<void>,
    private readonly signal: AbortSignal | undefined,
  ) {}

  /** Starts a wait, unless one is running. True when it started one. */
  start(ms: number): boolean {
    if (this.current !== undefined) return false;
    this.current = this.wait(ms, this.signal).finally(() => {
      this.current = undefined;
    });
    return true;
  }

  /** Ends with the current wait, at once if there is none. Rejects if the run is interrupted meanwhile. */
  done(): Promise<void> {
    return this.current ?? Promise.resolve();
  }
}

/** Waits, or rejects as soon as the signal aborts: Ctrl+C never waits for the end of a rate limit. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs the calls one after the other, never at the same time: two batches that end together must not write the
 * memory file at once. Each call waits for the previous one, even if it failed.
 */
export function oneAtATime(task: () => Promise<void>): () => Promise<void> {
  let last: Promise<void> = Promise.resolve();
  return () => {
    const current = last.then(task, task);
    last = current.catch(() => {}); // a failed save is reported to its caller, not to the next one
    return current;
  };
}

/**
 * A function call, not `signal?.aborted` inline: TypeScript would remember the value checked before an
 * await and consider it unchanged, while an interruption can happen at any time.
 */
export function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}
