import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { watchClamd, type Daemon } from '../src/daemons.ts';

let daemon: Daemon | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  daemon?.stop();
  daemon = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('clamd watchdog', () => {
  it('reports sustained scan failure once when the recovery deadline expires', async () => {
    const scans = vi.fn().mockResolvedValue(false);
    const onUnresponsive = vi.fn();
    daemon = watchClamd(scans, onUnresponsive, 100, 300);

    await vi.advanceTimersByTimeAsync(299);
    expect(onUnresponsive).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onUnresponsive).toHaveBeenCalledOnce();

    const completedProbes = scans.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(onUnresponsive).toHaveBeenCalledOnce();
    expect(scans).toHaveBeenCalledTimes(completedProbes);
  });

  it('restarts the failure deadline after a successful scan', async () => {
    const scans = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    const onUnresponsive = vi.fn();
    daemon = watchClamd(scans, onUnresponsive, 100, 300);

    await vi.advanceTimersByTimeAsync(499);
    expect(onUnresponsive).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onUnresponsive).toHaveBeenCalledOnce();
  });

  it('keeps healthy scanning available and stops scheduling probes on shutdown', async () => {
    const scans = vi.fn().mockResolvedValue(true);
    const onUnresponsive = vi.fn();
    daemon = watchClamd(scans, onUnresponsive, 100, 300);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onUnresponsive).not.toHaveBeenCalled();
    expect(scans).toHaveBeenCalledTimes(10);

    daemon.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(scans).toHaveBeenCalledTimes(10);
    expect(onUnresponsive).not.toHaveBeenCalled();
  });

  it('can stop before the first probe starts', async () => {
    const scans = vi.fn().mockResolvedValue(false);
    const onUnresponsive = vi.fn();
    daemon = watchClamd(scans, onUnresponsive, 100, 300);

    daemon.stop();
    await vi.advanceTimersByTimeAsync(1000);

    expect(scans).not.toHaveBeenCalled();
    expect(onUnresponsive).not.toHaveBeenCalled();
  });

  it('does not report an outstanding failed probe after shutdown', async () => {
    let finishProbe!: (value: boolean) => void;
    const scans = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishProbe = resolve;
        }),
    );
    const onUnresponsive = vi.fn();
    daemon = watchClamd(scans, onUnresponsive, 100, 200);

    await vi.advanceTimersByTimeAsync(100);
    expect(scans).toHaveBeenCalledOnce();
    vi.setSystemTime(300);
    daemon.stop();
    finishProbe(false);
    await Promise.resolve();

    expect(onUnresponsive).not.toHaveBeenCalled();
  });

  it('reports a deadline failure once when multiple probes finish together', async () => {
    const pending: Array<(value: boolean) => void> = [];
    const scans = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          pending.push(resolve);
        }),
    );
    const onUnresponsive = vi.fn();
    daemon = watchClamd(scans, onUnresponsive, 100, 200);

    await vi.advanceTimersByTimeAsync(200);
    expect(pending).toHaveLength(2);
    for (const resolve of pending) resolve(false);
    await Promise.resolve();

    expect(onUnresponsive).toHaveBeenCalledOnce();
  });
});
