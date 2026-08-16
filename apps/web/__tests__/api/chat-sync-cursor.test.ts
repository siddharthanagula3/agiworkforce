import { describe, it, expect, vi } from 'vitest';

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
    const convs = Array.from({ length: 500 }, (_, i) => sv(i + 1));
    const msgs = Array.from({ length: 1000 }, (_, i) => sv(i + 601));
    const cursor = computePullCursor('0', convs, msgs, true, true);
    expect(cursor).toBe('500');
  });

  it('bounds to the saturated table even when the other table has higher unsaturated versions', () => {
    const cursor = computePullCursor('0', [sv(500)], [sv(1600)], true, false);
    expect(cursor).toBe('500');
  });

  it('uses the message frontier when only messages saturate', () => {
    const cursor = computePullCursor('0', [sv(500)], [sv(1600)], false, true);
    expect(cursor).toBe('1600');
  });

  it('compares as bigint, not lexicographically (digit-length boundary)', () => {
    const cursor = computePullCursor('0', [sv(9)], [sv(100)], false, false);
    expect(cursor).toBe('100');
  });

  it('always makes progress: the safe cursor exceeds `since`', () => {
    const cursor = computePullCursor('500', [sv(750)], [sv(900)], true, true);
    expect(cursor).toBe('750');
  });

  it('includes artifacts in the global max when nothing saturates', () => {
    const cursor = computePullCursor('0', [sv(8)], [sv(99)], false, false, [sv(150)], false);
    expect(cursor).toBe('150');
  });

  it('bounds to the artifact frontier when only artifacts saturate', () => {
    const arts = Array.from({ length: 500 }, (_, i) => sv(i + 1));
    const cursor = computePullCursor('0', [sv(700)], [sv(800)], false, false, arts, true);
    expect(cursor).toBe('500');
  });

  it('defaults (no artifacts args) keep the original 2-table behavior', () => {
    expect(computePullCursor('0', [sv(8)], [sv(99)], false, false)).toBe('99');
  });
});
