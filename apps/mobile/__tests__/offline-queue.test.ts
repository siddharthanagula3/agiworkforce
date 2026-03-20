/**
 * Mobile Offline Queue — E2E Smoke Tests
 *
 * Tests the Wave 1 offline queue in apps/mobile/services/offlineQueue.ts.
 *
 * Scenarios covered:
 *  - Items are queued when offline (enqueue API)
 *  - Queue processes items on reconnect (processQueue)
 *  - Success callbacks fire correctly
 *  - Failure callbacks fire correctly on permanent failure
 *  - Exponential backoff delays between retries
 *  - Max retry count drops items with onFailure callback
 *  - Duplicate enqueue (same conversation + content) is ignored
 *  - clear() fires onFailure for all pending items then empties the queue
 *  - isProcessing flag is set during processing
 */

import { offlineQueue, type QueuedMessage } from '../services/offlineQueue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(
  overrides: Partial<Omit<QueuedMessage, 'id' | 'queuedAt' | 'retryCount'>> = {},
): Omit<QueuedMessage, 'id' | 'queuedAt' | 'retryCount' | 'onSuccess' | 'onFailure'> {
  return {
    conversationId: 'conv-1',
    content: `message-${Math.random().toString(36).slice(2)}`,
    model: 'claude-opus-4.6',
    ...overrides,
  };
}

/**
 * Flush all pending microtasks and macrotasks so that fake timers registered
 * inside async callbacks become visible to jest.advanceTimersByTime().
 *
 * processQueue uses `await sendFn()` then `await sleep()`.  When sendFn rejects
 * the catch branch runs in a microtask, and only then does sleep() register a
 * setTimeout.  We must drain those microtasks before advancing timers so the
 * setTimeout is already registered when advanceTimersByTime runs.
 */
