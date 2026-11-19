import { describe, expect, it } from 'vitest';

import {
  JOB_RETENTION_MS,
  MIN_RETRY_AFTER_SECONDS,
  SOURCE_BUDGET_WINDOW_MS,
  createScanQueue,
  createSourceBudget,
} from '../src/scan-queue.ts';

const BUDGET = 2 * 1024 * 1024 * 1024;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = SOURCE_BUDGET_WINDOW_MS;

function fakeClock(start = 0) {
  let at = start;
  return {
    now: () => at,
    advance: (ms: number) => {
      at += ms;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('hourly source budget', () => {
  it('a job submitted at uptime 0 gets 429 with Retry-After; half the budget is available at 30 minutes', () => {
    const clock = fakeClock();
    const budget = createSourceBudget({ bytesPerHour: BUDGET, startedAt: 0, now: clock.now });

    expect(budget.admit(BUDGET / 4)).toEqual({ admitted: false, retryAfterSeconds: 15 * 60 });
    expect(budget.admit(1)).toEqual({
      admitted: false,
      retryAfterSeconds: MIN_RETRY_AFTER_SECONDS,
    });

    clock.advance(30 * MINUTE_MS);
    expect(budget.admit(BUDGET / 2 + 1)).toMatchObject({ admitted: false });
    expect(budget.admit(BUDGET / 2)).toEqual({ admitted: true });
    expect(budget.admit(1)).toMatchObject({ admitted: false });
  });

  it('refuses a new job past SCAN_SOURCE_BYTES_PER_HOUR with Retry-After until the window frees enough', () => {
    const clock = fakeClock(2 * HOUR_MS);
    const budget = createSourceBudget({ bytesPerHour: BUDGET, startedAt: 0, now: clock.now });

    expect(budget.admit(BUDGET / 2)).toEqual({ admitted: true });
    clock.advance(10 * MINUTE_MS);
    expect(budget.admit(BUDGET / 2)).toEqual({ admitted: true });
    clock.advance(10 * MINUTE_MS);

    expect(budget.admit(BUDGET / 4)).toEqual({ admitted: false, retryAfterSeconds: 40 * 60 });

    clock.advance(40 * MINUTE_MS - 30_000);
    expect(budget.admit(BUDGET / 4)).toEqual({
      admitted: false,
      retryAfterSeconds: MIN_RETRY_AFTER_SECONDS,
    });
  });

  it('rolls the window, so bytes admitted an hour ago no longer count', () => {
    const clock = fakeClock(2 * HOUR_MS);
    const budget = createSourceBudget({ bytesPerHour: BUDGET, startedAt: 0, now: clock.now });

    expect(budget.admit(BUDGET)).toEqual({ admitted: true });
    clock.advance(HOUR_MS - 1);
    expect(budget.admit(1)).toMatchObject({ admitted: false });
    clock.advance(1);
    expect(budget.admit(BUDGET)).toEqual({ admitted: true });
  });

  it('waits for the later of the window and the ramp when both bind', () => {
    const clock = fakeClock(40 * MINUTE_MS);
    const budget = createSourceBudget({ bytesPerHour: BUDGET, startedAt: 0, now: clock.now });

    expect(budget.admit(BUDGET / 2)).toEqual({ admitted: true });
    expect(budget.admit(BUDGET / 2)).toEqual({ admitted: false, retryAfterSeconds: 20 * 60 });
  });
});

describe('scan queue', () => {
  function queueWith(options: { concurrency?: number; queueMax?: number; budget?: number } = {}) {
    const clock = fakeClock(2 * HOUR_MS);
    const started: string[] = [];
    const finish = new Map<string, (value: string) => void>();
    const queue = createScanQueue<string, string>(
      {
        concurrency: options.concurrency ?? 1,
        queueMax: options.queueMax ?? 2,
        budget: createSourceBudget({
          bytesPerHour: options.budget ?? BUDGET,
          startedAt: 0,
          now: clock.now,
        }),
        now: clock.now,
      },
      (payload) => {
        started.push(payload);
        const done = deferred<string>();
        finish.set(payload, done.resolve);
        return done.promise;
      },
      () => 'failed',
    );
    return { queue, clock, started, finish };
  }

  it('runs one job at a time in submission order and keeps the rest queued', async () => {
    const { queue, started, finish } = queueWith();

    expect(queue.submit('a:1', 10, 1000, 'a')).toMatchObject({ kind: 'accepted' });
    expect(queue.submit('b:1', 10, 1000, 'b')).toMatchObject({ kind: 'accepted' });
    expect(queue.submit('c:1', 10, 1000, 'c')).toMatchObject({ kind: 'accepted' });

    expect(started).toEqual(['a']);
    expect(queue.get('a:1')?.status).toBe('scanning');
    expect(queue.get('b:1')?.status).toBe('queued');
    expect(queue.depth()).toBe(2);
    expect(queue.running()).toBe(1);

    finish.get('a')?.('clean');
    await settle();
    expect(queue.get('a:1')).toMatchObject({ status: 'done', verdict: 'clean', deadlineMs: 1000 });
    expect(started).toEqual(['a', 'b']);
    expect(queue.depth()).toBe(1);
  });

  it('answers queue_full once SCAN_QUEUE_MAX jobs wait, without charging the budget', () => {
    const { queue } = queueWith({ queueMax: 1, budget: 30 });

    queue.submit('a:1', 10, 1000, 'a');
    queue.submit('b:1', 10, 1000, 'b');

    expect(queue.submit('c:1', 10, 1000, 'c')).toEqual({
      kind: 'refused',
      reason: 'queue_full',
      retryAfterSeconds: MIN_RETRY_AFTER_SECONDS,
    });
    expect(queue.get('c:1')).toBeUndefined();
  });

  it('answers source_budget when the hour has no room', () => {
    const { queue } = queueWith({ queueMax: 5, budget: 15 });

    queue.submit('a:1', 10, 1000, 'a');

    expect(queue.submit('b:1', 10, 1000, 'b')).toMatchObject({
      kind: 'refused',
      reason: 'source_budget',
    });
  });

  it('returns the same job for a repeated jobId and does not charge it again', () => {
    const { queue, started } = queueWith({ budget: 15 });

    const first = queue.submit('a:1', 10, 1000, 'a');
    const repeat = queue.submit('a:1', 10, 1000, 'a-again');

    expect(first).toMatchObject({ kind: 'accepted', repeated: false });
    expect(repeat).toMatchObject({ kind: 'accepted', repeated: true, job: { id: 'a:1' } });
    expect(started).toEqual(['a']);
    expect(queue.submit('b:1', 5, 1000, 'b')).toMatchObject({ kind: 'accepted' });
  });

  it('records a job whose run throws with the failure verdict', async () => {
    const clock = fakeClock(2 * HOUR_MS);
    const queue = createScanQueue<string, string>(
      {
        concurrency: 1,
        queueMax: 1,
        budget: createSourceBudget({ bytesPerHour: BUDGET, startedAt: 0, now: clock.now }),
        now: clock.now,
      },
      () => Promise.reject(new Error('boom')),
      () => 'failed',
    );

    queue.submit('a:1', 1, 1000, 'a');
    await settle();

    expect(queue.get('a:1')).toMatchObject({ status: 'done', verdict: 'failed' });
    expect(queue.running()).toBe(0);
  });

  it('forgets a finished job an hour after it finished', async () => {
    const { queue, clock, finish } = queueWith();

    queue.submit('a:1', 10, 1000, 'a');
    finish.get('a')?.('clean');
    await settle();

    clock.advance(JOB_RETENTION_MS - 1);
    expect(queue.get('a:1')?.status).toBe('done');
    clock.advance(1);
    expect(queue.get('a:1')).toBeUndefined();
  });
});
