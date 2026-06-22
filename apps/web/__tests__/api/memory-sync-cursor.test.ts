/**
 * Unit tests for the memory delta-sync SAFE pull cursor.
 *
 * Memory is a SINGLE table (unlike chat's conversations+messages), so the cursor is
 * the highest delivered server_version — but it must (a) compare as bigint not
 * lexicographically, (b) never regress below `since`, and (c) make no progress on an
 * empty page. See computeMemoryPullCursor.
 */
import { describe, it, expect, vi } from 'vitest';

// The route module pulls in server-only deps at import; stub the heavy ones so we
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

  it('never regresses below `since` (defensive — should not happen since rows are > since)', () => {
    // If a frontier somehow trails `since`, keep `since`.
    expect(computeMemoryPullCursor('100', [sv(9)])).toBe('100');
  });

  it('compares frontier vs `since` as bigint, not lexicographically (digit-length boundary)', () => {
    // since=9, page delivered up to frontier=100. Lexicographically '100' < '9', so a
    // naive string compare would keep '9' and re-deliver the same page forever. bigint
    // must advance the cursor to 100. (Rows arrive ordered asc, so 100 is the last.)
    expect(computeMemoryPullCursor('9', [sv(100)])).toBe('100');
  });

  it('handles large bigint versions without precision loss', () => {
    const big = '9007199254740993'; // > Number.MAX_SAFE_INTEGER
    expect(computeMemoryPullCursor('0', [{ server_version: big }])).toBe(big);
  });
});
