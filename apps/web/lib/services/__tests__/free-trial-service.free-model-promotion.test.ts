import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chargeMicrousdForProviderCost,
  getModelMetadataById,
  type ModelMetadata,
  modelsById,
} from '@agiworkforce/types';

type PromotionTestModule0 = typeof import('@/lib/server/neon-db');
type PromotionTestModule1 = typeof import('@/lib/logger');

vi.mock('server-only', () => ({}));

const tx = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));
const db = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
const promotionLedger = vi.hoisted(() => ({
  settleFreeModelPromotionTurn: vi.fn().mockResolvedValue(undefined),
  recordFreeModelPromotionSearches: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule0>()),
  getNeonDb: () => db,
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: () => db }));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule1>()),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/free-model-promotion-ledger', () => promotionLedger);

import {
  applyFreeTrialProviderBudget,
  beginFreeTrialRequest,
  settleFreeTrialRequest,
  type FreeTrialReservation,
} from '@/lib/services/free-trial-service';
import { FREE_MODEL_PROMOTION_LIMIT_CODE } from '@/lib/server/free-model-promotion';

const PROMOTED = Object.values(modelsById).find(
  (model: ModelMetadata) => model.provider === 'anthropic' && model.qualityTier === 'fast',
) as ModelMetadata;

const PROMOTION = {
  promotionId: 'test-promotion',
  credentialId: 'promotion-account',
  isolated: true,
  reservedMicrousd: 150_000,
};

const ROOMY_WINDOWS = {
  five_hour_used_microusd: '0',
  weekly_used_microusd: '0',
  monthly_used_microusd: '0',
  five_hour_oldest_at: null,
  weekly_oldest_at: null,
  account_period_end: '2026-10-20T00:00:00.000Z',
};

const BEGIN = {
  userId: 'user-1',
  leaseSeconds: 300,
  provider: 'anthropic',
  model: PROMOTED.id,
  promotion: PROMOTION,
};

let windows: Record<string, unknown> = ROOMY_WINDOWS;
let reservationRow: Record<string, unknown> | null = null;

