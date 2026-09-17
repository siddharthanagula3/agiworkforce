import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  DEFAULT_HANDOFF_PRIORITY,
  HANDOFF_PRIORITIES,
  priorityForSupportTier,
  priorityRank,
  resolveSupportPriority,
} from '../priority';

function db(rows: Array<{ support_tier: string | null }>) {
  return {
    query: vi.fn(async (_sql: string, _params?: readonly unknown[]) => rows as never),
  };
}

describe('priorityForSupportTier', () => {
  it('lifts a contracted tier above the default', () => {
    expect(priorityForSupportTier('platinum')).toBe('urgent');
    expect(priorityForSupportTier('enterprise')).toBe('high');
  });

  it('is case and whitespace insensitive, because the value comes from a metadata field', () => {
    expect(priorityForSupportTier('  Platinum ')).toBe('urgent');
  });

  /**
   * A value nobody recognises in a Stripe metadata field is a typo far more
   * often than it is a promise, so it must not resolve to the front of the
   * queue.
   */
  it('falls back to normal for a tier nobody recognises, never to the top', () => {
    expect(priorityForSupportTier('diamond-plus')).toBe(DEFAULT_HANDOFF_PRIORITY);
    expect(priorityForSupportTier('')).toBe(DEFAULT_HANDOFF_PRIORITY);
    expect(priorityForSupportTier(null)).toBe(DEFAULT_HANDOFF_PRIORITY);
  });
});

describe('priorityRank', () => {
  it('sorts urgent first and low last', () => {
    const sorted = [...HANDOFF_PRIORITIES].sort((a, b) => priorityRank(a) - priorityRank(b));
    expect(sorted).toEqual(['urgent', 'high', 'normal', 'low']);
  });
});

describe('resolveSupportPriority', () => {
  it('queues an anonymous visitor normally without touching the database', async () => {
    const adapter = db([]);
    const result = await resolveSupportPriority(adapter, null);

    expect(result).toEqual({ priority: DEFAULT_HANDOFF_PRIORITY, supportTier: null });
    expect(adapter.query).not.toHaveBeenCalled();
  });

  it('takes the strongest tier when someone belongs to more than one workspace', async () => {
    const result = await resolveSupportPriority(
      db([{ support_tier: 'standard' }, { support_tier: 'platinum' }]),
      'user_1',
    );

    expect(result).toEqual({ priority: 'urgent', supportTier: 'platinum' });
  });

  it('keeps the raw tier beside the priority, so a fallback is distinguishable', async () => {
    const result = await resolveSupportPriority(db([{ support_tier: 'diamond-plus' }]), 'user_1');

    expect(result.priority).toBe('normal');
    expect(result.supportTier).toBe('diamond-plus');
  });

  /**
   * Being answered in ordinary order is a far smaller harm than not being
   * answered at all, so a database failure must not stop the escalation.
   */
  it('fails open to normal when the contract table cannot be read', async () => {
    const adapter = {
      query: vi.fn(async (): Promise<never> => {
        throw new Error('connection refused');
      }),
    };

    const result = await resolveSupportPriority(adapter, 'user_1');

    expect(result).toEqual({ priority: DEFAULT_HANDOFF_PRIORITY, supportTier: null });
  });

  it('ignores a contract that has ended, by not selecting it at all', async () => {
    const adapter = db([]);
    await resolveSupportPriority(adapter, 'user_1');

    const sql = String(adapter.query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('c.ended_at is null');
    expect(sql).toContain('c.support_tier is not null');
  });
});
