/**
 * VS Code extension send-pipeline queue.
 *
 * Wraps `messageQueueManager` from `@agiworkforce/client-runtime` with a
 * `vscode.Memento`-backed storage adapter so the `next` and `later` lanes
 * survive window-reload events. The backing store IS `ExtensionContext.
 * workspaceState` (persisted, workspace-scoped) — so callers must NOT enqueue
 * secret payloads; only command/intent metadata belongs in the queue.
 *
 * The queue is opt-in: callers must pass a `vscode.Memento` (typically
 * `context.workspaceState`) at first call. Subsequent calls return the
 * cached singleton.
 */

import { createMessageQueue, type MessageQueue } from '@agiworkforce/client-runtime';
import type { QueuedCommand } from '@agiworkforce/client-runtime';

const STORAGE_KEY = 'agiworkforce.queue.vscode';

/** Minimal Memento shape — matches `vscode.Memento` to avoid a hard import. */
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
          // Fire-and-forget (VS Code also persists state on host shutdown), but
          // surface a failed flush so a dropped persist is observable rather
          // than silently lost (audit 217 L43).
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

/** Test-only reset hook. */
export function __resetVSCodeSendQueueForTests(): void {
  cached = null;
}
