import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  promotionsOn: vi.fn<(userId: string, plan: string | null) => Promise<boolean>>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/feature-flags/usage-promotions-gate', () => ({
  readUsagePromotionsOn: mocks.promotionsOn,
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/effective-subscription-service', () => ({
  resolveEntitlementBundle: vi.fn(),
}));

const {
  UsageLimitPromotionInputSchema,
  applyUsageLimitReset,
  promotablePlanTiers,
  readSummaryPromotions,
  resolvePromotionalCaps,
} = await import('../usage-limit-promotion-service');

const NOW = Date.parse('2026-10-22T12:00:00.000Z');
const CAPS = { session: 1_000_000, weekly: 10_000_000, flagshipWeekly: 3_000_000 };

interface PromotionFixture {
  id: string;
  kind: 'limit_reset' | 'limit_uplift';
  enabled?: boolean;
  plans?: string[];
  starts_at?: string;
  ends_at?: string;
  cost_ceiling_microusd?: number;
  committed_microusd?: number;
  uplift_percent?: number | null;
  uplift_windows?: string[];
  uplift_workloads?: string[];
}

function promotionRow(fixture: PromotionFixture) {
  const reset = fixture.kind === 'limit_reset';
  return {
    id: fixture.id,
    kind: fixture.kind,
    description: '',
    enabled: fixture.enabled ?? true,
    starts_at: fixture.starts_at ?? '2026-10-01T00:00:00.000Z',
    ends_at: fixture.ends_at ?? '2026-11-01T00:00:00.000Z',
    plans: fixture.plans ?? ['pro'],
    cost_ceiling_microusd: String(fixture.cost_ceiling_microusd ?? 1_000_000_000),
    committed_microusd: String(fixture.committed_microusd ?? 0),
    reset_source: reset ? 'promotion' : null,
    resets_per_grant: reset ? 1 : null,
    reset_valid_days: reset ? 30 : null,
    apply_at_percent: reset ? 80 : null,
    uplift_percent: reset ? null : (fixture.uplift_percent ?? 50),
    uplift_windows: reset ? [] : (fixture.uplift_windows ?? ['weekly']),
    uplift_workloads: reset ? [] : (fixture.uplift_workloads ?? []),
    version: 1,
    updated_at: '2026-10-01T00:00:00.000Z',
  };
}

interface Script {
  promotions: ReturnType<typeof promotionRow>[];
  grants: Record<string, unknown>[];
  usage: Record<string, number>;
  claimLive?: boolean;
}

function scriptedDb(script: Script) {
  const calls: string[] = [];
  const db: DatabaseAdapter = {
    query: vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes('from public.usage_limit_promotions') && sql.includes('order by id')) {
        return script.promotions.filter((row) => row.enabled);
      }
      if (
        sql.includes('from public.usage_limit_promotion_grants g') &&
        sql.includes('or g.applied_at')
      ) {
        return script.grants;
      }
      if (sql.includes('from public.credit_transactions')) return [script.usage];
      if (sql.includes('for update') && sql.includes("kind = 'limit_uplift'")) {
        const row = script.promotions[0]!;
        return [
          {
            committed_microusd: row.committed_microusd,
            cost_ceiling_microusd: row.cost_ceiling_microusd,
            live: script.claimLive ?? true,
          },
        ];
      }
      if (sql.includes('reference_id = $3')) return [];
      if (sql.includes('insert into public.usage_limit_promotion_grants')) return [];
      return [];
    }) as DatabaseAdapter['query'],
    execute: vi.fn(async (sql: string) => {
      calls.push(sql);
      return 1;
    }),
    transaction: vi.fn(async (run) => run(db)) as DatabaseAdapter['transaction'],
    withUser: vi.fn() as unknown as DatabaseAdapter['withUser'],
  } as unknown as DatabaseAdapter;
  return { db, calls };
}

const NO_USAGE = {
  session: 0,
  weekly: 0,
  flagship_weekly: 0,
  session_before: 0,
  weekly_before: 0,
  flagship_weekly_before: 0,
};

beforeEach(() => {
  mocks.promotionsOn.mockReset();
  mocks.promotionsOn.mockResolvedValue(true);
});

