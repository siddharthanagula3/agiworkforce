import { describe, expect, it, vi } from 'vitest';
import {
  buildManagedReflectRecap,
  isReflectMemoryEnabled,
  loadManagedReflectRecap,
} from './reflect-service';

describe('managed Reflect recap aggregation', () => {
  it('derives real activity, topic proportions, and observations without returning chat text', () => {
    const recap = buildManagedReflectRecap({
      range: '30d',
      timezone: 'UTC',
      now: new Date('2026-07-18T18:00:00.000Z'),
      totalConversations: 3,
      conversations: [
        {
          id: 'conversation-1',
          title: 'Draft launch email',
          messageSample: 'Please write and edit a launch email with a warmer tone.',
          userMessageCount: 2,
          createdAt: '2026-07-10T15:00:00.000Z',
          updatedAt: '2026-07-12T15:00:00.000Z',
        },
        {
          id: 'conversation-2',
          title: 'Rewrite a short bio',
          messageSample: 'Rewrite this bio.',
          userMessageCount: 1,
          createdAt: '2026-07-10T16:00:00.000Z',
          updatedAt: '2026-07-10T16:15:00.000Z',
        },
        {
          id: 'conversation-3',
          title: 'Implement API client',
          messageSample: 'Implement a TypeScript API client function.',
          userMessageCount: 3,
          createdAt: '2026-07-12T15:00:00.000Z',
          updatedAt: '2026-07-12T16:00:00.000Z',
        },
      ],
    });

    expect(recap.stats).toEqual({
      totalConversations: 3,
      activeDays: 2,
      mostActiveDay: '2026-07-10',
      peakHour: 15,
    });
    expect(recap.topics[0]).toMatchObject({
      id: 'writing',
      conversationCount: 2,
      percentage: 66.7,
    });
    expect(recap.dailyActivity).toEqual([
      { date: '2026-07-10', conversationCount: 2 },
      { date: '2026-07-12', conversationCount: 1 },
    ]);
    expect(recap.insights.map((insight) => insight.dimension)).toEqual([
      'delegation',
      'description',
      'discernment',
      'diligence',
    ]);
    expect(JSON.stringify(recap)).not.toContain('launch email with a warmer tone');
  });

  it('returns an honest empty recap instead of generic praise', () => {
    const recap = buildManagedReflectRecap({
      range: '30d',
      timezone: 'UTC',
      now: new Date('2026-07-18T18:00:00.000Z'),
      totalConversations: 0,
      conversations: [],
    });

    expect(recap.summary.headline).toBe('No conversation activity yet');
    expect(recap.topics).toEqual([]);
    expect(recap.insights).toEqual([]);
  });

  it('requires both memory and generation from history before reading conversations', async () => {
    expect(
      isReflectMemoryEnabled({ capabilities: { memory: true, generateFromHistory: true } }),
    ).toBe(true);
    expect(isReflectMemoryEnabled({ capabilities: { memory: false } })).toBe(false);
    expect(isReflectMemoryEnabled({ capabilities: { generateFromHistory: false } })).toBe(false);
    expect(isReflectMemoryEnabled({ capabilities: { memory: 'yes' } })).toBe(false);
    expect(isReflectMemoryEnabled({})).toBe(false);

    const query = vi
      .fn()
      .mockResolvedValueOnce([
        { settings: { capabilities: { memory: false, generateFromHistory: true } } },
      ]);
    await expect(
      loadManagedReflectRecap({
        userId: 'owner-1',
        organizationId: null,
        range: '30d',
        timezone: 'UTC',
        db: { query } as never,
        now: new Date('2026-07-18T18:00:00.000Z'),
      }),
    ).resolves.toEqual({ kind: 'memory-disabled' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('binds the owner and excludes temporary and AGI Work conversations in the data query', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        { settings: { capabilities: { memory: true, generateFromHistory: true } } },
      ])
      .mockResolvedValueOnce([]);

    await loadManagedReflectRecap({
      userId: 'owner-1',
      organizationId: '11111111-1111-4111-8111-111111111111',
      range: '30d',
      timezone: 'UTC',
      db: { query } as never,
      now: new Date('2026-07-18T18:00:00.000Z'),
    });

    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('wc.user_id = $1');
    expect(sql).toContain('wc.organization_id is not distinct from $5::uuid');
    expect(sql).toContain('wc.is_temporary = false');
    expect(sql).toContain("excluded.metadata ? 'cloudAgentRun'");
    expect(params[0]).toBe('owner-1');
    expect(params[4]).toBe('11111111-1111-4111-8111-111111111111');
  });
});
