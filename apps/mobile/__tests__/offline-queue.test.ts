import { offlineQueue, type QueuedMessage } from '../services/offlineQueue';

function makeMsg(
  overrides: Partial<Omit<QueuedMessage, 'id' | 'queuedAt' | 'retryCount'>> = {},
): Omit<QueuedMessage, 'id' | 'queuedAt' | 'retryCount' | 'onSuccess' | 'onFailure'> {
  return {
    conversationId: 'conv-1',
    content: `message-${Math.random().toString(36).slice(2)}`,
    model: 'fixture-queued-model',
    provenance: { scope: 'local' },
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  offlineQueue.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  offlineQueue.clear();
  jest.useRealTimers();
  jest.clearAllMocks();
});

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
    offlineQueue.enqueue({
      conversationId: 'conv-a',
      content: 'hello',
      model: 'fixture-shared-model',
      provenance: { scope: 'local' },
    });
    offlineQueue.enqueue({
      conversationId: 'conv-b',
      content: 'hello',
      model: 'fixture-shared-model',
      provenance: { scope: 'local' },
    });

    expect(offlineQueue.getQueueSize()).toBe(2);
  });
});

describe('processQueue, success path', () => {
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
    const msg = makeMsg({ content: 'check-payload', model: 'fixture-payload-model' });
    const entry = offlineQueue.enqueue(msg);

    const sendFn = jest.fn().mockResolvedValue(undefined);
    const processPromise = offlineQueue.processQueue(sendFn);
    jest.runAllTimers();
    await processPromise;

    const calledWith = sendFn.mock.calls[0]?.[0] as QueuedMessage;
    expect(calledWith.id).toBe(entry.id);
    expect(calledWith.content).toBe('check-payload');
    expect(calledWith.model).toBe('fixture-payload-model');
  });

  it('is a no-op when the queue is empty', async () => {
    const sendFn = jest.fn();

    await offlineQueue.processQueue(sendFn);

    expect(sendFn).not.toHaveBeenCalled();
  });
});

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

    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(offlineQueue.getQueueSize()).toBe(0);
  });
});

describe('exponential backoff', () => {
  it('pauses after first failure and stops processing remaining items', async () => {
    offlineQueue.enqueue(makeMsg({ content: 'first', conversationId: 'c1' }));
    offlineQueue.enqueue(makeMsg({ content: 'second', conversationId: 'c2' }));

    const sendFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(undefined);

    const processPromise = offlineQueue.processQueue(sendFn);

    await flushMicrotasks();

    jest.advanceTimersByTime(1_100);
    await processPromise;

    expect(sendFn).toHaveBeenCalledTimes(1);

    expect(offlineQueue.getQueueSize()).toBe(2);
  });

  it('applies 1s backoff for retryCount=1', async () => {
    const msg = makeMsg();
    offlineQueue.enqueue(msg);

    const sendFn = jest.fn().mockRejectedValue(new Error('fail'));
    const processPromise = offlineQueue.processQueue(sendFn);

    await flushMicrotasks();

    jest.advanceTimersByTime(999);
    expect(offlineQueue.isProcessing).toBe(true);

    jest.advanceTimersByTime(1);
    await processPromise;

    expect(offlineQueue.isProcessing).toBe(false);
  });
});