describe('admission caps', () => {
  const request = {
    userId: 'user-1',
    planTier: 'pro',
    workload: 'code',
    estimateMicrousd: 100_000,
    isFlagship: false,
    caps: CAPS,
  };

  it('never touches the database while the switch is off', async () => {
    mocks.promotionsOn.mockResolvedValue(false);
    const connect = vi.fn();
    await expect(resolvePromotionalCaps(request, NOW, connect)).resolves.toEqual(CAPS);
    expect(connect).not.toHaveBeenCalled();
  });

  it('keeps the plan caps when promotions cannot be read', async () => {
    const connect = () => {
      throw new Error('relation "usage_limit_promotions" does not exist');
    };
    await expect(resolvePromotionalCaps(request, NOW, connect)).resolves.toEqual(CAPS);
  });

  it('adds back the usage a reset in the last week took out of the windows', async () => {
    const { db } = scriptedDb({
      promotions: [promotionRow({ id: 'spring-reset', kind: 'limit_reset' })],
      grants: [
        {
          id: 'g-1',
          promotion_id: 'spring-reset',
          kind: 'limit_reset',
          reference_id: 'promotion:1',
          expires_at: '2026-11-01T00:00:00.000Z',
          applied_at: '2026-10-22T10:00:00.000Z',
        },
      ],
      usage: {
        ...NO_USAGE,
        session_before: 400_000,
        weekly_before: 9_000_000,
        flagship_weekly_before: 0,
      },
    });
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual({
      session: 1_400_000,
      weekly: 19_000_000,
      flagshipWeekly: 3_000_000,
    });
  });

  it('claims an uplift only when the request would pass the plan cap', async () => {
    const under = scriptedDb({
      promotions: [
        promotionRow({ id: 'code-week', kind: 'limit_uplift', uplift_workloads: ['code'] }),
      ],
      grants: [],
      usage: { ...NO_USAGE, weekly: 1_000_000 },
    });
    await expect(resolvePromotionalCaps(request, NOW, () => under.db)).resolves.toEqual(CAPS);
    expect(
      under.calls.some((sql) => sql.includes('insert into public.usage_limit_promotion_grants')),
    ).toBe(false);

    const over = scriptedDb({
      promotions: [
        promotionRow({ id: 'code-week', kind: 'limit_uplift', uplift_workloads: ['code'] }),
      ],
      grants: [],
      usage: { ...NO_USAGE, weekly: 9_950_000 },
    });
    await expect(resolvePromotionalCaps(request, NOW, () => over.db)).resolves.toEqual({
      session: 1_000_000,
      weekly: 15_000_000,
      flagshipWeekly: 4_500_000,
    });
    expect(
      over.calls.filter((sql) => sql.includes('set committed_microusd = committed_microusd + $2')),
    ).toHaveLength(1);
  });

  it('does not claim past the cost ceiling', async () => {
    const { db, calls } = scriptedDb({
      promotions: [
        promotionRow({
          id: 'code-week',
          kind: 'limit_uplift',
          cost_ceiling_microusd: 1_000,
          committed_microusd: 900,
        }),
      ],
      grants: [],
      usage: { ...NO_USAGE, weekly: 9_950_000 },
    });
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual(CAPS);
    expect(
      calls.some((sql) => sql.includes('insert into public.usage_limit_promotion_grants')),
    ).toBe(false);
  });

  it('leaves another plan and another workload at the plan caps', async () => {
    const promotions = [
      promotionRow({ id: 'max-only', kind: 'limit_uplift', plans: ['max'] }),
      promotionRow({ id: 'chat-only', kind: 'limit_uplift', uplift_workloads: ['chat'] }),
    ];
    const { db } = scriptedDb({
      promotions,
      grants: [],
      usage: { ...NO_USAGE, weekly: 9_950_000 },
    });
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual(CAPS);
  });

  it('stops a claimed uplift once its promotion has ended', async () => {
    const { db } = scriptedDb({
      promotions: [
        promotionRow({
          id: 'code-week',
          kind: 'limit_uplift',
          ends_at: '2026-10-20T00:00:00.000Z',
        }),
      ],
      grants: [
        {
          id: 'claim',
          promotion_id: 'code-week',
          kind: 'limit_uplift',
          reference_id: 'uplift',
          expires_at: '2026-10-23T00:00:00.000Z',
          applied_at: '2026-10-15T00:00:00.000Z',
        },
      ],
      usage: NO_USAGE,
    });
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual(CAPS);
  });
});

describe('summary and apply while switched off', () => {
  it('shows no promotion block', async () => {
    mocks.promotionsOn.mockResolvedValue(false);
    const connect = vi.fn();
    await expect(
      readSummaryPromotions({ userId: 'user-1', planTier: 'pro', caps: CAPS }, NOW, connect),
    ).resolves.toBeNull();
    expect(connect).not.toHaveBeenCalled();
  });

  it('refuses to apply a reset', async () => {
    mocks.promotionsOn.mockResolvedValue(false);
    const { db } = scriptedDb({ promotions: [], grants: [], usage: NO_USAGE });
    await expect(
      applyUsageLimitReset(db, {
        userId: 'user-1',
        planTier: 'pro',
        applyKey: 'agi.usage.reset.1',
        grantId: null,
        caps: CAPS,
      }),
    ).resolves.toEqual({ status: 'refused', reason: 'promotions_off' });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe('configuration', () => {
  const reset = {
    id: 'spring-reset',
    kind: 'limit_reset',
    startsAt: '2026-10-01T00:00:00Z',
    endsAt: '2026-11-01T00:00:00Z',
    plans: ['pro'],
    costCeilingCredits: 5_000,
    resetSource: 'promotion',
    resetsPerGrant: 1,
    resetValidDays: 30,
    applyAtPercent: 80,
  };

  it('starts disabled and takes every amount from the input', () => {
    const parsed = UsageLimitPromotionInputSchema.parse(reset);
    expect(parsed.enabled).toBe(false);
  });

  it('refuses plans without 5-hour and weekly limits', () => {
    expect(promotablePlanTiers()).not.toContain('free');
    expect(promotablePlanTiers()).not.toContain('enterprise');
    expect(UsageLimitPromotionInputSchema.safeParse({ ...reset, plans: ['free'] }).success).toBe(
      false,
    );
  });

  it('refuses a promotion that ends before it starts or mixes the two kinds', () => {
    expect(
      UsageLimitPromotionInputSchema.safeParse({ ...reset, endsAt: '2026-09-01T00:00:00Z' })
        .success,
    ).toBe(false);
    expect(UsageLimitPromotionInputSchema.safeParse({ ...reset, upliftPercent: 50 }).success).toBe(
      false,
    );
  });
});
