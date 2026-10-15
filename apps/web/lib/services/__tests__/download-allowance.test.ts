import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  DOWNLOAD_COST_SHARE_OF_PRICE,
  FEATURE_RATE_CARD,
  FREE_DAILY_CAPS,
  STORAGE_COST_SHARE_OF_PRICE,
  getBillingPlanProductLimits,
} from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({
  countUnits: vi.fn(),
  planTier: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/cogs-ledger-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  countUserDownloadAllowanceGibSince: (...args: unknown[]) => mocks.countUnits(...args),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveEntitledPlanTier: (...args: unknown[]) => mocks.planTier(...args),
}));

import { buildAiGeneratedProvenance } from '@/lib/compliance/ai-act';
import {
  MONTHLY_DOWNLOAD_LIMIT_CODE,
  PlanDownloadLimitError,
  assertDownloadAllowance,
  downloadSpendsAllowance,
  readDownloadUsage,
} from '../tier-unit-quota-service';

const GIB = 1024 ** 3;
const db = {} as never;
const usdPerGib = (feature: 'network_egress_gib' | 'object_storage_gib_month') =>
  (FEATURE_RATE_CARD[feature].providerCogsMicrousd as number) / 1_000_000;

const PAID = ['basic', 'pro', 'max', 'max_15x', 'team', 'team_premium'] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.countUnits.mockResolvedValue(0);
});

describe('per-plan download and storage caps', () => {
  it.each(PAID)('caps %s downloads at the download share of its price', (plan) => {
    const cap = getBillingPlanProductLimits(plan)?.monthlyDownloadBytes;
    expect(typeof cap).toBe('number');
    const expected =
      ((BILLING_PLAN_PRICING[plan].monthlyPriceUsd * DOWNLOAD_COST_SHARE_OF_PRICE) /
        usdPerGib('network_egress_gib')) *
      GIB;
    expect(Math.abs((cap as number) - expected)).toBeLessThan(1);
  });

  it.each([
    ['max', 62],
    ['max_15x', 124],
    ['team_premium', 77],
  ] as const)('gives %s a %i GiB storage quota instead of unlimited', (plan, gib) => {
    expect(getBillingPlanProductLimits(plan)?.knowledgeStorageBytes).toBe(gib * GIB);
    expect(gib).toBe(
      Math.floor(
        (BILLING_PLAN_PRICING[plan].monthlyPriceUsd * STORAGE_COST_SHARE_OF_PRICE) /
          usdPerGib('object_storage_gib_month'),
      ),
    );
  });

  it('leaves contract plans to their contract', () => {
    expect(getBillingPlanProductLimits('enterprise')?.monthlyDownloadBytes).toBe('custom');
  });
});

describe('assertDownloadAllowance', () => {
  it('serves a paid download inside the month’s allowance', async () => {
    mocks.planTier.mockResolvedValue('pro');
    mocks.countUnits.mockResolvedValue(1);

    await expect(assertDownloadAllowance({ db, userId: 'user-1', bytes: GIB })).resolves.toBe(
      undefined,
    );
    expect(mocks.countUnits).toHaveBeenCalledWith('user-1', expect.any(Date));
  });

  it('refuses a paid download past the month’s allowance with the upgrade path', async () => {
    mocks.planTier.mockResolvedValue('pro');
    const cap = getBillingPlanProductLimits('pro')?.monthlyDownloadBytes as number;
    mocks.countUnits.mockResolvedValue(cap / GIB);

    const refusal = await assertDownloadAllowance({ db, userId: 'user-1', bytes: 1 }).catch(
      (error: unknown) => error,
    );

    expect(refusal).toBeInstanceOf(PlanDownloadLimitError);
    expect((refusal as PlanDownloadLimitError).statusCode).toBe(429);
    expect((refusal as PlanDownloadLimitError).message).toContain('Pro includes');
    expect((refusal as PlanDownloadLimitError).details).toMatchObject({
      code: MONTHLY_DOWNLOAD_LIMIT_CODE,
      recovery: { action: 'upgrade', href: '/pricing' },
    });
  });

  it('refuses rather than serves when the month’s downloads cannot be counted', async () => {
    mocks.planTier.mockResolvedValue('max');
    mocks.countUnits.mockRejectedValue(new Error('ledger down'));

    await expect(assertDownloadAllowance({ db, userId: 'user-1', bytes: 1 })).rejects.toMatchObject(
      { statusCode: 503 },
    );
  });

  it('keeps the Free daily download cap', async () => {
    mocks.planTier.mockResolvedValue('free');
    mocks.countUnits.mockResolvedValue(FREE_DAILY_CAPS.egressBytes / GIB);

    await expect(assertDownloadAllowance({ db, userId: 'user-1', bytes: 1 })).rejects.toMatchObject(
      { statusCode: 429 },
    );
  });

  it('does not count a contract plan', async () => {
    mocks.planTier.mockResolvedValue('enterprise');

    await assertDownloadAllowance({ db, userId: 'user-1', bytes: 10 * GIB });

    expect(mocks.countUnits).not.toHaveBeenCalled();
  });

  it('reports usage against the cap and when it resets', async () => {
    mocks.countUnits.mockResolvedValue(0.5);

    const usage = await readDownloadUsage({
      userId: 'user-1',
      planTier: 'max',
      now: new Date('2026-10-10T12:00:00Z'),
    });

    expect(usage).toEqual({
      usedBytes: 0.5 * GIB,
      limitBytes: getBillingPlanProductLimits('max')?.monthlyDownloadBytes,
      resetsAt: '2026-11-01T00:00:00.000Z',
    });
  });
});

describe('downloadSpendsAllowance (owner decision on media)', () => {
  const generated = (kind: 'image' | 'video') => ({
    userId: 'user-1',
    kind,
    metadata: {
      aiAct: buildAiGeneratedProvenance({ kind, provider: 'fixture', model: 'fixture-model' }),
    },
  });

  it.each(['image', 'video'] as const)(
    'spends nothing to serve the owner the %s it generated',
    (kind) => {
      expect(downloadSpendsAllowance(generated(kind), 'user-1')).toBe(false);
    },
  );

  it('spends the allowance on an image the owner uploaded', () => {
    expect(
      downloadSpendsAllowance(
        {
          userId: 'user-1',
          kind: 'image',
          metadata: { origin: 'upload', source: 'chat-attachment' },
        },
        'user-1',
      ),
    ).toBe(true);
  });

  it('spends the allowance on a generated image that belongs to another account', () => {
    expect(downloadSpendsAllowance(generated('image'), 'user-2')).toBe(true);
  });

  it('spends the allowance on a file whose record does not prove it was generated as that kind', () => {
    expect(downloadSpendsAllowance({ ...generated('video'), kind: 'image' }, 'user-1')).toBe(true);
    expect(downloadSpendsAllowance({ ...generated('image'), kind: 'file' }, 'user-1')).toBe(true);
    expect(
      downloadSpendsAllowance(
        { userId: 'user-1', kind: 'image', metadata: { aiAct: { kind: 'image' } } },
        'user-1',
      ),
    ).toBe(true);
  });
});