describe('max retry count', () => {
  it('drops an item and calls onFailure after 3 failed attempts', async () => {
    const onFailure = jest.fn();
    const msg = makeMsg();

    offlineQueue.enqueue(msg, { onFailure });

    const sendFn = jest.fn().mockRejectedValue(new Error('Permanent failure'));

    for (let i = 0; i < 3; i++) {
      const p = offlineQueue.processQueue(sendFn);
      await flushMicrotasks();
      jest.advanceTimersByTime(10_000);
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

  it('tells failure listeners about a drop even when the entry has no callback', async () => {
    const listener = jest.fn();
    const unsubscribe = offlineQueue.onEntryFailed(listener);
    const entry = offlineQueue.enqueue(makeMsg({ conversationId: 'conv-restored' }));
    const error = new Error('Refused');
    const sendFn = jest.fn().mockRejectedValue(error);

    for (let i = 0; i < 3; i++) {
      const p = offlineQueue.processQueue(sendFn);
      await flushMicrotasks();
      jest.advanceTimersByTime(10_000);
      await p;
    }
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ id: entry.id, conversationId: 'conv-restored' }),
      error,
    );
  });

  it('continues processing subsequent items after dropping an exhausted item', async () => {
    const onFailure = jest.fn();

    offlineQueue.enqueue(makeMsg({ content: 'exhausted', conversationId: 'c1' }), { onFailure });
    offlineQueue.enqueue(makeMsg({ content: 'success', conversationId: 'c2' }));

    const permanentError = new Error('Always fails');
    for (let i = 0; i < 3; i++) {
      const sendFn = jest.fn().mockRejectedValueOnce(permanentError).mockResolvedValue(undefined);

      const p = offlineQueue.processQueue(sendFn);
      await flushMicrotasks();
      jest.advanceTimersByTime(10_000);
      await p;
    }

    expect(onFailure).toHaveBeenCalledTimes(1);
    const remaining = offlineQueue.getQueue();
    if (remaining.length > 0) {
      expect(remaining[0]?.content).toBe('success');
    }
  });
});

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
    offlineQueue.enqueue(makeMsg({ content: 'b', conversationId: 'conv-b' }), {
      onFailure: onFailure2,
    });

    offlineQueue.clear();

    expect(onFailure1).toHaveBeenCalledWith(expect.any(Error));
    expect(onFailure2).toHaveBeenCalledWith(expect.any(Error));
  });

  it('does not throw when there are no items to clear', () => {
    expect(() => offlineQueue.clear()).not.toThrow();
  });

  it('resets isProcessing flag', async () => {
    offlineQueue.enqueue(makeMsg());

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
    const p2 = offlineQueue.processQueue(sendFn);

    resolveFirst();
    jest.runAllTimers();
    await Promise.all([p1, p2]);

    expect(sendFn.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

describe('processor ownership and readiness', () => {
  it.each(['success', 'failure'] as const)(
    'keeps a cleared processor locked until its late %s settles without changing replacement work',
    async (outcome) => {
      const onSuccess = jest.fn();
      const onFailure = jest.fn();
      const original = offlineQueue.enqueue(makeMsg(), { onSuccess, onFailure });
      let finish!: () => void;
      let fail!: (error: Error) => void;
      const send = jest.fn().mockReturnValue(
        new Promise<void>((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
      );
      const processing = offlineQueue.processQueue(send);

      offlineQueue.clear();
      const replacement = offlineQueue.enqueue(makeMsg({ content: 'replacement' }));
      replacement.id = original.id;
      const replacementSend = jest.fn().mockResolvedValue(undefined);
      await offlineQueue.processQueue(replacementSend);

      expect(offlineQueue.isProcessing).toBe(true);
      expect(replacementSend).not.toHaveBeenCalled();
      if (outcome === 'success') finish();
      else fail(new Error('Old send failed'));
      await processing;

      expect(offlineQueue.getQueue()).toEqual([replacement]);
      expect(replacement.retryCount).toBe(0);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(offlineQueue.isProcessing).toBe(false);

      await offlineQueue.processQueue(replacementSend);
      expect(replacementSend).toHaveBeenCalledTimes(1);
      expect(offlineQueue.getQueue()).toEqual([]);
    },
  );

  it('does not release an old backoff owner when the queue is cleared', async () => {
    offlineQueue.enqueue(makeMsg());
    const send = jest.fn().mockRejectedValue(new Error('Network error'));
    const processing = offlineQueue.processQueue(send);
    await flushMicrotasks();
    offlineQueue.clear();
    const replacement = offlineQueue.enqueue(makeMsg({ content: 'new generation' }));
    const replacementSend = jest.fn().mockResolvedValue(undefined);
    await offlineQueue.processQueue(replacementSend);

    expect(offlineQueue.isProcessing).toBe(true);
    expect(replacementSend).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_000);
    await processing;

    expect(send).toHaveBeenCalledTimes(1);
    expect(offlineQueue.getQueue()).toEqual([replacement]);
    expect(replacement.retryCount).toBe(0);
    expect(offlineQueue.isProcessing).toBe(false);
  });

  it('leaves entries and retry counters unchanged while readiness is false', async () => {
    const entry = offlineQueue.enqueue(makeMsg());
    const send = jest.fn();
    await offlineQueue.processQueue(send, () => false);

    expect(send).not.toHaveBeenCalled();
    expect(offlineQueue.getQueue()).toEqual([entry]);
    expect(entry.retryCount).toBe(0);
    expect(offlineQueue.isProcessing).toBe(false);
  });

  it('settles a successful in-flight entry but pauses before the next offline dispatch', async () => {
    const first = offlineQueue.enqueue(makeMsg({ content: 'first' }));
    const second = offlineQueue.enqueue(makeMsg({ content: 'second' }));
    let online = true;
    const send = jest.fn().mockImplementation(async () => {
      online = false;
    });

    await offlineQueue.processQueue(send, () => online);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(first);
    expect(offlineQueue.getQueue()).toEqual([second]);
    expect(second.retryCount).toBe(0);
  });

  it('releases the processor when readiness throws without counting a send failure', async () => {
    const entry = offlineQueue.enqueue(makeMsg());
    const send = jest.fn();
    const error = new Error('Readiness unavailable');

    await expect(
      offlineQueue.processQueue(send, () => {
        throw error;
      }),
    ).rejects.toBe(error);

    expect(send).not.toHaveBeenCalled();
    expect(entry.retryCount).toBe(0);
    expect(offlineQueue.isProcessing).toBe(false);
    await offlineQueue.processQueue(jest.fn().mockResolvedValue(undefined));
    expect(offlineQueue.getQueue()).toEqual([]);
  });

  it('keeps one failed attempt when connectivity changes during backoff', async () => {
    const entry = offlineQueue.enqueue(makeMsg());
    let online = true;
    const send = jest.fn().mockRejectedValue(new Error('Network error'));
    const processing = offlineQueue.processQueue(send, () => online);
    await flushMicrotasks();
    online = false;
    jest.advanceTimersByTime(1_000);
    await processing;

    expect(send).toHaveBeenCalledTimes(1);
    expect(entry.retryCount).toBe(1);
    expect(offlineQueue.getQueue()).toEqual([entry]);
    expect(offlineQueue.isProcessing).toBe(false);
  });
});

describe('subscribe (live badge)', () => {
  it('notifies subscribers on enqueue so the queued-count badge stays live', () => {
    let ticks = 0;
    const unsub = offlineQueue.subscribe(() => {
      ticks += 1;
    });
    offlineQueue.enqueue(makeMsg({ content: 'a' }));
    offlineQueue.enqueue(makeMsg({ content: 'b', conversationId: 'conv-2' }));
    expect(ticks).toBeGreaterThanOrEqual(2);
    unsub();
    const before = ticks;
    offlineQueue.enqueue(makeMsg({ content: 'c', conversationId: 'conv-3' }));
    expect(ticks).toBe(before);
  });
});
