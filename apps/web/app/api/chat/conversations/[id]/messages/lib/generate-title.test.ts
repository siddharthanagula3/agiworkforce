import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRegistryRoute,
  listCanonicalModels,
  listManagedRoutesForModel,
} from '@agiworkforce/types';

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: Promise<unknown>) => fn };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const SELECTED_ROUTE = {
  status: 'selected' as const,
  requestedSelection: 'auto',
  requestedProfile: null,
  effectiveProfile: 'balanced',
  taskType: 'simple_chat',
  modelKey: 'test.model',
  provider: 'anthropic',
  providerModelId: 'test-provider-model-id',
  routeId: 'test-route',
  harnessId: 'test/chat',
  fallbacks: [],
  reason: 'preferred_slot',
};

const resolveAutoRouteMock = vi.fn(() => SELECTED_ROUTE);
vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/routing')>();
  return { ...actual, resolveAutoRoute: () => resolveAutoRouteMock() };
});

const drainToLlmResponseMock = vi.fn();
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: (...args: unknown[]) => drainToLlmResponseMock(...args),
}));

const buildServerProviderAdapterMock = vi.fn((_provider: string) => ({
  stream: () => (async function* () {})(),
}));

const recordSettledProviderCostMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordSettledProviderCost: (...args: unknown[]) => recordSettledProviderCostMock(...args),
  getOrganizationMonthToDateSpendCents: vi.fn(async () => 0),
}));

const reserveMock = vi.fn(async (..._args: unknown[]) => ({
  db: {},
  userId: 'user_1',
  idempotencyKey: 'title:conv_1',
  requestHash: 'hash',
  leaseToken: 'lease',
  estimatedCostMicrousd: 200,
  estimatedCostCents: 1,
  quotaFeature: 'conversation_title',
}));
const finalizeMock = vi.fn(async (..._args: unknown[]) => ({
  requestStatus: 'completed',
  operationResult: 'finalized',
  settlementStatus: 'succeeded',
  actualCostCents: 1,
}));
const markStartedMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  reserveManagedUsageRequest: (...args: unknown[]) => reserveMock(...args),
  finalizeManagedUsageRequest: (...args: unknown[]) => finalizeMock(...args),
  markManagedUsageProviderStarted: (...args: unknown[]) => markStartedMock(...args),
  fingerprintManagedUsageRequest: () => 'hash',
}));

const resolveEntitledPlanTierMock = vi.fn(async (..._args: unknown[]) => 'pro');
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/entitlement-resolution')>()),
  resolveEntitledPlanTier: (...args: unknown[]) => resolveEntitledPlanTierMock(...args),
}));

const beginFreeTrialRequestMock = vi.fn();
const settleFreeTrialRequestMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/services/free-trial-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/free-trial-service')>()),
  beginFreeTrialRequest: (...args: unknown[]) => beginFreeTrialRequestMock(...args),
  settleFreeTrialRequest: (...args: unknown[]) => settleFreeTrialRequestMock(...args),
}));

vi.mock('@/lib/services/provider-adapter-service', () => ({
  listAvailableManagedProviderIds: vi.fn(() => new Set<string>()),
  buildServerProviderAdapter: (provider: string) => buildServerProviderAdapterMock(provider),
  toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
  buildProtocolRouteAdapter: vi.fn(),
}));

class FakeRedis {
  store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }
  async set(key: string, value: unknown): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }
}

let redisClient: FakeRedis | null = null;
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () =>
    redisClient ? createUpstashKeyValueStore(redisClient as unknown as UpstashRedisLike) : null,
}));

import { createUpstashKeyValueStore, type UpstashRedisLike } from '@agiworkforce/key-value';

import {
  scheduleConversationTitleGeneration,
  type ScheduleTitleGenerationInput,
} from './generate-title';

const CONVERSATION_ID = 'conv_1';
const USER_ID = 'user_1';

function fakeDb(overrides: { isTemporary?: boolean } = {}) {
  const executed: unknown[][] = [];
  return {
    query: vi.fn(async () => [{ is_temporary: overrides.isTemporary ?? false }]),
    execute: vi.fn(async (_sql: string, params?: unknown[]) => {
      executed.push(params ?? []);
      return 1;
    }),
    executed,
  };
}

