import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_MODEL_IMAGE_ENVELOPE } from '@agiworkforce/cloud-contracts';
import {
  chargeMicrousdForProviderCost,
  getModelMetadataById,
  listCanonicalModels,
  MICROUSD_PER_CREDIT,
  resolveMaxOutputTokens,
} from '@agiworkforce/types';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { markNativeDocument } from '@/app/api/llm/v1/chat/completions/lib/media-input';
type ScanModule0 = typeof import('@/lib/services/cogs-ledger-service');

vi.mock('server-only', () => ({}));

const tx = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));
const db = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
const scopes = vi.hoisted(() => [] as Array<{ userId: string; organizationId: string | null }>);
const scopedRead = { query: tx.query } as never;

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: (
    _db: unknown,
    scope: { userId: string; organizationId: string | null },
  ) => {
    scopes.push(scope);
    return db;
  },
}));

const logger = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger }));

const recordSettledProviderCost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/cogs-ledger-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  recordSettledProviderCost,
}));

import { toPublicUsagePercentage } from '@/lib/server/managed-usage-policy';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';

import {
  FREE_TRIAL_INTERNAL_USAGE_POLICY,
  applyFreeTrialProviderBudget,
  beginFreeTrialRequest,
  createFreeTrialToolSpend,
  estimateConservativeFreeInputTokens,
  fitFreeTrialOutputBudget,
  fitsFreeTrialWindow,
  freeTrialResetAt,
  freeTrialRetryAfterSeconds,
  getFreeTrialPublicUsage,
  releaseExpiredFreeTrialReservations,
  scopeFreeTrialToolSpend,
  settleFreeTrialRequest,
  transferFreeTrialHold,
  type FreeTrialReservation,
} from './free-trial-service';
import { LLMCostCalculator } from './llm-cost-calculator';

const FIVE_HOUR_OLDEST = '2026-07-22T12:00:00.000Z';
const WEEKLY_OLDEST = '2026-07-20T08:00:00.000Z';
const PERIOD_END = '2026-08-01T00:00:00.000Z';
const FIVE_HOUR_BUDGET = 200 * MICROUSD_PER_CREDIT;
const WEEKLY_BUDGET = 1_500 * MICROUSD_PER_CREDIT;
const MONTHLY_BUDGET = 2_000 * MICROUSD_PER_CREDIT;

const TIERED_MODEL = (() => {
  const candidate = listCanonicalModels().find(
    (model) => (model.inputTokenPricingTiers?.length ?? 0) > 0,
  );
  const firstTier = candidate?.inputTokenPricingTiers?.[0];
  if (!candidate || !firstTier) throw new Error('Expected a catalog tiered-pricing fixture');
  return { ...candidate, firstTier };
})();
const FREE_CHAT_MODEL = (() => {
  const candidate = listCanonicalModels().find(
    (model) =>
      model.tierPolicy?.minTier === 'free' &&
      typeof model.contextWindow === 'number' &&
      typeof model.inputCost === 'number' &&
      typeof model.outputCost === 'number',
  );
  if (!candidate) throw new Error('Expected a priced Free chat fixture');
  return candidate;
})();
const ANTHROPIC_CHAT_MODEL = (() => {
  const candidate = listCanonicalModels().find(
    (model) =>
      model.provider === 'anthropic' &&
      typeof model.inputCost === 'number' &&
      typeof model.outputCost === 'number',
  );
  if (!candidate) throw new Error('Expected a priced Anthropic chat fixture');
  return candidate;
})();

const DOCUMENTED_IMAGE_TOKEN_MAXIMUM: Readonly<Record<string, number>> = {
  anthropic: 4_784,
  openai: Math.ceil(30_000 * 2.46),
};
const DOCUMENTED_PAGE_IMAGE_TOKEN_MAXIMUM: Readonly<Record<string, number>> = {
  anthropic: 4_784,
  openai: Math.ceil(6_144 * 2.46),
};
const FREE_PICTURE_MODELS = FREE_TRIAL_MODELS.map((id) => {
  const metadata = getModelMetadataById(id);
  if (!metadata) throw new Error(`Expected catalog metadata for the Free model ${id}`);
  return metadata;
}).filter((metadata) => metadata.inputModalities?.includes('image'));
const FREE_PDF_MODELS = FREE_PICTURE_MODELS.filter((metadata) =>
  metadata.inputModalities?.includes('pdf'),
);
const UNDOCUMENTED_IMAGE_MODEL = (() => {
  const candidate = listCanonicalModels().find(
    (model) =>
      model.inputModalities?.includes('image') &&
      model.imageInput?.maxInputTokensPerImage === undefined &&
      typeof model.inputCost === 'number',
  );
  if (!candidate) throw new Error('Expected a priced image model with no per-image bound');
  return candidate;
})();
const PHOTO_BASE64_LENGTH = 3_391_856;
const PDF_BASE64_LENGTH = 2_000_000;
const PDF_PAGE_COUNT = 40;
const PDF_EXTRACTED_TEXT = 'Quarterly revenue rose in every region. '.repeat(2_000);

function pdfMessages(extractedTextComplete: boolean) {
  const fallback = [
    {
      type: 'file',
      file: {
        filename: 'report.pdf',
        mime_type: 'text/plain',
        file_data: `data:text/plain;base64,${Buffer.from(PDF_EXTRACTED_TEXT).toString('base64')}`,
      },
    },
  ];
  return [
    {
      role: 'user',
      content: 'Summarize this report.',
      multimodal_content: [
        { type: 'text', text: 'Summarize this report.' },
        ...markNativeDocument<Record<string, unknown>>(
          { type: 'text', text: '[attached file: report.pdf (application/pdf)]' },
          fallback,
          {
            filename: 'report.pdf',
            mediaType: 'application/pdf',
            data: 'A'.repeat(PDF_BASE64_LENGTH),
            pageCount: PDF_PAGE_COUNT,
            extractedTextComplete,
          },
        ),
      ],
    },
  ];
}

