/**
 * VS Code extension send-pipeline queue.
 *
 * Wraps `messageQueueManager` from `@agiworkforce/runtime` with a
 * `vscode.Memento`-backed storage adapter so the `next` and `later` lanes
 * survive window-reload events without leaking secret data into the
 * `ExtensionContext.workspaceState` (which would persist across reloads
 * but stays scoped to the workspace).
 *
 * The queue is opt-in: callers must pass a `vscode.Memento` (typically
 * `context.workspaceState`) at first call. Subsequent calls return the
 * cached singleton.
 */

import { createMessageQueue, type MessageQueue } from '@agiworkforce/runtime';
import type { QueuedCommand } from '@agiworkforce/runtime';

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
          // Memento.update is async but our adapter is fire-and-forget;
          // VS Code persists state on host shutdown so a missed flush is
          // bounded.
          void memento.update(STORAGE_KEY, commands);
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
