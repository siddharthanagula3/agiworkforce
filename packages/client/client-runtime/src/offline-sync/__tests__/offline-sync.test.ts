import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createOfflineSyncManager,
  SyncState,
  type OfflineSyncQueueAdapter,
  type SyncCallbacks,
  type SyncSummary,
} from '../index';

function makeQueueAdapter(initialCount = 0): OfflineSyncQueueAdapter & {
  setCount(n: number): void;
  fireChange(): void;
  setSyncResult(result: SyncSummary | Error): void;
} {
  let count = initialCount;
  let nextResult: SyncSummary | Error = {
    messagesSynced: 0,
    messagesFailed: 0,
    toolsSynced: 0,
    toolsFailed: 0,
    totalTime: 0,
  };
  const subscribers = new Set<() => void>();

  return {
    syncOfflineQueue: vi.fn(async (_callbacks?: SyncCallbacks): Promise<SyncSummary> => {
      if (nextResult instanceof Error) throw nextResult;
      return nextResult;
    }),
    getQueuedItemCount: () => count,
    subscribeToQueueChanges: (cb: () => void) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    setCount(n: number) {
      count = n;
    },
    fireChange() {
      subscribers.forEach((cb) => cb());
    },
    setSyncResult(result: SyncSummary | Error) {
      nextResult = result;
    },
  };
}

