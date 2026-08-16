
import { createMessageQueue, type MessageQueue } from '@agiworkforce/client-runtime';
import type { QueuedCommand } from '@agiworkforce/client-runtime';

const STORAGE_KEY = 'agiworkforce.queue.extension';

let cachedSnapshot: readonly QueuedCommand[] | null = null;

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

export function __resetExtensionSendQueueForTests(): void {
  cached = null;
  cachedSnapshot = null;
}
