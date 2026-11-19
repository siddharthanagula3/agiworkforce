import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBatchQueue } from '../src/batch-queue.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('a bounded batch queue', () => {
  it('answers everything enqueued within the window in one batch', async () => {
    const run = vi.fn((_batch: readonly number[]) => Promise.resolve());
    const queue = createBatchQueue<number>({
      batchSize: 100,
      concurrency: 2,
      delayMs: 25,
      jitterMs: 75,
      run,
      onError: vi.fn(),
      random: () => 0.5,
    });

    const settled = Promise.all([1, 2, 3].map((item) => queue.enqueue(item)));
    await vi.advanceTimersByTimeAsync(61);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await settled;

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('never runs more batches at once than its concurrency, and settles every item', async () => {
    const gates: Array<ReturnType<typeof deferred>> = [];
    let running = 0;
    let peak = 0;
    const run = vi.fn(async (_batch: readonly number[]) => {
      running += 1;
      peak = Math.max(peak, running);
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
      running -= 1;
    });
    const queue = createBatchQueue<number>({
      batchSize: 2,
      concurrency: 2,
      delayMs: 10,
      jitterMs: 0,
      run,
      onError: vi.fn(),
    });

    let settledCount = 0;
    const items = Array.from({ length: 7 }, (_, index) => index);
    const settled = items.map((item) => queue.enqueue(item).then(() => (settledCount += 1)));

    for (let round = 0; round < 6 && settledCount < items.length; round++) {
      await vi.advanceTimersByTimeAsync(10);
      for (const gate of gates.splice(0)) gate.release();
      await vi.advanceTimersByTimeAsync(0);
    }
    await Promise.all(settled);

    expect(peak).toBeLessThanOrEqual(2);
    expect(run.mock.calls.map(([batch]) => batch)).toEqual([[0, 1], [2, 3], [4, 5], [6]]);
  });

  it('settles a batch whose run failed and reports the failure', async () => {
    const failure = new Error('unexpected');
    const onError = vi.fn();
    const queue = createBatchQueue<number>({
      batchSize: 10,
      concurrency: 1,
      delayMs: 0,
      jitterMs: 0,
      run: () => Promise.reject(failure),
      onError,
    });

    const settled = queue.enqueue(1);
    await vi.advanceTimersByTimeAsync(0);
    await settled;
    expect(onError).toHaveBeenCalledWith(failure);
  });

  describe('an urgent lane', () => {
    function queueOf(run: (batch: readonly number[]) => Promise<void>, batchSize: number) {
      return createBatchQueue<number>({
        batchSize,
        concurrency: 1,
        delayMs: 10,
        jitterMs: 0,
        run,
        onError: vi.fn(),
      });
    }

    it('puts an urgent item in the first batch behind a long standing backlog', async () => {
      const run = vi.fn((_batch: readonly number[]) => Promise.resolve());
      const queue = queueOf(run, 100);

      for (let item = 0; item < 500; item++) void queue.enqueue(item);
      const urgent = queue.enqueue(-1, { urgent: true });
      await vi.advanceTimersByTimeAsync(10);
      await urgent;

      expect(run.mock.calls[0]![0][0]).toBe(-1);
      expect(run.mock.calls[0]![0]).toHaveLength(100);
    });

    it('lets the standing backlog move on when urgent items keep arriving', async () => {
      const run = vi.fn((_batch: readonly number[]) => Promise.resolve());
      const queue = queueOf(run, 8);

      for (let item = 0; item < 20; item++) void queue.enqueue(item);
      for (let item = 100; item < 120; item++) void queue.enqueue(item, { urgent: true });
      await vi.advanceTimersByTimeAsync(10);

      const first = run.mock.calls[0]![0];
      expect(first.filter((item) => item >= 100)).toHaveLength(6);
      expect(first.filter((item) => item < 100)).toEqual([0, 1]);
    });

    it('moves a queued item to the front and settles it once, with its own batch', async () => {
      const run = vi.fn((_batch: readonly number[]) => Promise.resolve());
      const queue = queueOf(run, 3);

      const settled = new Map<number, boolean>();
      for (let item = 0; item < 9; item++) {
        void queue.enqueue(item).then(() => settled.set(item, true));
      }
      queue.prioritize(7);
      queue.prioritize(7);
      await vi.advanceTimersByTimeAsync(10);

      expect(run.mock.calls[0]![0]).toEqual([7, 0, 1]);
      expect([...settled.keys()].sort((a, b) => a - b)).toEqual([0, 1, 7]);

      await vi.advanceTimersByTimeAsync(20);
      expect(run.mock.calls.flatMap(([batch]) => batch).sort((a, b) => a - b)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8,
      ]);
    });

    it('leaves an item that is already running where it is', async () => {
      const gate = deferred();
      const run = vi.fn((_batch: readonly number[]) => gate.promise);
      const queue = queueOf(run, 2);

      const running = queue.enqueue(1);
      void queue.enqueue(2);
      void queue.enqueue(3);
      await vi.advanceTimersByTimeAsync(10);
      expect(run).toHaveBeenCalledTimes(1);

      queue.prioritize(1);
      gate.release();
      await running;
      await vi.advanceTimersByTimeAsync(10);

      expect(run.mock.calls.map(([batch]) => batch)).toEqual([[1, 2], [3]]);
    });
  });
});
