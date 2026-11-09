import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseProbe } from '../src/db.js';
import { createDatabaseCheck } from '../src/probes.js';

const unhandled = vi.fn();

beforeEach(() => {
  process.on('unhandledRejection', unhandled);
});

afterEach(() => {
  process.off('unhandledRejection', unhandled);
  unhandled.mockClear();
});

describe('the cached database check', () => {
  it('allows idle suspension while retaining short active and failure checks', async () => {
    let clock = 0;
    let active = false;
    let healthy = true;
    const probe = vi.fn(async (): Promise<DatabaseProbe> =>
      healthy ? { ok: true, latencyMs: 1 } : { ok: false, reason: '08006' },
    );
    const check = createDatabaseCheck({
      probe,
      ttlMs: 15_000,
      idleTtlMs: 30 * 60_000,
      isActive: () => active,
      now: () => clock,
    });
    await check.refresh();
    for (clock = 15_000; clock < 30 * 60_000; clock += 15_000) await check.current();
    expect(probe).toHaveBeenCalledTimes(1);
    active = true;
    healthy = false;
    await expect(check.current()).resolves.toMatchObject({ status: 'down' });
    active = false;
    healthy = true;
    clock += 15_000;
    await expect(check.current()).resolves.toMatchObject({ status: 'ok' });
    expect(probe).toHaveBeenCalledTimes(3);
    check.invalidate();
    healthy = false;
    await expect(check.current()).resolves.toMatchObject({ status: 'down' });
  });

  it('probes once per window, however often it is asked', async () => {
    let clock = 1_000;
    const probe = vi.fn(async (): Promise<DatabaseProbe> => ({ ok: true, latencyMs: 2 }));
    const check = createDatabaseCheck({ probe, ttlMs: 15_000, now: () => clock });

    await check.current();
    await check.current();
    clock += 14_999;
    await check.current();
    expect(probe).toHaveBeenCalledTimes(1);

    clock += 1;
    await check.current();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent callers onto one probe', async () => {
    let answer: ((result: DatabaseProbe) => void) | undefined;
    const probe = vi.fn(
      () =>
        new Promise<DatabaseProbe>((resolve) => {
          answer = resolve;
        }),
    );
    const check = createDatabaseCheck({ probe, ttlMs: 15_000 });

    const pending = [check.current(), check.current(), check.refresh()];
    answer?.({ ok: false, reason: '42P01' });
    const states = await Promise.all(pending);

    expect(probe).toHaveBeenCalledTimes(1);
    for (const state of states) expect(state).toMatchObject({ status: 'down', reason: '42P01' });
  });

  it('refresh always probes again, for the startup gate', async () => {
    const probe = vi.fn(async (): Promise<DatabaseProbe> => ({ ok: true, latencyMs: 1 }));
    const check = createDatabaseCheck({ probe, ttlMs: 60_000 });

    await check.refresh();
    await check.refresh();
    expect(probe).toHaveBeenCalledTimes(2);
    expect(check.last()).toMatchObject({ status: 'ok' });
  });

  describe('invalidation while a probe is pending', () => {
    function heldProbes() {
      const answers: Array<(result: DatabaseProbe) => void> = [];
      const probe = vi.fn(
        () =>
          new Promise<DatabaseProbe>((resolve) => {
            answers.push(resolve);
          }),
      );
      return { probe, answers };
    }

    it('never publishes a success that began before the invalidation', async () => {
      const { probe, answers } = heldProbes();
      const check = createDatabaseCheck({ probe, ttlMs: 15_000 });

      const before = check.current();
      check.invalidate();
      const after = check.current();
      expect(probe).toHaveBeenCalledTimes(2);

      answers[0]?.({ ok: true, latencyMs: 1 });
      answers[1]?.({ ok: false, reason: '08006' });

      await expect(after).resolves.toMatchObject({ status: 'down', reason: '08006' });
      await expect(before).resolves.toMatchObject({ status: 'down', reason: '08006' });
      expect(check.last()).toMatchObject({ status: 'down' });
      expect(probe).toHaveBeenCalledTimes(2);
    });

    it('accepts a recovery observed after the invalidation', async () => {
      const { probe, answers } = heldProbes();
      const check = createDatabaseCheck({ probe, ttlMs: 15_000 });

      const before = check.current();
      check.invalidate();
      const after = check.current();
      answers[1]?.({ ok: true, latencyMs: 3 });
      answers[0]?.({ ok: false, reason: '08006' });

      await expect(after).resolves.toMatchObject({ status: 'ok', latencyMs: 3 });
      await expect(before).resolves.toMatchObject({ status: 'down' });
      expect(check.last()).toMatchObject({ status: 'ok', latencyMs: 3 });
      await expect(check.current()).resolves.toMatchObject({ status: 'ok' });
      expect(probe).toHaveBeenCalledTimes(2);
    });

    it('keeps coalescing on the newer probe when a retired one settles', async () => {
      const { probe, answers } = heldProbes();
      const check = createDatabaseCheck({ probe, ttlMs: 15_000 });

      const before = check.current();
      check.invalidate();
      const after = check.current();
      answers[0]?.({ ok: true, latencyMs: 1 });
      await new Promise<void>((resolve) => setImmediate(resolve));

      const joined = check.current();
      expect(probe).toHaveBeenCalledTimes(2);
      answers[1]?.({ ok: true, latencyMs: 4 });

      for (const state of await Promise.all([before, after, joined])) {
        expect(state).toMatchObject({ status: 'ok', latencyMs: 4 });
      }
    });

    it('caches a failing probe that invalidated itself instead of probing again', async () => {
      const observeFailure = vi.fn();
      const probe = vi.fn(async (): Promise<DatabaseProbe> => {
        observeFailure();
        return { ok: false, reason: '08006' };
      });
      const check = createDatabaseCheck({ probe, ttlMs: 15_000 });
      observeFailure.mockImplementation(() => check.invalidate());

      await expect(check.current()).resolves.toMatchObject({ status: 'down' });
      await expect(check.current()).resolves.toMatchObject({ status: 'down' });
      expect(probe).toHaveBeenCalledTimes(1);
    });
  });

  it('reports a probe that throws as down and never rejects', async () => {
    const check = createDatabaseCheck({
      probe: () => Promise.reject(new Error('socket hang up')),
      ttlMs: 15_000,
    });

    await expect(check.current()).resolves.toMatchObject({
      status: 'down',
      reason: 'probe_failed',
    });
    await new Promise<void>((resolve) => process.nextTick(resolve));
    expect(unhandled).not.toHaveBeenCalled();
  });
});
