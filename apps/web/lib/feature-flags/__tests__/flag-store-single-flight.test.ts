import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: vi.fn(),
}));

import { getNeonDb } from '@/lib/server/neon-db';
import {
  getActiveFlagDefinitions,
  getSubjectOverrides,
  resetFlagDefinitionCache,
} from '../flag-store';

beforeEach(() => {
  resetFlagDefinitionCache();
});

describe('reading flag definitions when the cache has expired', () => {
  it('runs one query for every request that arrives while it is in flight', async () => {
    let release: (rows: unknown[]) => void = () => {};
    const query = vi.fn(
      () =>
        new Promise<unknown[]>((resolve) => {
          release = resolve;
        }),
    );
    vi.mocked(getNeonDb).mockReturnValue({ query } as never);

    const readers = Array.from({ length: 25 }, () => getActiveFlagDefinitions(1_000));
    release([]);
    await Promise.all(readers);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reads again after a failed read instead of keeping the failure', async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error('the table is unreadable'))
      .mockResolvedValueOnce([]);
    vi.mocked(getNeonDb).mockReturnValue({ query } as never);

    await expect(getActiveFlagDefinitions(1_000)).resolves.toEqual([]);
    await expect(getActiveFlagDefinitions(1_000)).resolves.toEqual([]);

    expect(query).toHaveBeenCalledTimes(2);
  });

  it('fails a strict read while preserving the ordinary reader fallback', async () => {
    const query = vi.fn().mockRejectedValue(new Error('the table is unreadable'));
    vi.mocked(getNeonDb).mockReturnValue({ query } as never);

    await expect(getActiveFlagDefinitions(1_000, { failClosed: true })).rejects.toThrow(
      'the table is unreadable',
    );
    await expect(getActiveFlagDefinitions(1_000)).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not let an ordinary cached read hide a malformed disabled switch from strict reads', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        key: 'capability.fast_mode',
        kill_switch: true,
        rules: 'unreadable rules',
      },
    ]);
    vi.mocked(getNeonDb).mockReturnValue({ query } as never);

    await expect(getActiveFlagDefinitions(1_000)).resolves.toEqual([]);
    await expect(getActiveFlagDefinitions(1_000, { failClosed: true })).rejects.toThrow();
  });

  it('shares one strict query and reads again after strict failure', async () => {
    let reject: (reason: Error) => void = () => {};
    const query = vi.fn(() => new Promise<unknown[]>((_, decline) => (reject = decline)));
    vi.mocked(getNeonDb).mockReturnValue({ query } as never);
    const readers = Array.from({ length: 25 }, () =>
      getActiveFlagDefinitions(1_000, { failClosed: true }),
    );
    const failures = Promise.allSettled(readers);
    reject(new Error('the table is unreadable'));
    expect((await failures).every((result) => result.status === 'rejected')).toBe(true);
    expect(query).toHaveBeenCalledOnce();

    query.mockResolvedValueOnce([]);
    await expect(getActiveFlagDefinitions(1_000, { failClosed: true })).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('fails closed on an unreadable subject override store only for strict consumers', async () => {
    const query = vi.fn().mockRejectedValue(new Error('the overrides are unreadable'));
    vi.mocked(getNeonDb).mockReturnValue({ query } as never);

    await expect(
      getSubjectOverrides('user', null, ['capability.fast_mode'], { failClosed: true }),
    ).rejects.toThrow('the overrides are unreadable');
    await expect(getSubjectOverrides('user', null, ['capability.fast_mode'])).resolves.toEqual([]);
  });
});
