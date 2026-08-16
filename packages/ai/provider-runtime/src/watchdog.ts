
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 90_000;

export const DEFAULT_STREAM_IDLE_WARNING_MS = 45_000;

export class StreamIdleTimeoutError extends Error {
  readonly idleMs: number;
  constructor(idleMs: number) {
    super(`Stream idle timeout after ${idleMs}ms`);
    this.name = 'StreamIdleTimeoutError';
    this.idleMs = idleMs;
  }
}

export interface WatchdogHooks {
  onHalfTimeWarning?: (elapsedMs: number) => void;
  onChunk?: () => void;
}

export interface WatchdogOptions {
  idleMs?: number;
  warningMs?: number | null;
  onTimeout?: (idleMs: number) => never | Error;
  hooks?: WatchdogHooks;
}

export function withStreamIdleWatchdog<T>(
  source: AsyncIterable<T>,
  options: WatchdogOptions = {},
): AsyncIterable<T> {
  const idleMs = options.idleMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  const warningRaw = options.warningMs === undefined ? Math.floor(idleMs / 2) : options.warningMs;
  const warningMs = warningRaw === null ? null : warningRaw;
  const hooks = options.hooks;

  return {
    async *[Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      try {
        while (true) {
          const start = Date.now();
          let warningTimer: ReturnType<typeof setTimeout> | null = null;
          let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

          try {
            const next = await new Promise<IteratorResult<T>>((resolve, reject) => {
              if (warningMs !== null && hooks?.onHalfTimeWarning) {
                warningTimer = setTimeout(() => {
                  warningTimer = null;
                  try {
                    hooks.onHalfTimeWarning?.(Date.now() - start);
                  } catch {
                    /* swallow — warning is a fire-and-forget hook */
                  }
                }, warningMs);
              }
              timeoutTimer = setTimeout(() => {
                timeoutTimer = null;
                if (options.onTimeout) {
                  try {
                    const result = options.onTimeout(idleMs);
                    if (result instanceof Error) reject(result);
                    else reject(new StreamIdleTimeoutError(idleMs));
                  } catch (e) {
                    reject(e);
                  }
                } else {
                  reject(new StreamIdleTimeoutError(idleMs));
                }
              }, idleMs);

              iterator.next().then(resolve, reject);
            });
            if (next.done) return;
            try {
              hooks?.onChunk?.();
            } catch {
              /* swallow */
            }
            yield next.value;
          } finally {
            if (warningTimer) clearTimeout(warningTimer);
            if (timeoutTimer) clearTimeout(timeoutTimer);
          }
        }
      } finally {
        if (typeof iterator.return === 'function') {
          try {
            void iterator.return().catch(() => undefined);
          } catch {
            /* swallow — cleanup must not mask the original error */
          }
        }
      }
    },
  };
}

export class EmptyStreamError extends Error {
  readonly variant: 'no_message_start' | 'started_but_no_completion';
  constructor(variant: 'no_message_start' | 'started_but_no_completion') {
    super(
      variant === 'no_message_start'
        ? 'Stream ended without receiving any events'
        : 'Stream ended without completing any messages',
    );
    this.name = 'EmptyStreamError';
    this.variant = variant;
  }
}
