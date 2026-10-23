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
  diffUsageLimitPromotion,
  promotablePlanTiers,
  readSummaryPromotions,
  resetEnabledPromotionCache,
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
  lockedVersion?: number;
  lockedCommitted?: number;
  existingClaim?: { committed_microusd: number; lapsed: boolean; ends_short: boolean };
}

interface Write {
  sql: string;
  params: unknown[];
}

function scriptedDb(script: Script) {
  const calls: string[] = [];
  const writes: Write[] = [];
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
            committed_microusd: script.lockedCommitted ?? row.committed_microusd,
            cost_ceiling_microusd: row.cost_ceiling_microusd,
            version: script.lockedVersion ?? row.version,
            live: script.claimLive ?? true,
          },
        ];
      }
      if (sql.includes('reference_id = $3'))
        return script.existingClaim ? [script.existingClaim] : [];
      if (sql.includes('insert into public.usage_limit_promotion_grants')) return [];
      return [];
    }) as DatabaseAdapter['query'],
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push(sql);
      writes.push({ sql, params });
      return 1;
    }),
    transaction: vi.fn(async (run) => run(db)) as DatabaseAdapter['transaction'],
    withUser: vi.fn() as unknown as DatabaseAdapter['withUser'],
  } as unknown as DatabaseAdapter;
  return { db, calls, writes };
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
  resetEnabledPromotionCache();
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

describe('uplift claims follow the promotion as it is edited', () => {
  const request = {
    userId: 'user-1',
    planTier: 'pro',
    workload: 'code',
    estimateMicrousd: 100_000,
    isFlagship: false,
    caps: CAPS,
  };
  const RAISED = { session: 1_000_000, weekly: 15_000_000, flagshipWeekly: 4_500_000 };
  const EXPOSURE = 10_000_000;

  function claim(overrides: Record<string, unknown> = {}) {
    return {
      id: 'claim',
      promotion_id: 'code-week',
      kind: 'limit_uplift',
      reference_id: 'uplift',
      expires_at: '2026-11-01T00:00:00.000Z',
      applied_at: '2026-10-15T00:00:00.000Z',
      committed_microusd: EXPOSURE,
      ...overrides,
    };
  }

  function claimedScript(
    promotion: Partial<Parameters<typeof promotionRow>[0]>,
    grant: Record<string, unknown>,
    existingClaim?: Script['existingClaim'],
  ) {
    return scriptedDb({
      promotions: [promotionRow({ ...promotion, id: 'code-week', kind: 'limit_uplift' })],
      grants: [grant],
      usage: NO_USAGE,
      ...(existingClaim ? { existingClaim } : {}),
    });
  }

  const committedWrites = (writes: Write[]) =>
    writes.filter((write) =>
      write.sql.includes('set committed_microusd = committed_microusd + $2'),
    );

  it('touches nothing while the claim still covers the promotion', async () => {
    const { db, writes, calls } = claimedScript({}, claim());
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual(RAISED);
    expect(writes).toEqual([]);
    expect(calls.some((sql) => sql.includes('for update'))).toBe(false);
  });

  it('charges the full current exposure again when an edit raised the percent after the claim', async () => {
    const { db, writes } = claimedScript(
      { uplift_percent: 100 },
      claim({ committed_microusd: EXPOSURE }),
      { committed_microusd: EXPOSURE, lapsed: false, ends_short: false },
    );
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual({
      session: 1_000_000,
      weekly: 20_000_000,
      flagshipWeekly: 6_000_000,
    });
    expect(committedWrites(writes).map((write) => write.params)).toEqual([
      ['code-week', 2 * EXPOSURE],
    ]);
    const grantUpdate = writes.find((write) =>
      write.sql.includes('update public.usage_limit_promotion_grants'),
    );
    expect(grantUpdate?.params).toEqual(['code-week', 'user-1', 'uplift', 2 * EXPOSURE]);
  });

  it('moves the expiry forward and charges the exposure again when the end date moved', async () => {
    const { db, writes } = claimedScript(
      { ends_at: '2026-11-05T00:00:00.000Z' },
      claim({ expires_at: '2026-10-25T00:00:00.000Z' }),
      { committed_microusd: EXPOSURE, lapsed: false, ends_short: true },
    );
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual(RAISED);
    expect(committedWrites(writes).map((write) => write.params)).toEqual([['code-week', EXPOSURE]]);
    const grantUpdate = writes.find((write) =>
      write.sql.includes('update public.usage_limit_promotion_grants'),
    );
    expect(grantUpdate?.sql).toContain('greatest(g.expires_at, p.ends_at)');
    expect(grantUpdate?.params[3]).toBe(EXPOSURE);
  });

  it('holds the plan caps when extending the end date would pass the ceiling', async () => {
    const { db, writes } = claimedScript(
      {
        ends_at: '2026-11-05T00:00:00.000Z',
        cost_ceiling_microusd: 12_000_000,
        committed_microusd: 5_000_000,
      },
      claim({ expires_at: '2026-10-25T00:00:00.000Z' }),
      { committed_microusd: EXPOSURE, lapsed: false, ends_short: true },
    );
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual(CAPS);
    expect(writes).toEqual([]);
  });

  it('holds the plan caps when an edit would push the claim past the ceiling', async () => {
    const { db, writes } = claimedScript(
      { uplift_percent: 100, cost_ceiling_microusd: 12_000_000, committed_microusd: 11_000_000 },
      claim(),
      { committed_microusd: EXPOSURE, lapsed: false, ends_short: false },
    );
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual(CAPS);
    expect(writes).toEqual([]);
  });

  it('refuses the extension under the lock when the ceiling was reached since the list was read', async () => {
    const { db, writes } = scriptedDb({
      promotions: [
        promotionRow({
          id: 'code-week',
          kind: 'limit_uplift',
          uplift_percent: 100,
          cost_ceiling_microusd: 12_000_000,
          committed_microusd: 0,
        }),
      ],
      grants: [claim()],
      usage: NO_USAGE,
      lockedCommitted: 11_000_000,
      existingClaim: { committed_microusd: EXPOSURE, lapsed: false, ends_short: false },
    });
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual(CAPS);
    expect(writes).toEqual([]);
  });

  it('refuses a claim costed on a promotion version that has since been edited', async () => {
    const { db, writes } = scriptedDb({
      promotions: [promotionRow({ id: 'code-week', kind: 'limit_uplift', uplift_percent: 100 })],
      grants: [claim()],
      usage: NO_USAGE,
      lockedVersion: 2,
      existingClaim: { committed_microusd: EXPOSURE, lapsed: false, ends_short: false },
    });
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual(CAPS);
    expect(writes).toEqual([]);
  });

  it('charges a lapsed claim in full when the promotion was extended past it', async () => {
    const { db, writes } = scriptedDb({
      promotions: [promotionRow({ id: 'code-week', kind: 'limit_uplift' })],
      grants: [
        claim({
          expires_at: '2026-10-22T06:00:00.000Z',
          applied_at: '2026-10-22T01:00:00.000Z',
        }),
      ],
      usage: { ...NO_USAGE, weekly: 9_950_000 },
      existingClaim: { committed_microusd: EXPOSURE, lapsed: true, ends_short: true },
    });
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual(RAISED);
    expect(committedWrites(writes).map((write) => write.params)).toEqual([['code-week', EXPOSURE]]);
  });
});

