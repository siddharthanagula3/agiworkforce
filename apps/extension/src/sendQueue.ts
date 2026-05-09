/**
 * Chrome extension send-pipeline queue.
 *
 * Wraps `messageQueueManager` from @agiworkforce/runtime with a
 * synchronous-shaped wrapper around `chrome.storage.local`. The async
 * Chrome storage API is fire-and-forget here — reads return the cached
 * snapshot and writes are dispatched without awaiting; the queue stays
 * in-memory authoritative.
 */

import { createMessageQueue, type MessageQueue } from '@agiworkforce/runtime';
import type { QueuedCommand } from '@agiworkforce/runtime';

const STORAGE_KEY = 'agiworkforce.queue.extension';

/** Read-through cache of the persisted queue snapshot. */
let cachedSnapshot: readonly QueuedCommand[] | null = null;

/** Initialize the cache from chrome.storage.local at module load. */
function bootstrapCache(): void {
  try {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const raw = result?.[STORAGE_KEY];
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) cachedSnapshot = parsed as QueuedCommand[];
        } catch {
          // ignore corrupt persisted state
        }
      }
    });
  } catch {
    // chrome.storage unavailable — operate purely in-memory.
  }
}
bootstrapCache();

let cached: MessageQueue | null = null;

/**
 * Singleton getter for the Chrome extension send queue.
 * Storage adapter writes back to chrome.storage.local fire-and-forget.
 */
export function getExtensionSendQueue(): MessageQueue {
  if (cached) return cached;
  cached = createMessageQueue({
    storage: {
      read: () => cachedSnapshot,
      write: (commands) => {
        cachedSnapshot = commands;
        try {
          chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(commands) });
        } catch {
          // swallow — extension still works with volatile queue
        }
      },
    },
  });
  return cached;
}

/** Test-only reset hook. */
export function __resetExtensionSendQueueForTests(): void {
  cached = null;
  cachedSnapshot = null;
}