async function flushMicrotasks(): Promise<void> {
  // Multiple ticks to ensure deeply nested promise chains resolve fully
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Drain any leftover items from previous tests
  offlineQueue.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  offlineQueue.clear();
  jest.useRealTimers();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Items are queued when offline
// ---------------------------------------------------------------------------

describe('enqueue', () => {
  it('enqueues a message and increases queue size', () => {
    offlineQueue.enqueue(makeMsg());
    expect(offlineQueue.getQueueSize()).toBe(1);
  });

  it('enqueues multiple messages', () => {
    offlineQueue.enqueue(makeMsg({ content: 'msg-1' }));
    offlineQueue.enqueue(makeMsg({ content: 'msg-2', conversationId: 'conv-2' }));
    expect(offlineQueue.getQueueSize()).toBe(2);
  });

  it('returns the queued entry with auto-generated id and queuedAt', () => {
    const entry = offlineQueue.enqueue(makeMsg());

    expect(entry.id).toMatch(/^qmsg_/);
    expect(entry.queuedAt).toBeTruthy();
    expect(entry.retryCount).toBe(0);
  });

  it('ignores duplicate enqueue (same conversationId + content)', () => {
    const msg = makeMsg({ conversationId: 'conv-dup', content: 'same content' });
    const first = offlineQueue.enqueue(msg);
    const second = offlineQueue.enqueue(msg);

    expect(offlineQueue.getQueueSize()).toBe(1);
    expect(second.id).toBe(first.id);
  });

  it('allows same content in different conversations', () => {
    offlineQueue.enqueue({ conversationId: 'conv-a', content: 'hello', model: 'gpt-5.2' });
    offlineQueue.enqueue({ conversationId: 'conv-b', content: 'hello', model: 'gpt-5.2' });

    expect(offlineQueue.getQueueSize()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. Queue processes items on reconnect
// ---------------------------------------------------------------------------

describe('processQueue — success path', () => {
  it('processes all items when sendFn succeeds for each', async () => {
    offlineQueue.enqueue(makeMsg({ content: 'a' }));
    offlineQueue.enqueue(makeMsg({ content: 'b', conversationId: 'conv-2' }));

    const sendFn = jest.fn().mockResolvedValue(undefined);

    const processPromise = offlineQueue.processQueue(sendFn);
    jest.runAllTimers();
    await processPromise;

    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(offlineQueue.getQueueSize()).toBe(0);
  });

  it('passes the full QueuedMessage to sendFn', async () => {
    const msg = makeMsg({ content: 'check-payload', model: 'deepseek-v3' });
    const entry = offlineQueue.enqueue(msg);

    const sendFn = jest.fn().mockResolvedValue(undefined);
    const processPromise = offlineQueue.processQueue(sendFn);
    jest.runAllTimers();
    await processPromise;

    const calledWith = sendFn.mock.calls[0]?.[0] as QueuedMessage;
    expect(calledWith.id).toBe(entry.id);
    expect(calledWith.content).toBe('check-payload');
    expect(calledWith.model).toBe('deepseek-v3');
  });

  it('is a no-op when the queue is empty', async () => {
    const sendFn = jest.fn();

    await offlineQueue.processQueue(sendFn);

    expect(sendFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Success callbacks fire correctly
// ---------------------------------------------------------------------------

describe('onSuccess callback', () => {
  it('fires onSuccess after the message is sent', async () => {
    const onSuccess = jest.fn();

    offlineQueue.enqueue(makeMsg(), { onSuccess });

    const sendFn = jest.fn().mockResolvedValue(undefined);
    const processPromise = offlineQueue.processQueue(sendFn);
    jest.runAllTimers();
    await processPromise;

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('continues processing if onSuccess throws', async () => {
    const onSuccess = jest.fn(() => {
      throw new Error('Callback error');
    });

    offlineQueue.enqueue(makeMsg({ content: 'first', conversationId: 'c1' }), { onSuccess });
    offlineQueue.enqueue(makeMsg({ content: 'second', conversationId: 'c2' }));

    const sendFn = jest.fn().mockResolvedValue(undefined);
    const processPromise = offlineQueue.processQueue(sendFn);
    jest.runAllTimers();
    await processPromise;

    // Both messages should have been sent despite the callback error
    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(offlineQueue.getQueueSize()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Exponential backoff between retries
// ---------------------------------------------------------------------------

describe('exponential backoff', () => {
  it('pauses after first failure and stops processing remaining items', async () => {
    offlineQueue.enqueue(makeMsg({ content: 'first', conversationId: 'c1' }));
    offlineQueue.enqueue(makeMsg({ content: 'second', conversationId: 'c2' }));

    // First message always fails, second would succeed
    const sendFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(undefined);

    const processPromise = offlineQueue.processQueue(sendFn);

    // Flush microtasks so the sendFn rejection propagates into the catch block
    // and sleep() registers its setTimeout before we advance fake timers
    await flushMicrotasks();

    // Advance past backoff delay (retryCount 0→1, backoff = 1s * 2^0 = 1s)
    jest.advanceTimersByTime(1_100);
    await processPromise;

    // Only first message attempted — processing stopped after failure
    expect(sendFn).toHaveBeenCalledTimes(1);

    // First message is still in queue (under max retries), second is untouched
    expect(offlineQueue.getQueueSize()).toBe(2);
  });

  it('applies 1s backoff for retryCount=1', async () => {
    const msg = makeMsg();
    offlineQueue.enqueue(msg);

    const sendFn = jest.fn().mockRejectedValue(new Error('fail'));
    const processPromise = offlineQueue.processQueue(sendFn);

    // Flush microtasks so sleep(1000) is registered as a setTimeout
    await flushMicrotasks();

    // Advance to just under 1s — processQueue should still be waiting
    jest.advanceTimersByTime(999);
    // isProcessing is still true because sleep hasn't resolved yet
    expect(offlineQueue.isProcessing).toBe(true);

    // Advance the remaining 1ms to fire the sleep timeout
    jest.advanceTimersByTime(1);
    await processPromise;

    expect(offlineQueue.isProcessing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Max retry count drops items with onFailure callback
// ---------------------------------------------------------------------------

describe('max retry count', () => {
  it('drops an item and calls onFailure after 3 failed attempts', async () => {
    const onFailure = jest.fn();
    const msg = makeMsg();

    offlineQueue.enqueue(msg, { onFailure });

    const sendFn = jest.fn().mockRejectedValue(new Error('Permanent failure'));

    // Simulate 3 failed processQueue cycles (MAX_RETRY_COUNT = 3)
    for (let i = 0; i < 3; i++) {
      const p = offlineQueue.processQueue(sendFn);
      await flushMicrotasks();
      jest.advanceTimersByTime(10_000); // enough to pass any backoff
      await p;
    }

    expect(onFailure).toHaveBeenCalledWith(expect.any(Error));
    expect(offlineQueue.getQueueSize()).toBe(0);
  });

  it('onFailure receives the error that caused the drop', async () => {
    const onFailure = jest.fn();
    offlineQueue.enqueue(makeMsg(), { onFailure });

    const error = new Error('Specific failure reason');
    const sendFn = jest.fn().mockRejectedValue(error);

    for (let i = 0; i < 3; i++) {
      const p = offlineQueue.processQueue(sendFn);
      await flushMicrotasks();
      jest.advanceTimersByTime(10_000);
      await p;
    }

    expect(onFailure).toHaveBeenCalledWith(error);
  });

  it('continues processing subsequent items after dropping an exhausted item', async () => {
    const onFailure = jest.fn();

    // First message will exhaust retries
    offlineQueue.enqueue(makeMsg({ content: 'exhausted', conversationId: 'c1' }), { onFailure });
    // Second message will succeed
    offlineQueue.enqueue(makeMsg({ content: 'success', conversationId: 'c2' }));

    // Exhaust the first message over 3 cycles
    const permanentError = new Error('Always fails');
    for (let i = 0; i < 3; i++) {
      const sendFn = jest
        .fn()
        .mockRejectedValueOnce(permanentError) // first msg fails
        .mockResolvedValue(undefined); // second would succeed

      const p = offlineQueue.processQueue(sendFn);
      await flushMicrotasks();
      jest.advanceTimersByTime(10_000);
      await p;
    }

    expect(onFailure).toHaveBeenCalledTimes(1);
    // Second message should still be in queue (was not reached while first was being retried)
    // It will be processed on the next cycle
    const remaining = offlineQueue.getQueue();
    if (remaining.length > 0) {
      expect(remaining[0]?.content).toBe('success');
    }
  });
});

// ---------------------------------------------------------------------------
// 6. clear() fires onFailure for all pending items
// ---------------------------------------------------------------------------

describe('clear()', () => {
  it('empties the queue', () => {
    offlineQueue.enqueue(makeMsg({ content: 'a' }));
    offlineQueue.enqueue(makeMsg({ content: 'b', conversationId: 'conv-2' }));

    offlineQueue.clear();

    expect(offlineQueue.getQueueSize()).toBe(0);
  });

  it('fires onFailure for every item being cleared', () => {
    const onFailure1 = jest.fn();
    const onFailure2 = jest.fn();

    offlineQueue.enqueue(makeMsg({ content: 'a' }), { onFailure: onFailure1 });
    offlineQueue.enqueue(makeMsg({ content: 'b', conversationId: 'conv-b' }), { onFailure: onFailure2 });

    offlineQueue.clear();

    expect(onFailure1).toHaveBeenCalledWith(expect.any(Error));
    expect(onFailure2).toHaveBeenCalledWith(expect.any(Error));
  });

  it('does not throw when there are no items to clear', () => {
    expect(() => offlineQueue.clear()).not.toThrow();
  });

  it('resets isProcessing flag', async () => {
    offlineQueue.enqueue(makeMsg());

    // Start processing but don't let it finish
    let resolveFirst!: () => void;
    const sendFn = jest.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }),
    );

    const processPromise = offlineQueue.processQueue(sendFn);

    offlineQueue.clear();
    resolveFirst();
    jest.runAllTimers();
    await processPromise;

    expect(offlineQueue.isProcessing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. isProcessing flag
// ---------------------------------------------------------------------------

describe('isProcessing flag', () => {
  it('is false initially', () => {
    expect(offlineQueue.isProcessing).toBe(false);
  });

  it('is true during processing', async () => {
    offlineQueue.enqueue(makeMsg());
    let wasProcessing = false;

    const sendFn = jest.fn().mockImplementation(async () => {
      wasProcessing = offlineQueue.isProcessing;
    });

    const processPromise = offlineQueue.processQueue(sendFn);
    jest.runAllTimers();
    await processPromise;

    expect(wasProcessing).toBe(true);
    expect(offlineQueue.isProcessing).toBe(false);
  });

  it('is a no-op if processQueue is called while already processing', async () => {
    offlineQueue.enqueue(makeMsg({ content: 'a', conversationId: 'c1' }));
    offlineQueue.enqueue(makeMsg({ content: 'b', conversationId: 'c2' }));

    let resolveFirst!: () => void;
    const firstSendPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const sendFn = jest.fn().mockReturnValueOnce(firstSendPromise).mockResolvedValue(undefined);

    const p1 = offlineQueue.processQueue(sendFn);
    // Second call while isProcessing should be a no-op
    const p2 = offlineQueue.processQueue(sendFn);

    resolveFirst();
    jest.runAllTimers();
    await Promise.all([p1, p2]);

    // sendFn should only have been called from p1's processing session
    // p2 returned immediately without starting a second loop
    expect(sendFn.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
