import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONNECTION_POLL_MS,
  RETRY_BACKOFF_MS,
  createScreenRetry,
  type ScreenRetry,
} from '../screenRetry';

function harness(initiallyOnline = false) {
  let online = initiallyOnline;
  const resumeListeners = new Set<() => void>();
  const retry: ScreenRetry = createScreenRetry({
    isOnline: () => online,
    onResume: (listener) => {
      resumeListeners.add(listener);
      return () => resumeListeners.delete(listener);
    },
  });
  return {
    retry,
    setOnline: (value: boolean) => {
      online = value;
    },
    resume: () => resumeListeners.forEach((listener) => listener()),
    resumeListeners,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('leaving the unreachable screen without being asked', () => {
  it('tries again the moment the device regains a connection', async () => {
    const { retry, setOnline } = harness(false);
    const attempt = vi.fn(async () => undefined);
    retry.watch(1, attempt);

    await vi.advanceTimersByTimeAsync(CONNECTION_POLL_MS);
    expect(attempt).not.toHaveBeenCalled();

    setOnline(true);
    await vi.advanceTimersByTimeAsync(CONNECTION_POLL_MS);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('does not treat a device that was online all along as having reconnected', async () => {
    const { retry } = harness(true);
    const attempt = vi.fn(async () => undefined);
    retry.watch(1, attempt);

    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]! - 1);

    expect(attempt).not.toHaveBeenCalled();
  });

  it('tries again when the machine wakes from sleep', async () => {
    const { retry, resume } = harness(true);
    const attempt = vi.fn(async () => undefined);
    retry.watch(1, attempt);

    resume();
    await vi.advanceTimersByTimeAsync(0);

    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('keeps trying on a backoff that lengthens and then holds', async () => {
    const { retry } = harness(true);
    const times: number[] = [];
    const start = Date.now();
    retry.watch(1, async () => {
      times.push(Date.now() - start);
    });

    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS.reduce((total, step) => total + step, 0));
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS.at(-1)!);

    const gaps = times.map((time, index) => time - (times[index - 1] ?? 0));
    expect(gaps).toEqual([...RETRY_BACKOFF_MS, RETRY_BACKOFF_MS.at(-1)]);
  });

  it('never starts a second attempt while one is still running', async () => {
    const { retry, resume } = harness(true);
    let finish: () => void = () => undefined;
    const attempt = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    retry.watch(1, attempt);

    resume();
    resume();
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]!);
    expect(attempt).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[1]!);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('keeps going after an attempt throws', async () => {
    const { retry } = harness(true);
    const attempt = vi.fn(async () => {
      throw new Error('offline');
    });
    retry.watch(1, attempt);

    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]! + RETRY_BACKOFF_MS[1]!);

    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('stops everything once the window leaves the screen', async () => {
    const { retry, resume, resumeListeners, setOnline } = harness(false);
    const attempt = vi.fn(async () => undefined);
    retry.watch(1, attempt);

    retry.release(1);
    setOnline(true);
    resume();
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(attempt).not.toHaveBeenCalled();
    expect(retry.watching(1)).toBe(false);
    expect(resumeListeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('watches each window on its own', async () => {
    const { retry } = harness(true);
    const first = vi.fn(async () => undefined);
    const second = vi.fn(async () => undefined);
    retry.watch(1, first);
    retry.watch(2, second);

    retry.release(1);
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]!);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps the count of failed attempts when the screen is drawn again', async () => {
    const { retry } = harness(true);
    const attempt = vi.fn(async () => undefined);
    retry.watch(1, attempt);
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]!);

    retry.watch(1, attempt);
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[1]! - 1);
    expect(attempt).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
