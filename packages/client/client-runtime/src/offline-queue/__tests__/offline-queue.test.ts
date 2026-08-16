import { describe, it, expect, vi } from 'vitest';
import { createOfflineQueue, type OfflineQueueLogger, type OfflineQueueStorage } from '../index';

function inMemoryStorage(): OfflineQueueStorage & { snapshot: Record<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    snapshot: Object.fromEntries(store.entries()),
    getJSON<T>(key: string, defaultValue: T): T {
      const v = store.get(key);
      return v === undefined ? defaultValue : (v as T);
    },
    setJSON<T>(key: string, value: T): unknown {
      store.set(key, value);
      return true;
    },
    remove(key: string): void {
      store.delete(key);
    },
  };
}

function silentLogger(): OfflineQueueLogger {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  };
}

describe('createOfflineQueue', () => {
  it('queues a message and reflects it in count + items', () => {
    const storage = inMemoryStorage();
    const queue = createOfflineQueue({ storage, logger: silentLogger() });

    const id = queue.queueMessage('sess_1', 'hello world');

    expect(id).toMatch(/^msg_/);
    expect(queue.getQueuedItemCount()).toBe(1);
    const { messages } = queue.getQueuedItems();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.sessionId).toBe('sess_1');
    expect(messages[0]?.content).toBe('hello world');
    expect(messages[0]?.retryCount).toBe(0);
  });

  it('rejects empty sessionId or content for queueMessage', () => {
    const queue = createOfflineQueue({ storage: inMemoryStorage(), logger: silentLogger() });
    expect(() => queue.queueMessage('', 'x')).toThrow(/required/);
    expect(() => queue.queueMessage('sess', '')).toThrow(/required/);
  });

  it('queues a tool execution and clears it on demand', () => {
    const queue = createOfflineQueue({ storage: inMemoryStorage(), logger: silentLogger() });
    const id = queue.queueToolExecution('sess', 'shell.run', { cmd: 'ls' });

    expect(id).toMatch(/^tool_/);
    expect(queue.getQueuedItemCount()).toBe(1);

    queue.clearQueuedToolExecution(id);
    expect(queue.getQueuedItemCount()).toBe(0);
  });

  it('clearAllQueued empties everything', () => {
    const queue = createOfflineQueue({ storage: inMemoryStorage(), logger: silentLogger() });
    queue.queueMessage('s', 'a');
    queue.queueMessage('s', 'b');
    queue.queueToolExecution('s', 't', {});

    expect(queue.getQueuedItemCount()).toBe(3);
    queue.clearAllQueued();
    expect(queue.getQueuedItemCount()).toBe(0);
  });

  it('syncOfflineQueue clears messages once onMessageSync resolves', async () => {
    const queue = createOfflineQueue({ storage: inMemoryStorage(), logger: silentLogger() });
    queue.queueMessage('s', 'a');
    queue.queueMessage('s', 'b');

    const onMessageSync = vi.fn().mockResolvedValue(undefined);
    const summary = await queue.syncOfflineQueue({ onMessageSync });

    expect(onMessageSync).toHaveBeenCalledTimes(2);
    expect(summary.messagesSynced).toBe(2);
    expect(summary.messagesFailed).toBe(0);
    expect(queue.getQueuedItemCount()).toBe(0);
  });

  it('syncOfflineQueue increments retry count when onMessageSync rejects', async () => {
    const queue = createOfflineQueue({ storage: inMemoryStorage(), logger: silentLogger() });
    const id = queue.queueMessage('s', 'a');

    const onMessageSync = vi.fn().mockRejectedValue(new Error('network failed'));
    const summary = await queue.syncOfflineQueue({ onMessageSync });

    expect(summary.messagesFailed).toBe(1);
    expect(summary.messagesSynced).toBe(0);

    const status = queue.getMessageRetryStatus(id);
    expect(status?.retryCount).toBe(1);
    expect(status?.canRetry).toBe(true);
  });

  it('syncOfflineQueue drops messages once max retries are hit', async () => {
    const queue = createOfflineQueue({
      storage: inMemoryStorage(),
      logger: silentLogger(),
      maxRetries: 2,
    });
    queue.queueMessage('s', 'a');

    const onMessageSync = vi.fn().mockRejectedValue(new Error('network failed'));
    await queue.syncOfflineQueue({ onMessageSync });
    await queue.syncOfflineQueue({ onMessageSync });
    await queue.syncOfflineQueue({ onMessageSync });

    expect(queue.getQueuedItemCount()).toBe(0);
  });

  it('syncOfflineQueue rethrows when onMessageSync returns a 401', async () => {
    const queue = createOfflineQueue({ storage: inMemoryStorage(), logger: silentLogger() });
    queue.queueMessage('s', 'a');

    const onMessageSync = vi.fn().mockRejectedValue(new Error('HTTP 401 unauthorized'));
    await expect(queue.syncOfflineQueue({ onMessageSync })).rejects.toThrow(/401/);
  });

  it('probeOnline=false short-circuits sync with onSyncComplete(false, summary)', async () => {
    const queue = createOfflineQueue({
      storage: inMemoryStorage(),
      logger: silentLogger(),
      probeOnline: async () => false,
    });
    queue.queueMessage('s', 'a');

    const onMessageSync = vi.fn().mockResolvedValue(undefined);
    const onSyncComplete = vi.fn();
    await queue.syncOfflineQueue({ onMessageSync, onSyncComplete });

    expect(onMessageSync).not.toHaveBeenCalled();
    expect(onSyncComplete).toHaveBeenCalledWith(false, expect.any(Object));
  });

  it('subscribeToQueueChanges fires via injected onStorageChange', () => {
    const subscribers = new Map<string, Set<() => void>>();
    const onStorageChange = (key: string, cb: () => void) => {
      let set = subscribers.get(key);
      if (!set) {
        set = new Set();
        subscribers.set(key, set);
      }
      set.add(cb);
      return () => set!.delete(cb);
    };

    const queue = createOfflineQueue({
      storage: inMemoryStorage(),
      logger: silentLogger(),
      onStorageChange,
      storageKey: 'test_key',
    });

    const callback = vi.fn();
    const unsubscribe = queue.subscribeToQueueChanges(callback);

    expect(subscribers.get('test_key')?.size).toBe(1);
    subscribers.get('test_key')!.forEach((c) => c());
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(subscribers.get('test_key')?.size).toBe(0);
  });

  it('subscribeToQueueChanges returns a no-op unsubscribe when onStorageChange is absent', () => {
    const queue = createOfflineQueue({ storage: inMemoryStorage(), logger: silentLogger() });
    const unsubscribe = queue.subscribeToQueueChanges(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });

  it('getMessageRetryStatus returns null for unknown ids', () => {
    const queue = createOfflineQueue({ storage: inMemoryStorage(), logger: silentLogger() });
    expect(queue.getMessageRetryStatus('does-not-exist')).toBeNull();
  });

  it('getLastSyncTime returns null pre-sync, Date post-sync', async () => {
    const queue = createOfflineQueue({ storage: inMemoryStorage(), logger: silentLogger() });
    expect(queue.getLastSyncTime()).toBeNull();

    queue.queueMessage('s', 'a');
    await queue.syncOfflineQueue({ onMessageSync: vi.fn().mockResolvedValue(undefined) });

    const last = queue.getLastSyncTime();
    expect(last).toBeInstanceOf(Date);
  });

  it('uses injected generateId so consumers can deterministic-test', () => {
    let counter = 0;
    const generateId = (prefix: 'msg' | 'tool') => `${prefix}_test_${counter++}`;
    const queue = createOfflineQueue({
      storage: inMemoryStorage(),
      logger: silentLogger(),
      generateId,
    });

    expect(queue.queueMessage('s', 'a')).toBe('msg_test_0');
    expect(queue.queueToolExecution('s', 't', {})).toBe('tool_test_1');
  });
});
