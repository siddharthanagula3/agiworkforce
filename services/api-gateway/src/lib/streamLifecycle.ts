import type { EventEmitter } from 'node:events';

/**
 * Raised when the gateway-owned provider deadline expires.
 *
 * The provider adapter receives the same aborted signal while `next()` also
 * rejects immediately. Racing the read matters because an SDK or test double
 * can ignore AbortSignal and otherwise hold an Express request open forever.
 */
export class StreamDeadlineError extends Error {
  constructor() {
    super('The upstream provider request exceeded the gateway deadline.');
    this.name = 'StreamDeadlineError';
  }
}

/** Raised when the downstream client disconnects before the provider finishes. */
export class StreamClientAbortError extends Error {
  constructor() {
    super('The downstream client disconnected.');
    this.name = 'StreamClientAbortError';
  }
}

export type DrainableWritable = Pick<EventEmitter, 'once' | 'removeListener'> & {
  readonly destroyed: boolean;
  readonly writableEnded: boolean;
};

export interface StreamLifecycle {
  readonly signal: AbortSignal;
  next<T>(iterator: AsyncIterator<T>): Promise<IteratorResult<T>>;
  waitForDrain(writable: DrainableWritable): Promise<void>;
  abortClient(): void;
  release<T>(iterator: AsyncIterator<T>): void;
  cleanup(): void;
}

/**
 * Own cancellation and cleanup for one provider iterator.
 *
 * Product policy remains in the route. This helper only owns the reusable
 * mechanics: deadline, abort-aware reads, and best-effort iterator release.
 */
export function createStreamLifecycle({ deadlineMs }: { deadlineMs: number }): StreamLifecycle {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    throw new TypeError('deadlineMs must be a positive finite number');
  }

  const controller = new AbortController();
  const releasedIterators = new WeakSet<object>();
  let cleanedUp = false;

  const deadline = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new StreamDeadlineError());
    }
  }, deadlineMs);
  (deadline as unknown as { unref?: () => void }).unref?.();

  const next = async <T>(iterator: AsyncIterator<T>): Promise<IteratorResult<T>> => {
    if (controller.signal.aborted) {
      throw controller.signal.reason;
    }

    return new Promise<IteratorResult<T>>((resolve, reject) => {
      let settled = false;

      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        controller.signal.removeEventListener('abort', onAbort);
        callback();
      };

      const onAbort = (): void => {
        settle(() => reject(controller.signal.reason));
      };

      controller.signal.addEventListener('abort', onAbort, { once: true });

      Promise.resolve()
        .then(() => {
          if (controller.signal.aborted) throw controller.signal.reason;
          return iterator.next();
        })
        .then(
          (value) => settle(() => resolve(value)),
          (error: unknown) => settle(() => reject(error)),
        );
    });
  };

  const waitForDrain = async (writable: DrainableWritable): Promise<void> => {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (writable.destroyed || writable.writableEnded) {
      abortClient();
      throw controller.signal.reason;
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanupListeners = (): void => {
        writable.removeListener('drain', onDrain);
        writable.removeListener('close', onClose);
        writable.removeListener('error', onSocketError);
        controller.signal.removeEventListener('abort', onAbort);
      };

      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        callback();
      };

      const onDrain = (): void => settle(resolve);
      const abortForSocket = (): void => {
        if (!controller.signal.aborted) {
          controller.abort(new StreamClientAbortError());
        }
        settle(() => reject(controller.signal.reason));
      };
      const onClose = (): void => abortForSocket();
      const onSocketError = (): void => abortForSocket();
      const onAbort = (): void => settle(() => reject(controller.signal.reason));

      writable.once('drain', onDrain);
      writable.once('close', onClose);
      writable.once('error', onSocketError);
      controller.signal.addEventListener('abort', onAbort, { once: true });

      // Close can race between the preflight check and listener attachment.
      if (writable.destroyed || writable.writableEnded) abortForSocket();
    });
  };

  const abortClient = (): void => {
    if (!controller.signal.aborted) {
      controller.abort(new StreamClientAbortError());
    }
  };

  const release = <T>(iterator: AsyncIterator<T>): void => {
    const identity = iterator as object;
    if (releasedIterators.has(identity)) return;
    releasedIterators.add(identity);

    try {
      const result = iterator.return?.();
      if (result) {
        void Promise.resolve(result).catch(() => undefined);
      }
    } catch {
      // Iterator release is best-effort. The primary request outcome has
      // already been decided, so a provider cleanup failure must not replace it.
    }
  };

  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(deadline);
  };

  return {
    signal: controller.signal,
    next,
    waitForDrain,
    abortClient,
    release,
    cleanup,
  };
}
