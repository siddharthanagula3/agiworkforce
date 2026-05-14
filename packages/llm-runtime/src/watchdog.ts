/**
 * Stream idle watchdog.
 *
 * SDK-level fetch timeouts cover only the initial response head. Once
 * the body starts streaming, a silent-drop connection (NAT timeout,
 * cellular hand-off, proxy idle timeout, kernel-level TCP RST loss)
 * leaves the for-await loop hung indefinitely. This module wraps any
 * `AsyncIterable<T>` with a per-chunk timeout that aborts the iteration
 * when no data has arrived in `idleMs` milliseconds.
 *
 * Citation: `tasks/research/deep/m8-services-api.md` §1.2 phase 5
 * (`STREAM_IDLE_TIMEOUT_MS = 90s`) and `pkg-api-providers-normalize.md`
 * "Stream watchdog (P0)".
 *
 * The watchdog also emits a half-time warning event so the UI can show
 * "server slow…" before the full timeout fires.
 */

/**
 * Default per-chunk idle timeout. Anthropic's reference implementation
 * uses 90s. Our reasonable upper bound is the same — long-thinking
 * Claude Opus 4 calls can go ~60s between content blocks during deep
 * reasoning; 90s gives plenty of headroom while still catching truly
 * dropped sockets. Override per request when needed.
 */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 90_000;

/** A warning fires at half-time so the UI can render a status indicator. */
export const DEFAULT_STREAM_IDLE_WARNING_MS = 45_000;

/**
 * Sentinel error thrown when the watchdog fires. The retry generator
 * recognises this as a retryable transport error and the chat layer
 * shows a clear "stream timed out" message rather than the generic
 * connection-error banner.
 */
export class StreamIdleTimeoutError extends Error {
  readonly idleMs: number;
  constructor(idleMs: number) {
    super(`Stream idle timeout after ${idleMs}ms`);
    this.name = 'StreamIdleTimeoutError';
    this.idleMs = idleMs;
  }
}

/** Optional callbacks for instrumentation / UI surfaces. */
export interface WatchdogHooks {
  /** Fires once when the half-time warning threshold is crossed. */
  onHalfTimeWarning?: (elapsedMs: number) => void;
  /** Fires once on each chunk so callers can reset external counters. */
  onChunk?: () => void;
}

export interface WatchdogOptions {
  /** Per-chunk idle timeout. Default 90s. */
  idleMs?: number;
  /**
   * When to fire the half-time warning. Defaults to half of `idleMs`.
   * Pass `null` to suppress the warning entirely.
   */
  warningMs?: number | null;
  /**
   * Called by the watchdog when it fires; default behaviour throws
   * `StreamIdleTimeoutError` from inside the for-await loop.
   *
   * Override only when the caller needs a different escalation
   * (e.g. emit a structured chunk and let the consumer decide).
   */
  onTimeout?: (idleMs: number) => never | Error;
  /**
   * If supplied, the watchdog calls `signal.dispatchEvent(new Event('abort'))`-style
   * abort logic via this signal's controller. The caller is responsible
   * for routing the abort back to whatever cancels the underlying
   * fetch/stream.
   *
   * Watchdog does NOT abort the AbortController itself — that's the
   * adapter's job (e.g., calling `stream.controller.abort()` on the
   * SDK stream object). We only trigger by throwing.
   */
  hooks?: WatchdogHooks;
}

/**
 * Wrap an `AsyncIterable<T>` with a per-chunk idle watchdog. Returns
 * an `AsyncIterable<T>` of the same shape; throws
 * `StreamIdleTimeoutError` when the underlying iterator goes silent.
 *
 * Implementation detail: we don't use `AbortSignal.timeout` because
 * each chunk needs to *reset* the timer, not consume the same
 * abort-controller. We race the underlying iterator's `next()` against
 * a fresh-per-chunk timeout promise.
 */
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
                    // If onTimeout returns an Error instead of throwing, surface it.
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
        // Best-effort cleanup of underlying iterator. Anthropic's
        // `cleanupStream` calls `stream.controller.abort()` on early
        // exit; we mirror that contract by calling iterator.return()
        // when present.
        if (typeof iterator.return === 'function') {
          try {
            await iterator.return();
          } catch {
            /* swallow — cleanup must not mask the original error */
          }
        }
      }
    },
  };
}

/**
 * Empty-stream detector. Anthropic's `claude.ts:2350-2363` distinguishes
 * two failure modes inside the streaming loop:
 *   - Proxy returned 200 + non-SSE → no `message_start` ever observed.
 *   - Proxy returned `message_start` then dropped → no completed messages.
 *
 * Either is treated as a transport error and triggers the non-streaming
 * fallback. Adapters increment counters on the relevant chunks; this
 * helper makes the policy explicit and testable.
 */
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
