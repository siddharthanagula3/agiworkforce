/**
 * Unit tests for the SAFE pull cursor (cross-device sync data-loss fix).
 *
 * The two tables (conversations, messages) paginate independently but share one
 * server_version sequence. Advancing the cursor to the global max skips the lagging
 * table's in-gap rows forever. computePullCursor must bound the cursor to the lowest
 * SATURATED frontier so those rows are re-requested on the next page.
 */
import { describe, it, expect, vi } from 'vitest';

// The route module pulls in server-only deps at import; stub the heavy ones so we
// can import the pure exported helper without a DB/Clerk runtime.
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn() }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn() }));

import { computePullCursor } from '@/app/api/chat/sync/route';

const sv = (n: number) => ({ server_version: String(n) });

describe('computePullCursor', () => {
  it('advances to the global max when nothing saturates', () => {
    const cursor = computePullCursor('0', [sv(8)], [sv(99)], false, false);
    expect(cursor).toBe('99');
  });

  it('bounds the cursor to the conversation frontier when conversations saturate', () => {
    // THE DATA-LOSS SCENARIO: convs sv 1..500 (saturated), msgs sv 601..1600 (saturated).
    // Advancing to 1600 would skip conversations 501..600 forever. The safe cursor is
    // the LOWEST saturated frontier (500), so the next pull re-requests from there.
    const convs = Array.from({ length: 500 }, (_, i) => sv(i + 1)); // ...500
    const msgs = Array.from({ length: 1000 }, (_, i) => sv(i + 601)); // 601..1600
    const cursor = computePullCursor('0', convs, msgs, true, true);
    expect(cursor).toBe('500');
  });

  it('bounds to the saturated table even when the other table has higher unsaturated versions', () => {
    // convs saturate at 500; msgs fully delivered up to 1600 (not saturated).
    const cursor = computePullCursor('0', [sv(500)], [sv(1600)], true, false);
    expect(cursor).toBe('500');
  });

  it('uses the message frontier when only messages saturate', () => {
    const cursor = computePullCursor('0', [sv(500)], [sv(1600)], false, true);
    expect(cursor).toBe('1600');
  });

  it('compares as bigint, not lexicographically (digit-length boundary)', () => {
    // 9 vs 100: lexicographic would pick "9" as larger; bigint must pick 100.
    const cursor = computePullCursor('0', [sv(9)], [sv(100)], false, false);
    expect(cursor).toBe('100');
  });

  it('always makes progress: the safe cursor exceeds `since`', () => {
    const cursor = computePullCursor('500', [sv(750)], [sv(900)], true, true);
    // min saturated frontier = 750 > since (500)
    expect(cursor).toBe('750');
  });
});