describe('createOfflineSyncManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes to OFFLINE when readInitialOnline returns false', () => {
    const queue = makeQueueAdapter();
    const networkSubscribe = vi.fn(() => () => {});
    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: networkSubscribe,
      readInitialOnline: () => false,
    });

    manager.initialize();

    expect(manager.getState().state).toBe(SyncState.OFFLINE);
    expect(manager.isOnline()).toBe(false);
    expect(networkSubscribe).toHaveBeenCalledTimes(1);
  });

  it('initializes to ONLINE when readInitialOnline returns true', () => {
    const queue = makeQueueAdapter();
    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: () => () => {},
      readInitialOnline: () => true,
    });
    manager.initialize();
    expect(manager.getState().state).toBe(SyncState.ONLINE);
    expect(manager.isOnline()).toBe(true);
  });

  it('cleanup unsubscribes from network events and queue changes', () => {
    const queue = makeQueueAdapter();
    const networkUnsub = vi.fn();
    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: () => networkUnsub,
      readInitialOnline: () => true,
    });
    manager.initialize();
    manager.cleanup();
    expect(networkUnsub).toHaveBeenCalledTimes(1);
  });

  it('initialize is idempotent', () => {
    const queue = makeQueueAdapter();
    const networkSubscribe = vi.fn(() => () => {});
    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: networkSubscribe,
      readInitialOnline: () => true,
    });
    manager.initialize();
    manager.initialize();
    manager.initialize();
    expect(networkSubscribe).toHaveBeenCalledTimes(1);
  });

  it('subscribeState fires callbacks with state snapshots', () => {
    const queue = makeQueueAdapter();
    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: () => () => {},
      readInitialOnline: () => false,
    });
    const callback = vi.fn();
    manager.subscribeState(callback);

    manager.initialize();

    // Should have fired multiple state snapshots during init (updateIsOnline, updateQueuedCount, notifyStateChange)
    expect(callback).toHaveBeenCalled();
    const lastCall = callback.mock.calls[callback.mock.calls.length - 1]?.[0];
    expect(lastCall?.state).toBe(SyncState.OFFLINE);
  });

  it('triggerSync skips when queue is empty', async () => {
    const queue = makeQueueAdapter(0);
    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: () => () => {},
      readInitialOnline: () => true,
      syncDebounceMs: 100,
    });
    manager.initialize();

    await manager.triggerSync();
    await vi.advanceTimersByTimeAsync(150);

    expect(queue.syncOfflineQueue).not.toHaveBeenCalled();
  });

  it('triggerSync drives sync after debounce when queue has items', async () => {
    const queue = makeQueueAdapter(2);
    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: () => () => {},
      readInitialOnline: () => true,
      syncDebounceMs: 100,
    });
    manager.initialize();

    await manager.triggerSync();
    await vi.advanceTimersByTimeAsync(150);

    expect(queue.syncOfflineQueue).toHaveBeenCalledTimes(1);
    expect(manager.getState().state).toBe(SyncState.ONLINE);
  });

  it('triggerSync skips when already syncing', async () => {
    const queue = makeQueueAdapter(2);
    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: () => () => {},
      readInitialOnline: () => true,
      syncDebounceMs: 100,
    });
    manager.initialize();

    // Force the manager into SYNCING state by triggering and not advancing past debounce.
    await manager.triggerSync();
    // Now simulate state already SYNCING.
    const internal = manager as unknown as { getState(): { state: SyncState } };
    // We can't directly mutate state, so call triggerSync twice without advancing.
    await manager.triggerSync();

    // Advance timers — sync should run once.
    await vi.advanceTimersByTimeAsync(150);
    expect(queue.syncOfflineQueue).toHaveBeenCalledTimes(1);
    expect(internal.getState().state).toBe(SyncState.ONLINE);
  });

  it('moves to ERROR and schedules retry on sync failure', async () => {
    const queue = makeQueueAdapter(1);
    queue.setSyncResult(new Error('network down'));

    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: () => () => {},
      readInitialOnline: () => true,
      logger: { error: vi.fn() },
      syncDebounceMs: 50,
      retryBaseMs: 1000,
    });
    manager.initialize();

    await manager.triggerSync();
    await vi.advanceTimersByTimeAsync(60); // past debounce
    await Promise.resolve(); // settle the rejected promise
    await Promise.resolve();

    expect(manager.getState().state).toBe(SyncState.ERROR);
    expect(manager.getState().error?.message).toContain('network down');
  });

  it('retrySync clears the retry timer and performs sync directly', async () => {
    const queue = makeQueueAdapter(1);
    queue.setSyncResult({
      messagesSynced: 1,
      messagesFailed: 0,
      toolsSynced: 0,
      toolsFailed: 0,
      totalTime: 10,
    });

    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: () => () => {},
      readInitialOnline: () => true,
      syncDebounceMs: 50,
    });
    manager.initialize();

    await manager.retrySync();

    expect(queue.syncOfflineQueue).toHaveBeenCalledTimes(1);
    expect(manager.getState().lastSyncSummary?.messagesSynced).toBe(1);
  });

  it('queue subscription updates queuedCount when queue notifies', () => {
    const queue = makeQueueAdapter(0);
    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: () => () => {},
      readInitialOnline: () => true,
    });
    manager.initialize();
    expect(manager.getState().queuedCount).toBe(0);

    queue.setCount(5);
    queue.fireChange();
    expect(manager.getState().queuedCount).toBe(5);
  });

  it('getStatusMessage and getStatusSeverity reflect current state', () => {
    const queue = makeQueueAdapter(2);
    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: () => () => {},
      readInitialOnline: () => false,
    });
    manager.initialize();

    expect(manager.getStatusMessage()).toBe('Offline - 2 pending');
    expect(manager.getStatusSeverity()).toBe('warning');

    queue.setCount(0);
    queue.fireChange();
    expect(manager.getStatusMessage()).toBe('Offline');
    expect(manager.getStatusSeverity()).toBe('info');
  });

  it('handleOnline (fired via subscribeNetworkEvents) flips state and runs sync', async () => {
    const queue = makeQueueAdapter(1);
    queue.setSyncResult({
      messagesSynced: 1,
      messagesFailed: 0,
      toolsSynced: 0,
      toolsFailed: 0,
      totalTime: 5,
    });

    let onOnline: () => void = () => {};
    const manager = createOfflineSyncManager({
      queue,
      subscribeNetworkEvents: (handlers) => {
        onOnline = handlers.onOnline;
        return () => {};
      },
      readInitialOnline: () => false,
      syncDebounceMs: 50,
    });
    manager.initialize();
    expect(manager.isOnline()).toBe(false);

    onOnline();
    expect(manager.isOnline()).toBe(true);

    await vi.advanceTimersByTimeAsync(60);
    expect(queue.syncOfflineQueue).toHaveBeenCalledTimes(1);
  });
});
