import { describe, it, expect, vi } from 'vitest';

// can import the pure exported helper without a DB/Clerk runtime.
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn() }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn() }));

import { computeMemoryPullCursor } from '@/app/api/memory/sync/route';

const sv = (n: number) => ({ server_version: String(n) });

describe('computeMemoryPullCursor', () => {
  it('advances to the highest delivered version (rows ordered asc)', () => {
    expect(computeMemoryPullCursor('0', [sv(1), sv(5), sv(42)])).toBe('42');
  });

  it('makes no progress on an empty page', () => {
    expect(computeMemoryPullCursor('17', [])).toBe('17');
  });

  it('never regresses below `since` (defensive, should not happen since rows are > since)', () => {
    expect(computeMemoryPullCursor('100', [sv(9)])).toBe('100');
  });

  it('compares frontier vs `since` as bigint, not lexicographically (digit-length boundary)', () => {
    expect(computeMemoryPullCursor('9', [sv(100)])).toBe('100');
  });

  it('handles large bigint versions without precision loss', () => {
    const big = '9007199254740993';
    expect(computeMemoryPullCursor('0', [{ server_version: big }])).toBe(big);
  });
});
