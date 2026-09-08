import 'server-only';

import { DURABLE_STREAM_WRITE_DEADLINE_MS } from '@/lib/deadline-policy';

export interface BoundedDurableWriter {
  write: (bytes: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  isUnreadable: () => boolean;
}

interface WriterLike {
  write: (bytes: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
}

/**
 * A durable stream write that cannot outlive its reader.
 *
 * `WritableStreamDefaultWriter.write` resolves when the consumer takes the
 * chunk, so once the request that was reading the stream is gone the promise
 * simply never settles. Every path that ends a run wrote to this stream, so a
 * departed reader stopped runs from ever reaching a terminal state and the
 * platform killed each replay in turn.
 *
 * Dropping a frame here costs nothing a reader can see: the journal is written
 * first and unconditionally, and a client that reattaches replays from the
 * journal rather than from this stream. Once a write misses its deadline the
 * stream is treated as gone for the rest of the invocation, because a second
 * write would only queue behind the first.
 */
export function createBoundedDurableWriter(
  writer: WriterLike,
  options: { onUnreadable: () => void; deadlineMs?: number },
): BoundedDurableWriter {
  const deadlineMs = options.deadlineMs ?? DURABLE_STREAM_WRITE_DEADLINE_MS;
  let unreadable = false;

  const bounded = async (attempt: Promise<void>): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<'expired'>((resolve) => {
      timer = setTimeout(() => resolve('expired'), deadlineMs);
    });
    try {
      const outcome = await Promise.race([attempt.then(() => 'written' as const), expired]);
      if (outcome === 'expired') {
        unreadable = true;
        options.onUnreadable();
      }
    } catch {
      unreadable = true;
      options.onUnreadable();
    } finally {
      if (timer) clearTimeout(timer);
      attempt.then(
        () => undefined,
        () => undefined,
      );
    }
  };

  return {
    write: async (bytes) => {
      if (unreadable) return;
      await bounded(writer.write(bytes));
    },
    close: async () => {
      if (unreadable) return;
      await bounded(writer.close());
    },
    isUnreadable: () => unreadable,
  };
}