describe('the Free reservation of a turn the free model promotion pays for', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    windows = ROOMY_WINDOWS;
    reservationRow = null;
    tx.execute.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('insert into public.free_daily_usage_reservations')) {
        reservationRow = {
          window_started_at: '2026-10-12T10:00:00.000Z',
          reserved_microusd: params[2],
          settled_at: null,
        };
      }
      return 1;
    });
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.website_auto_economy_trial_usage')) {
        return [{ user_id: 'user-1' }];
      }
      if (sql.includes('with account_anchor')) return [windows];
      if (sql.includes('from public.free_daily_usage_reservations')) {
        return reservationRow ? [reservationRow] : [];
      }
      return [];
    });
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    );
    db.execute.mockResolvedValue(1);
    promotionLedger.settleFreeModelPromotionTurn.mockResolvedValue(undefined);
  });

  it('is unmetered on the Free windows and carries the promotion hold', async () => {
    const result = await beginFreeTrialRequest({ ...BEGIN, requestId: 'p1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.unmetered).toBe(true);
    expect(result.reservation.promotion).toEqual(PROMOTION);
  });

  it('is still served when the account has spent its Free windows', async () => {
    windows = {
      ...ROOMY_WINDOWS,
      five_hour_used_microusd: '999999999999',
      weekly_used_microusd: '999999999999',
      monthly_used_microusd: '999999999999',
    };

    const result = await beginFreeTrialRequest({ ...BEGIN, requestId: 'p2' });

    expect(result).toEqual({
      ok: true,
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'p2',
        reservedMicrousd: 0,
        unmetered: true,
        promotion: PROMOTION,
      },
    });
  });

  it('charges the token cost to the promotion and nothing to the Free windows', async () => {
    const begun = await beginFreeTrialRequest({ ...BEGIN, requestId: 'p3' });
    if (!begun.ok) throw new Error('expected a reservation');
    const usage = { promptTokens: 20_000, completionTokens: 1_000, totalTokens: 21_000 };

    await settleFreeTrialRequest({
      reservation: begun.reservation,
      outcome: 'completed',
      provider: 'anthropic',
      model: PROMOTED.id,
      usage,
      cost: { tokenMicrousd: 2_500, toolMicrousd: 0 },
    });

    const settlement = tx.execute.mock.calls.find(([sql]) =>
      String(sql).includes('update public.free_daily_usage_reservations'),
    );
    expect(settlement?.[1]?.[2]).toBe(0);
    expect(promotionLedger.settleFreeModelPromotionTurn).toHaveBeenCalledTimes(1);
    const [held, spentMicrousd] = promotionLedger.settleFreeModelPromotionTurn.mock.calls[0]!;
    expect(held).toEqual(PROMOTION);
    expect(spentMicrousd).toBeGreaterThanOrEqual(2_500);
  });

  it('settles the promotion of a turn held at zero once, and only by the call that settled it', async () => {
    const reservation: FreeTrialReservation = {
      kind: 'free_trial',
      userId: 'user-1',
      requestId: 'p4',
      reservedMicrousd: 0,
      unmetered: true,
      promotion: PROMOTION,
    };

    db.execute.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await settleFreeTrialRequest({ reservation, outcome: 'failed' });
    await settleFreeTrialRequest({ reservation, outcome: 'failed' });

    expect(promotionLedger.settleFreeModelPromotionTurn).toHaveBeenCalledTimes(1);
    expect(promotionLedger.settleFreeModelPromotionTurn).toHaveBeenCalledWith(PROMOTION, 0);
  });

  it('fits each provider call to the promotion, not to the Free windows', () => {
    const reservation: FreeTrialReservation = {
      kind: 'free_trial',
      userId: 'user-1',
      requestId: 'p5',
      reservedMicrousd: 0,
      unmetered: true,
      promotion: PROMOTION,
    };
    const short = {
      model: PROMOTED.id,
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 4_096,
    };
    const long = {
      model: PROMOTED.id,
      messages: [{ role: 'user', content: 'x'.repeat(200_000) }],
      max_tokens: 4_096,
    };

    expect(
      applyFreeTrialProviderBudget({ reservation, provider: 'anthropic', request: short }),
    ).toEqual({
      ok: true,
      maxOutputTokens: 4_096,
    });
    expect(
      applyFreeTrialProviderBudget({ reservation, provider: 'anthropic', request: long }),
    ).toEqual({
      ok: false,
      code: FREE_MODEL_PROMOTION_LIMIT_CODE,
    });
    expect(getModelMetadataById(PROMOTED.id)?.provider).toBe('anthropic');
  });

  it('pays for provider web searches from the promotion, not the Free windows, and counts them', async () => {
    const begun = await beginFreeTrialRequest({ ...BEGIN, requestId: 'p6' });
    if (!begun.ok) throw new Error('expected a reservation');
    const usage = { promptTokens: 4_000, completionTokens: 300, totalTokens: 4_300 };

    await settleFreeTrialRequest({
      reservation: begun.reservation,
      outcome: 'completed',
      provider: 'anthropic',
      model: PROMOTED.id,
      usage,
      cost: { tokenMicrousd: 600, toolMicrousd: 20_000, serverToolMicrousd: 20_000 },
      webSearchRequests: 2,
    });

    const settlement = tx.execute.mock.calls.find(([sql]) =>
      String(sql).includes('update public.free_daily_usage_reservations'),
    );
    expect(settlement?.[1]?.[2]).toBe(0);
    const [, spent] = promotionLedger.settleFreeModelPromotionTurn.mock.calls[0]!;
    expect(spent).toBeGreaterThanOrEqual(20_600);
    expect(promotionLedger.recordFreeModelPromotionSearches).toHaveBeenCalledWith({
      promotionId: PROMOTION.promotionId,
      userId: 'user-1',
      requestId: 'p6',
      searches: 2,
    });
  });

  it('still charges sandbox and other costs the provider does not bill to the Free windows', async () => {
    const begun = await beginFreeTrialRequest({ ...BEGIN, requestId: 'p7' });
    if (!begun.ok) throw new Error('expected a reservation');

    await settleFreeTrialRequest({
      reservation: begun.reservation,
      outcome: 'completed',
      provider: 'anthropic',
      model: PROMOTED.id,
      cost: { tokenMicrousd: 600, toolMicrousd: 27_000, serverToolMicrousd: 20_000 },
    });

    const settlement = tx.execute.mock.calls.find(([sql]) =>
      String(sql).includes('update public.free_daily_usage_reservations'),
    );
    expect(settlement?.[1]?.[2]).toBe(chargeMicrousdForProviderCost(7_000));
    const [, spent] = promotionLedger.settleFreeModelPromotionTurn.mock.calls[0]!;
    expect(spent).toBeGreaterThanOrEqual(20_600);
    expect(spent).toBeLessThan(27_600);
    expect(promotionLedger.recordFreeModelPromotionSearches).not.toHaveBeenCalled();
  });
});
