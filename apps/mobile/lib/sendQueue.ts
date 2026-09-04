import {
  createKvStorageAdapter,
  createMessageQueue,
  type MessageQueue,
} from '@agiworkforce/client-runtime';
import { storage } from '@/lib/mmkv';

const QUEUE_STORAGE_KEY = 'agiworkforce.queue.mobile';

let cached: MessageQueue | null = null;

export function getMobileSendQueue(): MessageQueue {
  if (cached) return cached;
  const adapter = createKvStorageAdapter(QUEUE_STORAGE_KEY, {
    get: (key) => {
      try {
        const value = storage.getString(key);
        return value ?? null;
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        storage.set(key, value);
      } catch {
        return;
      }
    },
  });
  cached = createMessageQueue({ storage: adapter });
  return cached;
}

export function __resetMobileSendQueueForTests(): void {
  cached = null;
}
