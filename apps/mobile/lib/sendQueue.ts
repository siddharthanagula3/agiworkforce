/**
 * Mobile send-pipeline queue — wraps `messageQueueManager` with an
 * MMKV-backed storage adapter so `next` and `later` lanes survive app
 * restart and OS-driven process kills.
 *
 * Mobile is more sensitive to process death than desktop/web because iOS
 * and Android aggressively reclaim memory from background apps. Persisting
 * the lower-priority lanes means a queued task notification (`later`) or a
 * deferred user prompt (`next`) survives the kill and resumes when the user
 * reopens the app.
 */

import {
  createKvStorageAdapter,
  createMessageQueue,
  type MessageQueue,
} from '@agiworkforce/runtime';
import { storage } from '@/lib/mmkv';

const QUEUE_STORAGE_KEY = 'agiworkforce.queue.mobile';

let cached: MessageQueue | null = null;

/**
 * Return the singleton mobile send queue. The first call creates the queue
 * and wires its persistence adapter to MMKV; subsequent calls return the
 * same instance.
 *
 * MMKV is initialized lazily by `initMmkvEncryption()` at app boot — until
 * that resolves, the storage proxy returns no-op getters. The queue handles
 * `null` reads gracefully so first-frame access doesn't crash.
 */
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
        // MMKV not yet initialized — drop the write; queue stays in-memory.
      }
    },
  });
  cached = createMessageQueue({ storage: adapter });
  return cached;
}

/**
 * Reset the cached queue. Used by tests; production code should never call this.
 */
export function __resetMobileSendQueueForTests(): void {
  cached = null;
}
