
import { createMessageQueue, type MessageQueue } from '@agiworkforce/client-runtime';
import type { QueuedCommand } from '@agiworkforce/client-runtime';

const STORAGE_KEY = 'agiworkforce.queue.vscode';

export interface MementoLike {
  get<T = unknown>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

let cached: MessageQueue | null = null;

/**
 * Singleton getter for the VS Code extension send queue.
 *
 * @param memento — typically `context.workspaceState`; pass `null` for a
 *                  volatile (in-memory only) queue.
 */
export function getVSCodeSendQueue(memento: MementoLike | null): MessageQueue {
  if (cached) return cached;
  if (memento) {
    cached = createMessageQueue({
      storage: {
        read: () => {
          const raw = memento.get<readonly QueuedCommand[]>(STORAGE_KEY);
          return Array.isArray(raw) ? raw : null;
        },
        write: (commands) => {
          Promise.resolve(memento.update(STORAGE_KEY, commands)).catch((err: unknown) => {
            console.error(
              `[agi] sendQueue: failed to persist queue — ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });
        },
      },
    });
  } else {
    cached = createMessageQueue();
  }
  return cached;
}

export function __resetVSCodeSendQueueForTests(): void {
  cached = null;
}
