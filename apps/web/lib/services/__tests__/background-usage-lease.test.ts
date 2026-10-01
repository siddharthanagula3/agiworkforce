import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MICROUSD_PER_CREDIT, requireProviderDefaultModel } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/services/free-trial-service');
type ScanModule1 = typeof import('@/lib/services/managed-usage-request-service');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  settle: vi.fn(),
  reserve: vi.fn(),
  started: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock('@/lib/services/free-trial-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  beginFreeTrialRequest: mocks.begin,
  settleFreeTrialRequest: mocks.settle,
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  reserveManagedUsageRequest: mocks.reserve,
  markManagedUsageProviderStarted: mocks.started,
  finalizeManagedUsageRequest: mocks.finalize,
}));

import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import { reserveBackgroundUsage } from '../background-usage-lease';

const MODEL = requireProviderDefaultModel('openai');
const DB = { query: vi.fn() };
const TITLE_USAGE = { promptTokens: 300, completionTokens: 20, totalTokens: 320 };

const reservation = {
  db: DB,
  userId: 'user-1',
  idempotencyKey: 'title:conversation-1',
  requestHash: 'hash-1',
  leaseToken: 'lease-1',
  estimatedCostMicrousd: 10_000,
  estimatedCostCents: 1,
};

function lease(planTier: string) {
  return reserveBackgroundUsage({
    db: DB as never,
    userId: 'user-1',
    organizationId: null,
    planTier,
    idempotencyKey: 'title:conversation-1',
    requestHash: 'hash-1',
    provider: 'openai',
    model: MODEL,
    estimatedPromptTokens: 300,
    maxOutputTokens: 40,
    leaseSeconds: 60,
    quotaFeature: 'conversation_title',
  });
}

beforeEach(() => {
  mocks.reserve.mockResolvedValue(reservation);
  mocks.started.mockResolvedValue(undefined);
  mocks.finalize.mockResolvedValue({ requestStatus: 'completed' });
  mocks.begin.mockResolvedValue({ ok: true, reservation: { id: 'free-reservation-1' } });
  mocks.settle.mockResolvedValue(undefined);
});

describe('reserveBackgroundUsage on a paid plan', () => {
  it('reserves the call against the plan windows for its quota feature', async () => {
    await lease('pro');

    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        db: DB,
        userId: 'user-1',
        idempotencyKey: 'title:conversation-1',
        provider: 'openai',
        model: MODEL,
        planTier: 'pro',
        isFlagship: false,
        quotaFeature: 'conversation_title',
        estimatedCostCents: LLMCostCalculator.estimateCost('openai', MODEL, 300, 40),
      }),
    );
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it('bills a sub-cent call at what it cost, not a whole ledger cent', async () => {
    const usage = await lease('pro');

    await usage.providerStarted();
    await usage.completed({
      provider: 'openai',
      model: MODEL,
      usage: TITLE_USAGE,
      record: { reason: 'title_generated' },
    });

    const costMicrousd = LLMCostCalculator.calculateCostMicrousd('openai', MODEL, TITLE_USAGE);
    expect(costMicrousd).toBeGreaterThan(0);
    expect(costMicrousd).toBeLessThan(MICROUSD_PER_CREDIT * 2);
    expect(mocks.started).toHaveBeenCalledWith(reservation);
    expect(mocks.finalize).toHaveBeenCalledWith({
      ...reservation,
      outcome: 'completed',
      actualCostMicrousd: costMicrousd,
      usage: { reason: 'title_generated' },
    });
    expect(mocks.finalize.mock.calls[0]![0]).not.toHaveProperty('actualCostCents');
  });

  it('prices the route that served the call', async () => {
    const usage = await lease('pro');

    await usage.completed({
      provider: 'openai',
      model: MODEL,
      routeId: 'openai-direct',
      usage: TITLE_USAGE,
      record: {},
    });

    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCostMicrousd: LLMCostCalculator.calculateCostMicrousd(
          'openai',
          MODEL,
          TITLE_USAGE,
          undefined,
          'openai-direct',
        ),
      }),
    );
  });

  it('releases a failed call at no charge', async () => {
    const usage = await lease('pro');

    await usage.failed({ reason: 'provider_error' });

    expect(mocks.finalize).toHaveBeenCalledWith({
      ...reservation,
      outcome: 'failed',
      actualCostCents: 0,
      usage: { reason: 'provider_error' },
    });
  });
});

describe('reserveBackgroundUsage on Free', () => {
  it('holds the estimated cost in microUSD against the Free windows', async () => {
    await lease('free');

    expect(mocks.begin).toHaveBeenCalledWith({
      userId: 'user-1',
      requestId: 'title:conversation-1',
      estimatedMicrousd: LLMCostCalculator.calculateCostMicrousd('openai', MODEL, {
        promptTokens: 300,
        completionTokens: 40,
        totalTokens: 340,
      }),
      leaseSeconds: 60,
      provider: 'openai',
      model: MODEL,
    });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('refuses a call the Free windows cannot cover', async () => {
    mocks.begin.mockResolvedValue({ ok: false });

    const refused = lease('free');

    await expect(refused).rejects.toBeInstanceOf(ManagedUsageRequestError);
    await expect(refused).rejects.toMatchObject({
      status: 429,
      code: 'free_trial_token_budget_reached',
    });
  });

  it('settles the Free window at the token cost of the call', async () => {
    const usage = await lease('free');

    await usage.providerStarted();
    await usage.completed({ provider: 'openai', model: MODEL, usage: TITLE_USAGE, record: {} });

    expect(mocks.settle).toHaveBeenCalledWith({
      reservation: { id: 'free-reservation-1' },
      outcome: 'completed',
      provider: 'openai',
      model: MODEL,
      usage: TITLE_USAGE,
      cost: {
        tokenMicrousd: LLMCostCalculator.calculateCostMicrousd('openai', MODEL, TITLE_USAGE),
        toolMicrousd: 0,
      },
    });
    expect(mocks.started).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('releases the Free hold when the call fails', async () => {
    const usage = await lease('free');

    await usage.failed({ reason: 'provider_error' });

    expect(mocks.settle).toHaveBeenCalledWith({
      reservation: { id: 'free-reservation-1' },
      outcome: 'failed',
    });
  });
});
