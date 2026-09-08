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
