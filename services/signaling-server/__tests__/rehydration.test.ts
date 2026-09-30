import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SignalingSession } from '../src/db.js';
import { withinDeadline } from '../src/deadline.js';
import { lookupSession } from '../src/rehydration.js';

const ROW: SignalingSession = {
  code: 'ABCD1234EFGH',
  created_at: 1_756_000_000_000,
  expires_at: 1_756_000_300_000,
  metadata: { userId: 'account-a' },
};

const unhandled = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  process.on('unhandledRejection', unhandled);
});

afterEach(() => {
  process.off('unhandledRejection', unhandled);
  unhandled.mockClear();
  vi.useRealTimers();
});

async function flush(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) {
    await new Promise<void>((resolve) => process.nextTick(resolve));
  }
}

describe('a store lookup with a deadline', () => {
  it('reports a lookup that never answers as unavailable, without a rejection or a stray timer', async () => {
    const lookup = lookupSession(() => new Promise(() => undefined), 10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(lookup).resolves.toEqual({ kind: 'unavailable', reason: 'timeout' });
    await flush();
    expect(unhandled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a failed query apart from a pairing that does not exist', async () => {
    await expect(
      lookupSession(async () => ({ data: null, error: { message: 'boom' } }), 10_000),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'db_error' });
    await expect(lookupSession(async () => ({ data: null, error: null }), 10_000)).resolves.toEqual(
      {
        kind: 'missing',
      },
    );
  });

  it('returns the row when the store answers in time and clears its timer', async () => {
    await expect(lookupSession(async () => ({ data: ROW, error: null }), 10_000)).resolves.toEqual({
      kind: 'found',
      row: ROW,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('turns a rejecting load into unavailable rather than letting it escape', async () => {
    await expect(
      lookupSession(() => Promise.reject(new Error('socket hang up')), 10_000),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'db_error' });
    await flush();
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('shares one answer between callers waiting on the same lookup', async () => {
    let answer: ((value: { data: SignalingSession | null; error: null }) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<{ data: SignalingSession | null; error: null }>((resolve) => {
          answer = resolve;
        }),
    );
    const shared = lookupSession(load, 10_000);
    const [first, second] = [shared.then((result) => result), shared.then((result) => result)];
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(first).resolves.toEqual({ kind: 'unavailable', reason: 'timeout' });
    await expect(second).resolves.toEqual({ kind: 'unavailable', reason: 'timeout' });
    answer?.({ data: ROW, error: null });
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('the deadline helper', () => {
  it('settles with the value, a failure or a timeout and never rejects', async () => {
    await expect(withinDeadline(Promise.resolve(7), 100)).resolves.toEqual({
      kind: 'settled',
      value: 7,
    });
    await expect(withinDeadline(Promise.reject(new Error('no')), 100)).resolves.toEqual({
      kind: 'failed',
    });
    const pending = withinDeadline(new Promise(() => undefined), 100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toEqual({ kind: 'timeout' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
