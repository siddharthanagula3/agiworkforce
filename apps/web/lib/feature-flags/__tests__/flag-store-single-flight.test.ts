import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));

import { getNeonDb } from '@/lib/server/neon-db';
import { getActiveFlagDefinitions, resetFlagDefinitionCache } from '../flag-store';

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
});