function scheduleInput(
  db: ReturnType<typeof fakeDb>,
  overrides: Partial<ScheduleTitleGenerationInput> = {},
): ScheduleTitleGenerationInput {
  return {
    db: db as unknown as ScheduleTitleGenerationInput['db'],
    conversationId: CONVERSATION_ID,
    userId: USER_ID,
    organizationId: null,
    content: 'help me refactor the authentication module please',
    expectedCurrentTitle: 'help me refactor the authentication module pl...',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  redisClient = new FakeRedis();
  resolveEntitledPlanTierMock.mockResolvedValue('pro');
  resolveAutoRouteMock.mockReturnValue(SELECTED_ROUTE);
  drainToLlmResponseMock.mockResolvedValue({
    model: 'test.model',
    content: 'Refactor auth module',
    promptTokens: 12,
    completionTokens: 4,
    totalTokens: 16,
  });
});

describe('exact-response cache integration', () => {
  it('maps a selected OpenRouter route to the dispatch adapter key', async () => {
    const managedOpenRouterRoute = listCanonicalModels()
      .flatMap((model) => listManagedRoutesForModel(model.id))
      .find((route) => route.provider === 'open_router');
    if (!managedOpenRouterRoute) throw new Error('Managed OpenRouter route fixture is missing');
    const registryRoute = getRegistryRoute(managedOpenRouterRoute.routeId);
    if (!registryRoute) throw new Error('Managed OpenRouter registry route fixture is missing');

    resolveAutoRouteMock.mockReturnValueOnce({
      ...SELECTED_ROUTE,
      modelKey: registryRoute.modelKey,
      provider: registryRoute.provider,
      providerModelId: registryRoute.providerModelId,
      routeId: managedOpenRouterRoute.routeId,
      harnessId: registryRoute.harnessId,
    });

    scheduleConversationTitleGeneration(scheduleInput(fakeDb()));
    await new Promise((resolve) => setImmediate(resolve));

    expect(buildServerProviderAdapterMock).toHaveBeenCalledWith('openrouter');
  });

  it('calls the provider on the first request and reuses the cached title on an identical second request', async () => {
    const dbFirst = fakeDb();
    scheduleConversationTitleGeneration(scheduleInput(dbFirst));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(1);
    expect(dbFirst.executed[0]?.[0]).toBe('Refactor auth module');

    const dbSecond = fakeDb();
    scheduleConversationTitleGeneration(scheduleInput(dbSecond));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(1);
    expect(dbSecond.executed[0]?.[0]).toBe('Refactor auth module');
  });

  it('reserves and finalizes exactly once on a cache miss and spends nothing on the cache hit', async () => {
    const dbFirst = fakeDb();
    scheduleConversationTitleGeneration(scheduleInput(dbFirst));
    await new Promise((resolve) => setImmediate(resolve));
    expect(reserveMock).toHaveBeenCalledTimes(1);
    expect(reserveMock.mock.calls[0]?.[0]).toMatchObject({
      userId: USER_ID,
      idempotencyKey: `title:${CONVERSATION_ID}`,
      quotaFeature: 'conversation_title',
      planTier: 'pro',
      isFlagship: false,
    });
    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock.mock.calls[0]?.[0]).toMatchObject({ outcome: 'completed' });
    expect(recordSettledProviderCostMock).not.toHaveBeenCalled();

    const dbSecond = fakeDb();
    scheduleConversationTitleGeneration(scheduleInput(dbSecond));
    await new Promise((resolve) => setImmediate(resolve));
    expect(reserveMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the truncated title and never calls the provider when the reservation is refused', async () => {
    reserveMock.mockRejectedValueOnce(new Error('Usage budget exhausted'));
    const db = fakeDb();
    scheduleConversationTitleGeneration(scheduleInput(db));
    await new Promise((resolve) => setImmediate(resolve));

    expect(drainToLlmResponseMock).not.toHaveBeenCalled();
    expect(finalizeMock).not.toHaveBeenCalled();
    expect(db.executed).toHaveLength(0);
  });

  it('releases the reservation when the provider call fails', async () => {
    drainToLlmResponseMock.mockRejectedValueOnce(new Error('upstream anthropic'));
    const db = fakeDb();
    scheduleConversationTitleGeneration(scheduleInput(db));
    await new Promise((resolve) => setImmediate(resolve));

    expect(reserveMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock.mock.calls[0]?.[0]).toMatchObject({
      outcome: 'failed',
      actualCostCents: 0,
    });
    expect(db.executed).toHaveLength(0);
  });

  it('bypasses the cache for a temporary conversation and never reads or writes a cached entry', async () => {
    const db = fakeDb({ isTemporary: true });
    scheduleConversationTitleGeneration(scheduleInput(db));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(1);
    expect(redisClient!.store.size).toBe(0);

    const dbSecond = fakeDb({ isTemporary: true });
    scheduleConversationTitleGeneration(scheduleInput(dbSecond));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(2);
  });

  it('keeps two different users on two different first messages from colliding', async () => {
    const dbUserOne = fakeDb();
    scheduleConversationTitleGeneration(scheduleInput(dbUserOne, { userId: 'user_a' }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(1);

    const dbUserTwo = fakeDb();
    scheduleConversationTitleGeneration(scheduleInput(dbUserTwo, { userId: 'user_b' }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(2);
  });
});

describe('free accounts on the Free usage windows', () => {
  const FREE_RESERVATION = {
    kind: 'free_trial' as const,
    userId: USER_ID,
    requestId: `title:${CONVERSATION_ID}`,
    reservedMicrousd: 4_000,
  };

  beforeEach(() => {
    resolveEntitledPlanTierMock.mockResolvedValue('free');
  });

  it('reserves the call on the Free windows and settles its measured cost there', async () => {
    beginFreeTrialRequestMock.mockResolvedValue({ ok: true, reservation: FREE_RESERVATION });
    const db = fakeDb();

    scheduleConversationTitleGeneration(scheduleInput(db));
    await new Promise((resolve) => setImmediate(resolve));

    expect(reserveMock).not.toHaveBeenCalled();
    expect(beginFreeTrialRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        requestId: `title:${CONVERSATION_ID}`,
        leaseSeconds: 60,
        provider: SELECTED_ROUTE.provider,
        model: SELECTED_ROUTE.modelKey,
        estimatedMicrousd: expect.any(Number),
      }),
    );
    expect(settleFreeTrialRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reservation: FREE_RESERVATION,
        outcome: 'completed',
        provider: SELECTED_ROUTE.provider,
        model: SELECTED_ROUTE.modelKey,
        cost: { tokenMicrousd: expect.any(Number), toolMicrousd: 0 },
      }),
    );
    expect(finalizeMock).not.toHaveBeenCalled();
    expect(db.executed[0]?.[0]).toBe('Refactor auth module');
  });

  it('keeps the truncated title and never calls the provider when the Free windows are spent', async () => {
    beginFreeTrialRequestMock.mockResolvedValue({
      ok: false,
      code: 'budget_reached',
      resetAt: '2026-09-27T15:00:00.000Z',
    });
    const db = fakeDb();

    scheduleConversationTitleGeneration(scheduleInput(db));
    await new Promise((resolve) => setImmediate(resolve));

    expect(drainToLlmResponseMock).not.toHaveBeenCalled();
    expect(settleFreeTrialRequestMock).not.toHaveBeenCalled();
    expect(db.executed).toHaveLength(0);
  });

  it('releases the Free reservation at no charge when the provider call fails', async () => {
    beginFreeTrialRequestMock.mockResolvedValue({ ok: true, reservation: FREE_RESERVATION });
    drainToLlmResponseMock.mockRejectedValueOnce(new Error('upstream anthropic'));
    const db = fakeDb();

    scheduleConversationTitleGeneration(scheduleInput(db));
    await new Promise((resolve) => setImmediate(resolve));

    expect(settleFreeTrialRequestMock).toHaveBeenCalledTimes(1);
    expect(settleFreeTrialRequestMock).toHaveBeenCalledWith({
      reservation: FREE_RESERVATION,
      outcome: 'failed',
    });
    expect(db.executed).toHaveLength(0);
  });
});