describe('load', () => {
  const request = {
    userId: 'user-1',
    planTier: 'pro',
    workload: 'code',
    estimateMicrousd: 100_000,
    isFlagship: false,
    caps: CAPS,
  };

  it('does not take the row lock for a promotion the list already shows as full', async () => {
    const { db, calls } = scriptedDb({
      promotions: [
        promotionRow({
          id: 'code-week',
          kind: 'limit_uplift',
          cost_ceiling_microusd: 12_000_000,
          committed_microusd: 5_000_000,
        }),
      ],
      grants: [],
      usage: { ...NO_USAGE, weekly: 9_950_000 },
    });
    await expect(resolvePromotionalCaps(request, NOW, () => db)).resolves.toEqual(CAPS);
    expect(calls.some((sql) => sql.includes('for update'))).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('reads the enabled promotions once inside the cache window', async () => {
    const { db, calls } = scriptedDb({
      promotions: [promotionRow({ id: 'code-week', kind: 'limit_uplift' })],
      grants: [],
      usage: NO_USAGE,
    });
    const listReads = () => calls.filter((sql) => sql.includes('order by id asc')).length;
    await resolvePromotionalCaps(request, NOW, () => db);
    await resolvePromotionalCaps(request, NOW + 1_000, () => db);
    expect(listReads()).toBe(1);
    await resolvePromotionalCaps(request, NOW + 10 * 60_000, () => db);
    expect(listReads()).toBe(2);
  });
});

describe('promotion audit diff', () => {
  const stored = {
    ...promotionRow({ id: 'code-week', kind: 'limit_uplift' }),
  };

  it('names each changed key with its value before and after', async () => {
    const { db } = scriptedDb({ promotions: [stored], grants: [], usage: NO_USAGE });
    const { listUsageLimitPromotions } = await import('../usage-limit-promotion-service');
    const [before] = await listUsageLimitPromotions(db);
    const after = {
      ...before!,
      costCeilingMicrousd: before!.costCeilingMicrousd * 2,
      plans: ['pro', 'max'],
      endsAt: '2026-11-05T00:00:00.000Z',
    };
    const diff = diffUsageLimitPromotion(before!, after);
    expect(diff.changedKeys).toEqual(['costCeilingCredits', 'endsAt', 'plans']);
    expect(diff.before).toEqual([
      'costCeilingCredits:200000',
      'endsAt:2026-11-01T00:00:00.000Z',
      'plans:pro',
    ]);
    expect(diff.after).toEqual([
      'costCeilingCredits:400000',
      'endsAt:2026-11-05T00:00:00.000Z',
      'plans:pro,max',
    ]);
  });

  it('reports every configured key as new on creation', async () => {
    const { db } = scriptedDb({ promotions: [stored], grants: [], usage: NO_USAGE });
    const { listUsageLimitPromotions } = await import('../usage-limit-promotion-service');
    const [after] = await listUsageLimitPromotions(db);
    const diff = diffUsageLimitPromotion(null, after!);
    expect(diff.changedKeys).toContain('upliftPercent');
    expect(diff.before).toEqual([]);
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