function pictureMessages(pictures: number, base64Length = PHOTO_BASE64_LENGTH) {
  const picture = {
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${'A'.repeat(base64Length)}` },
  };
  return [
    {
      role: 'user',
      content: 'What is in this picture?',
      multimodal_content: [
        { type: 'text', text: 'What is in this picture?' },
        ...Array.from({ length: pictures }, () => picture),
      ],
    },
  ];
}

interface WindowUse {
  fiveHour: number;
  weekly: number;
  monthly: number;
}

let windows: WindowUse | null = null;
const stored = new Map<string, { reserved: number; settledAt: string | null }>();

function snapshotRow(use: WindowUse) {
  return {
    five_hour_used_microusd: String(use.fiveHour),
    weekly_used_microusd: String(use.weekly),
    monthly_used_microusd: String(use.monthly),
    five_hour_oldest_at: use.fiveHour > 0 ? FIVE_HOUR_OLDEST : null,
    weekly_oldest_at: use.weekly > 0 ? WEEKLY_OLDEST : null,
    account_period_end: PERIOD_END,
  };
}

function useWindows(use: Partial<WindowUse>): void {
  windows = { fiveHour: 0, weekly: 0, monthly: 0, ...use };
}

function storedReservation(requestId: string, reserved: number, settledAt: string | null = null) {
  stored.set(requestId, { reserved, settledAt });
}

function executed(fragment: string): Array<[string, unknown[]]> {
  return tx.execute.mock.calls.filter(([sql]) => String(sql).includes(fragment)) as Array<
    [string, unknown[]]
  >;
}

function reservation(overrides: Partial<FreeTrialReservation> = {}): FreeTrialReservation {
  return {
    kind: 'free_trial',
    userId: 'user-1',
    requestId: 'request-1',
    reservedMicrousd: 25_000,
    ...overrides,
  };
}

const BEGIN = {
  userId: 'user-1',
  requestId: 'request-1',
  leaseSeconds: 300,
  provider: 'openrouter',
  model: 'free-route-model',
};

beforeEach(() => {
  vi.clearAllMocks();
  scopes.length = 0;
  stored.clear();
  useWindows({});
  recordSettledProviderCost.mockResolvedValue(undefined);
  db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) =>
    callback(tx),
  );
  db.query.mockImplementation((sql: string, params?: unknown[]) => tx.query(sql, params));
  tx.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('from public.website_auto_economy_trial_usage')) {
      return [{ user_id: params[0] }];
    }
    if (sql.includes('with account_anchor')) return windows ? [snapshotRow(windows)] : [];
    if (sql.includes('from public.free_daily_usage_reservations')) {
      const row = stored.get(String(params[1]));
      return row
        ? [
            {
              window_started_at: FIVE_HOUR_OLDEST,
              reserved_microusd: row.reserved,
              settled_at: row.settledAt,
            },
          ]
        : [];
    }
    return [];
  });
  tx.execute.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('insert into public.free_daily_usage_reservations')) {
      storedReservation(String(params[1]), Number(params[2]));
    }
    if (sql.includes('update public.free_daily_usage_reservations')) {
      const row = stored.get(String(params[1]));
      if (row && !row.settledAt) row.settledAt = '2026-07-22T12:05:00.000Z';
    }
    return 1;
  });
});

describe('the Free usage windows', () => {
  it('holds Free to the plan table: 200, 1,500 and 2,000 credits per 5 hours, week and month', () => {
    expect(FREE_TRIAL_INTERNAL_USAGE_POLICY).toEqual({
      fiveHourBudgetMicrousd: FIVE_HOUR_BUDGET,
      fiveHourWindowHours: 5,
      weeklyBudgetMicrousd: WEEKLY_BUDGET,
      weeklyWindowHours: 168,
      monthlyBudgetMicrousd: MONTHLY_BUDGET,
    });
  });

  it('reports what each window used, how full it is and when it resets', async () => {
    useWindows({ fiveHour: 5_000, weekly: 15_000, monthly: 20_000 });

    await expect(getFreeTrialPublicUsage(scopedRead, 'user-1')).resolves.toEqual({
      usagePercentage: toPublicUsagePercentage(20_000, MONTHLY_BUDGET),
      resetAt: PERIOD_END,
      sessionUsagePercentage: toPublicUsagePercentage(5_000, FIVE_HOUR_BUDGET),
      sessionResetAt: '2026-07-22T17:00:00.000Z',
      weeklyUsagePercentage: toPublicUsagePercentage(15_000, WEEKLY_BUDGET),
      weeklyResetAt: '2026-07-27T08:00:00.000Z',
      hasUsageRemaining: true,
      monthlyUsedMicrousd: 20_000,
      weeklyUsedMicrousd: 15_000,
      fiveHourUsedMicrousd: 5_000,
    });
    const [sql, params] = tx.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('from public.free_daily_usage_reservations');
    expect(params).toEqual(['user-1', 5, 168]);
  });

  it('says nothing is left once any one window is spent', async () => {
    useWindows({ fiveHour: FIVE_HOUR_BUDGET, weekly: FIVE_HOUR_BUDGET, monthly: FIVE_HOUR_BUDGET });

    const usage = await getFreeTrialPublicUsage(scopedRead, 'user-1');

    expect(usage.hasUsageRemaining).toBe(false);
    expect(usage.sessionUsagePercentage).toBe(100);
  });

  it('reports an account with no Free ledger yet as every window open', async () => {
    windows = null;

    await expect(getFreeTrialPublicUsage(scopedRead, 'user-1')).resolves.toMatchObject({
      usagePercentage: 0,
      resetAt: null,
      hasUsageRemaining: true,
      monthlyUsedMicrousd: 0,
    });
  });
});

describe('beginFreeTrialRequest', () => {
  it('reserves the estimate charged to the hundredth of a credit, with its lease and route', async () => {
    const result = await beginFreeTrialRequest({ ...BEGIN, estimatedMicrousd: 4_321 });

    const reserved = chargeMicrousdForProviderCost(4_321);
    expect(result).toEqual({
      ok: true,
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-1',
        reservedMicrousd: reserved,
      },
    });
    const [insert] = executed('insert into public.free_daily_usage_reservations');
    expect(insert?.[0]).toContain('lease_expires_at');
    expect(insert?.[1]).toEqual([
      'user-1',
      'request-1',
      reserved,
      300,
      'openrouter',
      'free-route-model',
      null,
    ]);
    expect(scopes).toContainEqual({ userId: 'user-1', organizationId: null });
  });

  it('links the reservation to the conversation the turn answers', async () => {
    await beginFreeTrialRequest({
      ...BEGIN,
      estimatedMicrousd: 4_321,
      conversationId: '0190a000-0000-7000-8000-0000000000c1',
    });

    const [insert] = executed('insert into public.free_daily_usage_reservations');
    expect(insert?.[0]).toContain('conversation_id');
    expect(insert?.[1]?.[6]).toBe('0190a000-0000-7000-8000-0000000000c1');
  });

  it('reserves the smallest remaining window when the call carries no estimate', async () => {
    useWindows({ fiveHour: 4_000, weekly: WEEKLY_BUDGET - 5_000, monthly: 50_000 });

    const result = await beginFreeTrialRequest(BEGIN);

    expect(result).toMatchObject({ ok: true, reservation: { reservedMicrousd: 5_000 } });
  });

  it('reserves at least one microUSD for a call estimated at nothing', async () => {
    const result = await beginFreeTrialRequest({ ...BEGIN, estimatedMicrousd: 0 });

    expect(result).toMatchObject({ ok: true, reservation: { reservedMicrousd: 1 } });
  });

  it('refuses a call the five-hour window cannot cover and names when it resets', async () => {
    useWindows({ fiveHour: FIVE_HOUR_BUDGET - 2_000, weekly: 8_000, monthly: 8_000 });

    await expect(beginFreeTrialRequest({ ...BEGIN, estimatedMicrousd: 3_000 })).resolves.toEqual({
      ok: false,
      code: 'budget_reached',
      resetAt: '2026-07-22T17:00:00.000Z',
    });
    expect(executed('insert into public.free_daily_usage_reservations')).toHaveLength(0);
  });

  it('holds what the window has left when that still covers the minimum asked for', async () => {
    useWindows({ fiveHour: FIVE_HOUR_BUDGET - 2_000, weekly: 8_000, monthly: 8_000 });

    await expect(
      beginFreeTrialRequest({ ...BEGIN, estimatedMicrousd: 3_000, minimumMicrousd: 1_000 }),
    ).resolves.toMatchObject({ ok: true, reservation: { reservedMicrousd: 2_000 } });
  });

  it('refuses when what the window has left is under the minimum asked for', async () => {
    useWindows({ fiveHour: FIVE_HOUR_BUDGET - 2_000, weekly: 8_000, monthly: 8_000 });

    await expect(
      beginFreeTrialRequest({ ...BEGIN, estimatedMicrousd: 3_000, minimumMicrousd: 2_500 }),
    ).resolves.toMatchObject({ ok: false, code: 'budget_reached' });
    expect(executed('insert into public.free_daily_usage_reservations')).toHaveLength(0);
  });

  it('names the weekly reset when the week is the window that binds', async () => {
    useWindows({ fiveHour: 1, weekly: WEEKLY_BUDGET - 500, monthly: WEEKLY_BUDGET - 500 });

    await expect(beginFreeTrialRequest({ ...BEGIN, estimatedMicrousd: 2_000 })).resolves.toEqual({
      ok: false,
      code: 'budget_reached',
      resetAt: '2026-07-27T08:00:00.000Z',
    });
  });

  it('names the end of the account month when the month is the window that binds', async () => {
    useWindows({ fiveHour: 0, weekly: 0, monthly: MONTHLY_BUDGET });

    await expect(beginFreeTrialRequest(BEGIN)).resolves.toEqual({
      ok: false,
      code: 'budget_reached',
      resetAt: PERIOD_END,
    });
  });

  it('names the later reset when two windows are spent at once', async () => {
    useWindows({ fiveHour: FIVE_HOUR_BUDGET, weekly: WEEKLY_BUDGET, monthly: WEEKLY_BUDGET });

    const result = await beginFreeTrialRequest(BEGIN);

    expect(result).toEqual({
      ok: false,
      code: 'budget_reached',
      resetAt: '2026-07-27T08:00:00.000Z',
    });
  });

  it('starts a free-pool turn unmetered at zero when no window has room, on a zero-cost row', async () => {
    useWindows({ fiveHour: FIVE_HOUR_BUDGET, weekly: FIVE_HOUR_BUDGET, monthly: FIVE_HOUR_BUDGET });

    await expect(
      beginFreeTrialRequest({ ...BEGIN, freePoolRoute: true, estimatedMicrousd: 2_000 }),
    ).resolves.toEqual({
      ok: true,
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-1',
        reservedMicrousd: 0,
        unmetered: true,
      },
    });
    const inserts = executed('insert into public.free_daily_usage_reservations');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.[1]?.[2]).toBe(0);
  });

  it('still reserves the windows for a free-pool turn so its paid tools are covered', async () => {
    const result = await beginFreeTrialRequest({
      ...BEGIN,
      freePoolRoute: true,
      estimatedMicrousd: 2_000,
    });

    expect(result).toMatchObject({
      ok: true,
      reservation: { reservedMicrousd: chargeMicrousdForProviderCost(2_000), unmetered: true },
    });
    expect(executed('insert into public.free_daily_usage_reservations')).toHaveLength(1);
  });

  it('refuses a request id it has already reserved instead of reserving it twice', async () => {
    await beginFreeTrialRequest({ ...BEGIN, estimatedMicrousd: 2_000 });

    await expect(beginFreeTrialRequest({ ...BEGIN, estimatedMicrousd: 2_000 })).resolves.toEqual({
      ok: false,
      code: 'budget_reached',
      resetAt: null,
    });
    expect(executed('insert into public.free_daily_usage_reservations')).toHaveLength(1);
  });
});

describe('settleFreeTrialRequest', () => {
  it('charges the measured token and tool spend, rounded up to a hundredth of a credit', async () => {
    storedReservation('request-1', 25_000);

    await settleFreeTrialRequest({
      reservation: reservation(),
      outcome: 'completed',
      provider: 'anthropic',
      model: 'turn-model',
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      cost: { tokenMicrousd: 1_234, toolMicrousd: 2_000 },
    });

    const [settle] = executed('update public.free_daily_usage_reservations');
    expect(settle?.[0]).toContain('actual_cost_microusd = $3');
    expect(settle?.[1]).toEqual([
      'user-1',
      'request-1',
      3_250,
      'completed',
      expect.any(String),
      'completed',
      null,
    ]);
    expect(JSON.parse(String(settle?.[1]?.[4]))).toEqual({
      requestId: 'request-1',
      outcome: 'completed',
      provider: 'anthropic',
      model: 'turn-model',
      recordedTokens: 120,
    });
    expect(executed('update public.website_auto_economy_trial_usage')[0]?.[1]).toEqual([
      'user-1',
      120,
    ]);
  });

  it('never charges past what the turn reserved', async () => {
    storedReservation('request-1', 2_000);

    await settleFreeTrialRequest({
      reservation: reservation({ reservedMicrousd: 2_000 }),
      outcome: 'completed',
      cost: { tokenMicrousd: 9_000, toolMicrousd: 0 },
    });

    expect(executed('update public.free_daily_usage_reservations')[0]?.[1]?.[2]).toBe(2_000);
  });

  it('charges a free-pool turn for its paid tools and never for its tokens', async () => {
    storedReservation('request-1', 25_000);

    await settleFreeTrialRequest({
      reservation: reservation({ unmetered: true }),
      outcome: 'completed',
      cost: { tokenMicrousd: 9_000, toolMicrousd: 5_000 },
    });

    expect(executed('update public.free_daily_usage_reservations')[0]?.[1]?.[2]).toBe(5_000);
  });

  it('prices the tokens at the serving route when no measured cost is passed', async () => {
    const model = ANTHROPIC_CHAT_MODEL;
    const usage = { promptTokens: 1_000, completionTokens: 200, totalTokens: 1_200 };
    storedReservation('request-1', 25_000);

    await settleFreeTrialRequest({
      reservation: reservation(),
      outcome: 'completed',
      provider: model.provider,
      model: model.id,
      usage,
    });

    expect(executed('update public.free_daily_usage_reservations')[0]?.[1]?.[2]).toBe(
      Math.min(
        25_000,
        chargeMicrousdForProviderCost(
          Math.ceil(LLMCostCalculator.calculateCostMicrousd(model.provider, model.id, usage)),
        ),
      ),
    );
  });

  it('releases a reservation after a zero-usage failure', async () => {
    storedReservation('request-1', 25_000);

    await settleFreeTrialRequest({ reservation: reservation(), outcome: 'failed' });

    expect(executed('update public.free_daily_usage_reservations')[0]?.[1]).toEqual([
      'user-1',
      'request-1',
      0,
      'failed',
      expect.any(String),
      'failed',
      null,
    ]);
  });

  it('records a cancelled attempt as cancelled and a failed one with its class', async () => {
    storedReservation('request-1', 25_000);
    storedReservation('request-2', 25_000);

    await settleFreeTrialRequest({
      reservation: reservation(),
      outcome: 'cancelled',
      attempt: { outcome: 'cancelled', errorClass: 'aborted' },
    });
    await settleFreeTrialRequest({
      reservation: reservation({ requestId: 'request-2' }),
      outcome: 'failed',
      attempt: { outcome: 'failed', errorClass: 'rate_limit' },
    });

    const updates = executed('update public.free_daily_usage_reservations');
    expect(updates[0]?.[1]?.slice(3)).toEqual(['cancelled', expect.any(String), 'cancelled', null]);
    expect(updates[1]?.[1]?.slice(3)).toEqual([
      'failed',
      expect.any(String),
      'failed',
      'rate_limit',
    ]);
  });

  it('leaves the attempt open when the settlement only pauses the turn', async () => {
    storedReservation('request-1', 25_000);

    await settleFreeTrialRequest({
      reservation: reservation(),
      outcome: 'completed',
      attempt: null,
    });

    expect(executed('update public.free_daily_usage_reservations')[0]?.[1]?.slice(5)).toEqual([
      null,
      null,
    ]);
  });

  it('treats repeated settlement as an idempotent no-op', async () => {
    storedReservation('request-1', 5_000, '2026-07-22T12:01:00.000Z');

    await settleFreeTrialRequest({
      reservation: reservation({ reservedMicrousd: 5_000 }),
      outcome: 'completed',
      cost: { tokenMicrousd: 1_000, toolMicrousd: 0 },
    });

    expect(executed('free_daily_usage_reservations')).toHaveLength(0);
    expect(executed('website_auto_economy_trial_usage')).toHaveLength(0);
  });

  it('records a free-pool turn that reserved nothing without charging it or touching its windows', async () => {
    await settleFreeTrialRequest({
      reservation: reservation({ reservedMicrousd: 0, unmetered: true }),
      outcome: 'completed',
      cost: { tokenMicrousd: 1_000, toolMicrousd: 1_000 },
    });

    expect(db.transaction).not.toHaveBeenCalled();
    const [sql, params] = db.execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('set actual_cost_microusd = 0');
    expect(sql).toContain('reserved_microusd = 0 and settled_at is null');
    expect(params).toEqual(['user-1', 'request-1', 'completed', 'completed', null]);
    expect(executed('website_auto_economy_trial_usage')).toHaveLength(0);
    expect(executed('usage_events')).toHaveLength(0);
  });

  it('logs settlement failures without exposing private policy values', async () => {
    db.transaction.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      settleFreeTrialRequest({
        reservation: reservation({ requestId: 'request-log', reservedMicrousd: 5_000 }),
        outcome: 'failed',
      }),
    ).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', requestId: 'request-log' }),
      'Free-tier usage settlement failed',
    );
  });
});

describe('transferFreeTrialHold', () => {
  const parent: FreeTrialReservation = {
    kind: 'free_trial',
    userId: 'user-1',
    requestId: 'turn-1',
    reservedMicrousd: 10_000,
  };
  const TRANSFER = {
    parent,
    requestId: 'agi.e2b.free.sandbox-1',
    reservedMicrousd: 4_000,
    leaseSeconds: 1_500,
    provider: 'e2b',
    model: 'tpl-1',
  };

  it('moves the amount out of the turn hold onto a reservation of its own', async () => {
    const moved = await transferFreeTrialHold(TRANSFER);

    expect(moved).toEqual({
      kind: 'free_trial',
      userId: 'user-1',
      requestId: 'agi.e2b.free.sandbox-1',
      reservedMicrousd: 4_000,
    });
    const [shrink] = executed('set reserved_microusd = reserved_microusd - $3');
    expect(shrink?.[1]).toEqual(['user-1', 'turn-1', 4_000]);
    expect(shrink?.[0]).toContain('reserved_microusd >= $3');
    const [insert] = executed('insert into public.free_daily_usage_reservations');
    expect(insert?.[1]).toEqual([
      'user-1',
      'agi.e2b.free.sandbox-1',
      4_000,
      1_500,
      'e2b',
      'tpl-1',
      null,
    ]);
  });

  it('moves nothing when the turn hold cannot spare the amount', async () => {
    tx.execute.mockImplementation(async (sql: string) =>
      sql.includes('reserved_microusd - $3') ? 0 : 1,
    );

    await expect(transferFreeTrialHold(TRANSFER)).resolves.toBeNull();
    expect(executed('insert into public.free_daily_usage_reservations')).toHaveLength(0);
  });
});

describe('Free tool spend inside a turn', () => {
  it('holds a paid tool call while the turn reservation still covers it', () => {
    const recorded: number[] = [];
    const spend = createFreeTrialToolSpend({
      reservation: reservation({ reservedMicrousd: 10_000 }),
      spent: () => ({ tokenMicrousd: 4_000, toolMicrousd: 0 }),
      record: (spentMicrousd) => recorded.push(spentMicrousd),
    });

    expect(spend.hold(5_000)).toBe(true);
    expect(spend.hold(1_001)).toBe(false);
    expect(spend.exhausted()).toBe(true);

    spend.settle(5_000, 5_000);
    expect(recorded).toEqual([5_000]);
    expect(spend.hold(1_000)).toBe(true);
  });

  it('reports the most one more hold can take, and that much is admitted', () => {
    const spend = createFreeTrialToolSpend({
      reservation: reservation({ reservedMicrousd: 10_000 }),
      spent: () => ({ tokenMicrousd: 4_001, toolMicrousd: 0 }),
      record: () => undefined,
    });

    const headroom = spend.headroomMicrousd();
    expect(headroom).toBe(10_000 - chargeMicrousdForProviderCost(4_001));
    expect(spend.hold(headroom)).toBe(true);
    expect(spend.headroomMicrousd()).toBe(0);
    expect(spend.hold(chargeMicrousdForProviderCost(1))).toBe(false);
  });

  it('leaves free-pool tokens out of what a tool call is held against', () => {
    const spend = createFreeTrialToolSpend({
      reservation: reservation({ reservedMicrousd: 10_000, unmetered: true }),
      spent: () => ({ tokenMicrousd: 9_999, toolMicrousd: 0 }),
      record: () => undefined,
    });

    expect(spend.hold(10_000)).toBe(true);
  });

  it('counts a scoped call its own spend while holding against the turn', () => {
    const recorded: number[] = [];
    const parent = createFreeTrialToolSpend({
      reservation: reservation({ reservedMicrousd: 10_000 }),
      spent: () => ({ tokenMicrousd: 0, toolMicrousd: 0 }),
      record: (spentMicrousd) => recorded.push(spentMicrousd),
    });
    const call = scopeFreeTrialToolSpend(parent);

    expect(call.hold(3_000)).toBe(true);
    call.settle(3_000, 2_500);

    expect(call.spentMicrousd()).toBe(2_500);
    expect(recorded).toEqual([2_500]);
    expect(call.exhausted()).toBe(false);
  });

  it('offers a paid tool to Free only when one call fits the smallest window', () => {
    expect(fitsFreeTrialWindow(FIVE_HOUR_BUDGET)).toBe(true);
    expect(fitsFreeTrialWindow(FIVE_HOUR_BUDGET + 1)).toBe(false);
  });
});

describe('the reset a refused Free turn reports', () => {
  it('counts whole seconds to the reset, and at least one', () => {
    const now = Date.parse('2026-07-22T12:00:00.000Z');
    expect(freeTrialRetryAfterSeconds('2026-07-22T12:00:10.200Z', now)).toBe(11);
    expect(freeTrialRetryAfterSeconds('2026-07-22T11:59:00.000Z', now)).toBe(1);
    expect(freeTrialRetryAfterSeconds(null, now)).toBeUndefined();
    expect(freeTrialRetryAfterSeconds('not-a-date', now)).toBeUndefined();
  });

  it('reads the binding window reset under the owner scope', async () => {
    useWindows({ fiveHour: FIVE_HOUR_BUDGET, weekly: FIVE_HOUR_BUDGET, monthly: FIVE_HOUR_BUDGET });

    await expect(freeTrialResetAt('user-1')).resolves.toBe('2026-07-22T17:00:00.000Z');
    expect(scopes).toContainEqual({ userId: 'user-1', organizationId: null });
  });

  it('reports no reset rather than failing when the windows cannot be read', async () => {
    db.query.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(freeTrialResetAt('user-1')).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('releaseExpiredFreeTrialReservations', () => {
  function sweepDb(rows: Array<Record<string, unknown>>) {
    const query = vi.fn(async (_sql: string, _params: unknown[]) => rows);
    const execute = vi.fn(async (_sql: string, _params: unknown[]) => undefined);
    const tx = { query, execute };
    const db = { transaction: async (work: (client: typeof tx) => unknown) => work(tx) };
    return { db: db as never, query, execute };
  }

  it('releases only unsettled reservations past their lease, at no charge to the user', async () => {
    const { db: serviceDb, query, execute } = sweepDb([]);

    await releaseExpiredFreeTrialReservations(serviceDb, 500);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('where settled_at is null');
    expect(sql).toContain('lease_expires_at is null or lease_expires_at <= now()');
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain('set actual_cost_microusd = 0');
    expect(sql).toContain("outcome = 'failed'");
    expect(sql).toContain('and reservation.settled_at is null');
    expect(params).toEqual([500]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('records one settled event per released reservation in the same transaction', async () => {
    const { db: serviceDb, execute } = sweepDb([
      { user_id: 'user-1', request_id: 'request-1', reserved_microusd: 10 },
      { user_id: 'user-2', request_id: 'request-2', reserved_microusd: 20 },
    ]);

    await releaseExpiredFreeTrialReservations(serviceDb, 500);

    const [sql, params] = execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("'leaseExpired', true");
    expect(sql).toContain('on conflict do nothing');
    expect(params).toEqual([
      ['user-1', 'user-2'],
      ['request-1', 'request-2'],
    ]);
  });

  it('records each absorbed reservation once as undelivered COGS', async () => {
    const { db: serviceDb } = sweepDb([
      {
        user_id: 'user-1',
        request_id: 'request-1',
        reserved_microusd: '4350',
        provider: 'openrouter',
        model: 'free-route-model',
      },
      {
        user_id: 'user-2',
        request_id: 'request-2',
        reserved_microusd: 1_000,
        provider: null,
        model: null,
      },
    ]);

    await expect(releaseExpiredFreeTrialReservations(serviceDb, 500)).resolves.toEqual({
      released: 2,
      absorbedMicrousd: 5_350,
    });

    expect(recordSettledProviderCost).toHaveBeenCalledTimes(2);
    expect(recordSettledProviderCost).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      organizationId: null,
      provider: 'openrouter',
      model: 'free-route-model',
      actualCostCents: ledgerCentsFromMicrousd(4_350),
      providerEstimatedCostMicrousd: 4_350,
      sourceRef: 'free_trial_lease_expired:user-1:request-1',
      taskOutcome: 'undelivered',
      taskRef: 'request-1',
      usage: { type: 'free_trial_lease_expired', reservedMicrousd: 4_350 },
      db: serviceDb,
    });
    expect(recordSettledProviderCost).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ provider: 'unknown', model: null, userId: 'user-2' }),
    );
  });

  it('closes an expired free-pool row without an event or absorbed cost', async () => {
    const { db: serviceDb, execute } = sweepDb([
      { user_id: 'user-1', request_id: 'request-1', reserved_microusd: 0 },
      { user_id: 'user-2', request_id: 'request-2', reserved_microusd: 20 },
    ]);

    await expect(releaseExpiredFreeTrialReservations(serviceDb, 500)).resolves.toEqual({
      released: 2,
      absorbedMicrousd: 20,
    });

    const [, params] = execute.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([['user-2'], ['request-2']]);
    expect(recordSettledProviderCost).toHaveBeenCalledTimes(1);
    expect(recordSettledProviderCost).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', taskRef: 'request-2' }),
    );
  });

  it('records nothing when no reservation has expired', async () => {
    await expect(releaseExpiredFreeTrialReservations(sweepDb([]).db, 500)).resolves.toEqual({
      released: 0,
      absorbedMicrousd: 0,
    });
    expect(recordSettledProviderCost).not.toHaveBeenCalled();
  });
});

describe('Free output budgeting', () => {
  it('does not cap the output of an unmetered free-pool reservation', () => {
    expect(
      fitFreeTrialOutputBudget({
        reservation: {
          kind: 'free_trial',
          userId: 'user-1',
          requestId: 'request-unmetered',
          reservedMicrousd: Number.MAX_SAFE_INTEGER,
          unmetered: true,
        },
        provider: FREE_CHAT_MODEL.provider,
        model: FREE_CHAT_MODEL.id,
        estimatedInputTokens: 1_000,
        requestedMaxOutputTokens: 8_192,
      }),
    ).toEqual({ ok: true, maxOutputTokens: 8_192 });
  });

  it('caps one provider response to the private amount reserved for it', () => {
    const result = fitFreeTrialOutputBudget({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-budgeted',
        reservedMicrousd: 5_000,
      },
      provider: FREE_CHAT_MODEL.provider,
      model: FREE_CHAT_MODEL.id,
      estimatedInputTokens: 1_000,
      requestedMaxOutputTokens: 100_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.maxOutputTokens).toBeLessThan(100_000);
  });

  it('does not increase a caller output cap that already fits', () => {
    expect(
      fitFreeTrialOutputBudget({
        reservation: {
          kind: 'free_trial',
          userId: 'user-1',
          requestId: 'request-small',
          reservedMicrousd: 5_000,
        },
        provider: 'anthropic',
        model: ANTHROPIC_CHAT_MODEL.id,
        estimatedInputTokens: 100,
        requestedMaxOutputTokens: 32,
      }),
    ).toEqual({ ok: true, maxOutputTokens: 32 });
  });

  it('budgets the next provider call separately from prior subthreshold spend', () => {
    const subthresholdTokens = Math.floor(TIERED_MODEL.firstTier.thresholdTokens * 0.75);
    const call = (completionTokens: number, promptTokens = subthresholdTokens) =>
      LLMCostCalculator.calculateCostMicrousd(TIERED_MODEL.provider, TIERED_MODEL.id, {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      });
    const priorCostMicrousd = call(0);
    const reservedMicrousd = chargeMicrousdForProviderCost(priorCostMicrousd + call(1));
    expect(chargeMicrousdForProviderCost(call(1, subthresholdTokens * 2))).toBeGreaterThan(
      reservedMicrousd,
    );
    const budget = (prior: number) =>
      fitFreeTrialOutputBudget({
        reservation: {
          kind: 'free_trial',
          userId: 'user-1',
          requestId: 'request-separated-calls',
          reservedMicrousd,
        },
        provider: TIERED_MODEL.provider,
        model: TIERED_MODEL.id,
        estimatedInputTokens: subthresholdTokens,
        requestedMaxOutputTokens: 1,
        priorCostMicrousd: prior,
      });

    expect(budget(priorCostMicrousd)).toEqual({ ok: true, maxOutputTokens: 1 });
    expect(budget(reservedMicrousd)).toEqual({ ok: false, code: 'budget_reached' });
  });

  it('uses a byte upper bound for text and the per-image ceiling for images', () => {
    const textOnly = estimateConservativeFreeInputTokens({
      model: FREE_CHAT_MODEL.id,
      messages: [{ role: 'user', content: '🙂' }],
    });
    const withImage = estimateConservativeFreeInputTokens({
      model: FREE_CHAT_MODEL.id,
      messages: [
        {
          role: 'user',
          content: '',
          multimodal_content: [
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
          ],
        },
      ],
    });

    expect(textOnly).toBeGreaterThanOrEqual(new TextEncoder().encode('🙂').byteLength);
    expect(withImage).toBeGreaterThanOrEqual(
      DOCUMENTED_IMAGE_TOKEN_MAXIMUM[FREE_CHAT_MODEL.developer] ?? Number.POSITIVE_INFINITY,
    );
    expect(withImage).toBeLessThan(FREE_CHAT_MODEL.contextWindow ?? Number.POSITIVE_INFINITY);
  });

  it('applies the private cap to the provider request and disables cache writes', () => {
    const request = {
      model: FREE_CHAT_MODEL.id,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 100_000,
      usePromptCache: true,
    };

    const result = applyFreeTrialProviderBudget({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-provider',
        reservedMicrousd: 5_000,
      },
      provider: FREE_CHAT_MODEL.provider,
      request,
    });

    expect(result.ok).toBe(true);
    expect(request.max_tokens).toBeLessThan(100_000);
    expect(request.usePromptCache).toBe(false);
  });
});

describe('Free picture budgeting', () => {
  const { fiveHourBudgetMicrousd } = FREE_TRIAL_INTERNAL_USAGE_POLICY;
  const reservation = (reservedMicrousd: number): FreeTrialReservation => ({
    kind: 'free_trial',
    userId: 'user-1',
    requestId: 'request-picture',
    reservedMicrousd,
  });
  const chargedCost = (
    model: (typeof FREE_PICTURE_MODELS)[number],
    promptTokens: number,
    completionTokens: number,
  ): number =>
    chargeMicrousdForProviderCost(
      LLMCostCalculator.calculateCostMicrousd(model.provider, model.id, {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      }),
    );
  const estimate = (model: { id: string }, messages: unknown): number =>
    estimateConservativeFreeInputTokens({ model: model.id, messages });
  const freeModels = FREE_PICTURE_MODELS.map((model) => [model.name, model] as const);

  it('bounds every Free model that takes pictures at no less than its developer documents', () => {
    expect(FREE_PICTURE_MODELS.length).toBeGreaterThan(0);
    for (const model of FREE_PICTURE_MODELS) {
      const imageBound = model.imageInput?.maxInputTokensPerImage;
      const pageImageBound = model.documentInput?.maxInputTokensPerPageImage ?? imageBound;
      expect(imageBound).toBeGreaterThanOrEqual(
        DOCUMENTED_IMAGE_TOKEN_MAXIMUM[model.developer] ?? Number.POSITIVE_INFINITY,
      );
      if (!model.inputModalities?.includes('pdf')) continue;
      expect(pageImageBound).toBeGreaterThanOrEqual(
        DOCUMENTED_PAGE_IMAGE_TOKEN_MAXIMUM[model.developer] ?? Number.POSITIVE_INFINITY,
      );
    }
  });

  it.each(freeModels)(
    'counts a picture on %s as the most its developer bills for one, whatever its encoded size',
    (_name, model) => {
      const maximum = DOCUMENTED_IMAGE_TOKEN_MAXIMUM[model.developer] ?? Number.POSITIVE_INFINITY;
      const photo = estimate(model, pictureMessages(1));
      const largest = estimate(model, pictureMessages(1, CHAT_MODEL_IMAGE_ENVELOPE.maxBase64Bytes));

      expect(photo - estimate(model, pictureMessages(0))).toBeGreaterThanOrEqual(maximum);
      expect(largest).toBe(photo);
      expect(photo).toBeLessThan(PHOTO_BASE64_LENGTH);
    },
  );

  it.each(freeModels)(
    'admits a picture on %s with most of the five-hour allowance left and reserves its whole cost',
    (_name, model) => {
      for (const remaining of [
        fiveHourBudgetMicrousd - 6_400,
        Math.floor(fiveHourBudgetMicrousd / 10),
      ]) {
        const request = {
          model: model.id,
          messages: pictureMessages(1),
          max_tokens: resolveMaxOutputTokens(model.id),
          usePromptCache: true,
        };

        const result = applyFreeTrialProviderBudget({
          reservation: reservation(remaining),
          provider: model.provider,
          request,
        });

        expect(result.ok).toBe(true);
        expect(
          chargedCost(model, estimate(model, request.messages), request.max_tokens),
        ).toBeLessThanOrEqual(remaining);
      }
    },
  );

  it.each(freeModels)(
    'refuses a picture on %s when the allowance left is below what it can cost',
    (_name, model) => {
      const messages = pictureMessages(1);
      const leastCost = chargedCost(model, estimate(model, messages), 1);
      const documentedLeastCost = chargedCost(
        model,
        estimate(model, pictureMessages(0)) +
          (DOCUMENTED_IMAGE_TOKEN_MAXIMUM[model.developer] ?? Number.POSITIVE_INFINITY),
        1,
      );

      expect(leastCost).toBeGreaterThanOrEqual(documentedLeastCost);
      expect(
        applyFreeTrialProviderBudget({
          reservation: reservation(leastCost - 1),
          provider: model.provider,
          request: { model: model.id, messages, max_tokens: resolveMaxOutputTokens(model.id) },
        }),
      ).toEqual({ ok: false, code: 'budget_reached' });
      expect(
        applyFreeTrialProviderBudget({
          reservation: reservation(leastCost),
          provider: model.provider,
          request: { model: model.id, messages, max_tokens: resolveMaxOutputTokens(model.id) },
        }).ok,
      ).toBe(true);
    },
  );

  it.each(freeModels)('adds up every picture in one message on %s', (_name, model) => {
    const maximum = DOCUMENTED_IMAGE_TOKEN_MAXIMUM[model.developer] ?? Number.POSITIVE_INFINITY;
    const text = estimate(model, pictureMessages(0));
    const one = estimate(model, pictureMessages(1)) - text;
    const four = estimate(model, pictureMessages(4)) - text;

    expect(four).toBe(4 * one);
    expect(four).toBeGreaterThanOrEqual(4 * maximum);
  });

  it.each(freeModels)('leaves a text-only estimate on %s at its byte count', (_name, model) => {
    const messages = [{ role: 'user', content: 'Translate that into Spanish. 🙂' }];

    expect(estimate(model, messages)).toBe(
      new TextEncoder().encode(JSON.stringify({ messages })).byteLength + 64,
    );
  });

  it('keeps the encoded-size bound for a model with no per-image bound', () => {
    expect(estimate(UNDOCUMENTED_IMAGE_MODEL, pictureMessages(1))).toBeGreaterThan(
      PHOTO_BASE64_LENGTH,
    );
  });

  const pdfModels = FREE_PDF_MODELS.map((model) => [model.name, model] as const);

  it('has a Free model that reads PDFs', () => {
    expect(FREE_PDF_MODELS.length).toBeGreaterThan(0);
  });

  it.each(pdfModels)(
    'counts a PDF on %s by its pages and extracted text, not its encoded bytes',
    (_name, model) => {
      const pages =
        PDF_PAGE_COUNT *
        (DOCUMENTED_PAGE_IMAGE_TOKEN_MAXIMUM[model.developer] ?? Number.POSITIVE_INFINITY);
      const document = estimate(model, pdfMessages(true));

      expect(document).toBeGreaterThanOrEqual(
        pages + new TextEncoder().encode(PDF_EXTRACTED_TEXT).byteLength,
      );
      expect(document).toBeLessThan(PDF_BASE64_LENGTH);
    },
  );

  it.each(pdfModels)(
    'admits a PDF on %s with most of the five-hour allowance left and reserves its whole cost',
    (_name, model) => {
      const request = {
        model: model.id,
        messages: pdfMessages(true),
        max_tokens: resolveMaxOutputTokens(model.id),
      };
      const remaining = fiveHourBudgetMicrousd - 6_400;

      const result = applyFreeTrialProviderBudget({
        reservation: reservation(remaining),
        provider: model.provider,
        request,
      });

      expect(result.ok).toBe(true);
      expect(
        chargedCost(model, estimate(model, request.messages), request.max_tokens),
      ).toBeLessThanOrEqual(remaining);
    },
  );

  it.each(pdfModels)(
    'refuses a PDF on %s when the allowance left is below what it can cost',
    (_name, model) => {
      const messages = pdfMessages(true);
      const leastCost = chargedCost(model, estimate(model, messages), 1);

      expect(
        applyFreeTrialProviderBudget({
          reservation: reservation(leastCost - 1),
          provider: model.provider,
          request: { model: model.id, messages, max_tokens: resolveMaxOutputTokens(model.id) },
        }),
      ).toEqual({ ok: false, code: 'budget_reached' });
    },
  );

  it.each(pdfModels)(
    'keeps the encoded-size bound on %s when the extracted text is incomplete',
    (_name, model) => {
      expect(estimate(model, pdfMessages(false))).toBeGreaterThan(PDF_BASE64_LENGTH);
    },
  );
});
