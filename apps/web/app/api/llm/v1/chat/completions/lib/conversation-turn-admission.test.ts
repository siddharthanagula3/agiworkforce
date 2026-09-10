import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { requireProviderDefaultModel } from '@agiworkforce/types';

const MINIMAX_MODEL_ID = requireProviderDefaultModel('minimax');
const USER_ID = 'user-1';
const CONVERSATION_ID = '0190a000-0000-7000-8000-0000000000ab';
const RENDEZVOUS_TIMEOUT_MS = 25;
const REQUIRED_ARRIVALS = 2;
const SUCCESS_STATUS = 200;
const CONFLICT_STATUS = 409;

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
  acquireManagedTurnSlot: vi.fn(async () => ({
    admitted: true,
    limit: null,
    active: 0,
    slot: { release: async () => {} },
  })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/error-handler', () => ({
  withErrorHandler: <T extends (...args: never[]) => unknown>(handler: T) => handler,
}));
vi.mock('@/lib/model-tiers', () => ({ canAccessModel: () => true }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/prompt-cache-helper', () => ({
  calculateCacheSavings: vi.fn(() => ({
    tokensSavedByCache: 0,
    savedCostCents: 0,
    cacheWriteCostCents: 0,
  })),
  logCacheAnalytics: vi.fn(),
}));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  getCorsHeaders: vi.fn().mockReturnValue({}),
  getSecurityHeaders: vi.fn().mockReturnValue({}),
  withCorsRoute: (handler: (...args: unknown[]) => unknown) => handler,
}));
vi.mock('@shared/utils/env', () => ({
  requireEnv: vi.fn((key: string) => `mock-${key}`),
  getOptionalEnv: vi.fn((key: string) => `mock-${key}`),
}));
vi.mock('@agiworkforce/providers-minimax', () => ({
  createMinimaxAdapter: vi.fn(() => ({
    id: 'minimax',
    label: 'MiniMax',
    auth: [],
    config: {},
    async catalog() {
      return [];
    },
    async *stream() {
      yield { type: 'stop', reason: 'end_turn' };
    },
  })),
}));

const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));
vi.mock('@/services/neon-db', () => ({ createNeonServerClient: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/neon-db', () => ({
  getUserClient: vi.fn().mockReturnValue({}),
  getServiceClient: vi.fn(() => ({})),
}));

const managedUsageMocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  providerStarted: vi.fn(() => Promise.resolve()),
  finalize: vi.fn(() =>
    Promise.resolve({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 4,
    }),
  ),
  delivered: vi.fn(() => Promise.resolve()),
}));
const rlsMocks = vi.hoisted(() => ({ getUserScopedDb: vi.fn() }));
const runServiceMocks = vi.hoisted(() => ({ createRun: vi.fn(), findActive: vi.fn() }));
const workflowMocks = vi.hoisted(() => ({
  start: vi.fn(),
  loadMcpTools: vi.fn(),
  loadConnectorTools: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: rlsMocks.getUserScopedDb }));
vi.mock('@/lib/workflows/start-cloud-agent-workflow', () => ({
  startCloudAgentWorkflowExecution: workflowMocks.start,
}));
vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/cloud-agent-run-service')>()),
  createCloudAgentRun: runServiceMocks.createRun,
  findActiveCloudAgentRunForConversation: runServiceMocks.findActive,
}));
vi.mock('@/lib/user-connector-tools', () => ({
  loadUserConnectorToolCatalog: workflowMocks.loadConnectorTools,
  makeUserConnectorExecutor: vi.fn(),
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/llm/v1/chat/completions/lib/tool-loop')>()),
  loadMcpToolDefs: workflowMocks.loadMcpTools,
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  reserveManagedUsageRequest: managedUsageMocks.reserve,
  markManagedUsageProviderStarted: managedUsageMocks.providerStarted,
  finalizeManagedUsageRequest: managedUsageMocks.finalize,
  markManagedUsageClientDelivered: managedUsageMocks.delivered,
}));

const mockGetSubscription = vi.fn();
const mockCheckAvailable = vi.fn();
const mockDeductCredits = vi.fn();
const mockGetBalance = vi.fn();
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
    allocateCreditsForPeriod: vi.fn().mockResolvedValue('mock-account-id'),
  },
}));
vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),

  CreditService: {
    checkAvailable: (...args: unknown[]) => mockCheckAvailable(...args),
    checkAvailableMicrousd: (...args: unknown[]) => mockCheckAvailable(...args),
    deductCredits: (...args: unknown[]) => mockDeductCredits(...args),
    getBalance: (...args: unknown[]) => mockGetBalance(...args),
    generateIdempotencyKey: (userId: string, operationType: string, requestId: string) =>
      `${userId}:${operationType}:${requestId}`,
  },
}));

const mockGetProviderFromModel = vi.fn();
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/provider-adapter-service')>();
  return {
    ...actual,
    resolveProviderFromModel: (...args: unknown[]) => mockGetProviderFromModel(...args),
  };
});
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateListCost: vi.fn(() => null),
    calculateListCostMicrousd: vi.fn(() => null),
    estimateListCost: vi.fn(() => null),
    estimateListCostMicrousd: vi.fn(() => null),
    estimateCost: vi.fn(() => 5),
    estimateCostMicrousd: vi.fn(() => 50000),
    calculateCost: vi.fn(() => 4),
    calculateCostMicrousd: vi.fn(() => 40000),
    getInputCostPerMtok: vi.fn(() => 3.0),
    getCacheWriteCostPerMtok: vi.fn(() => 3.0),
  },
  CACHE_WRITE_FALLBACK_MULTIPLIERS: { write5m: 1.25, write1h: 2 },
  isCacheTokensDisjointFromInput: vi.fn(() => false),
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
  resolveCacheRates: vi.fn(() => ({ read: 0, write5m: 0, write1h: 0 })),
}));

import { POST } from '@/app/api/llm/v1/chat/completions/route';

interface StoredRun {
  id: string;
  userId: string;
  requestId: string;
  conversationId: string;
  state: string;
  originSurface: string;
  workMode: string;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function makeAgiWorkRequest(idempotencyKey: string): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL_ID,
      messages: [{ role: 'user', content: 'complete this durable task' }],
      stream: true,
      work_mode: 'agiwork',
      conversation_id: CONVERSATION_ID,
    }),
  });
}

function makeSubscription() {
  return {
    id: 'sub_1',
    status: 'active',
    plan_tier: 'max',
    stripe_price_id: 'price_pro',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
  };
}

/**
 * Models the two Postgres guarantees the fix depends on: a transaction runs on
 * one session, and `pg_advisory_xact_lock` queues callers on the same key until
 * the holding transaction commits or rolls back.
 */
function makeLockingDb(advisoryKeys: string[]) {
  const lockTails = new Map<string, Promise<void>>();

  const baseQuery = async (sql: string): Promise<Record<string, unknown>[]> =>
    /web_conversations/i.test(sql) ? [{ id: CONVERSATION_ID, user_id: USER_ID }] : [];

  const makeAdapter = (
    query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>,
  ): Record<string, unknown> => ({
    query,
    execute: async () => 0,
    withUser: () => makeAdapter(query),
    withOrg: () => makeAdapter(query),
    dispose: async () => undefined,
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const lockHold: { release: () => void } = { release: () => {} };
      const txQuery = async (
        sql: string,
        params?: unknown[],
      ): Promise<Record<string, unknown>[]> => {
        if (!/pg_advisory_xact_lock/i.test(sql)) return query(sql, params);
        const key = String(params?.[0] ?? '');
        advisoryKeys.push(key);
        const ahead = lockTails.get(key) ?? Promise.resolve();
        let release!: () => void;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        lockTails.set(
          key,
          ahead.then(() => held),
        );
        await ahead;
        lockHold.release = release;
        return [];
      };
      try {
        return await fn(makeAdapter(txQuery));
      } finally {
        lockHold.release();
      }
    },
  });

  return makeAdapter(baseQuery);
}

describe('WEB-ROUTE-NEAR-SIMULTANEOUS-TURNS-SAME-01', () => {
  it('starts one billed run and refuses the other when two turns race on one conversation', async () => {
    vi.clearAllMocks();
    const advisoryKeys: string[] = [];
    const runs: StoredRun[] = [];
    let arrivals = 0;
    let openRendezvous!: () => void;
    const rendezvous = new Promise<void>((resolve) => {
      openRendezvous = resolve;
    });

    mockGetClerkAuthUser.mockResolvedValue({ userId: USER_ID, email: 'u@example.com' });
    mockGetSubscription.mockResolvedValue(makeSubscription());
    rlsMocks.getUserScopedDb.mockResolvedValue({
      db: makeLockingDb(advisoryKeys),
      userId: USER_ID,
    });
    mockCheckAvailable.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 10000 });
    mockGetBalance.mockResolvedValue({
      account_id: 'acct-1',
      credits_remaining_cents: 10000,
      credits_allocated_cents: 20000,
    });
    managedUsageMocks.reserve.mockImplementation(async (input) => ({
      db: input.db,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      leaseToken: 'lease-test',
      estimatedCostMicrousd: input.estimatedCostMicrousd,
      estimatedCostCents: input.estimatedCostCents,
    }));
    mockGetProviderFromModel.mockReturnValue('minimax');
    workflowMocks.loadMcpTools.mockResolvedValue([]);
    workflowMocks.loadConnectorTools.mockResolvedValue({ tools: [], dropped: [], limit: 32 });
    workflowMocks.start.mockResolvedValue({
      workflowRunId: 'wrun_race_1',
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    });

    // Both turns are held at the existence check until either the second one
    // arrives or the window closes, so an unserialised route observes an empty
    // table twice and a serialised one never gets a second caller in.
    runServiceMocks.findActive.mockImplementation(
      async (_db: unknown, input: { requestId?: string; excludeRequestId?: string }) => {
        arrivals += 1;
        if (arrivals >= REQUIRED_ARRIVALS) openRendezvous();
        await Promise.race([rendezvous, delay(RENDEZVOUS_TIMEOUT_MS)]);
        return (
          runs.find(
            (run) =>
              run.conversationId === CONVERSATION_ID &&
              run.state !== 'completed' &&
              run.requestId !== input.excludeRequestId,
          ) ?? null
        );
      },
    );
    runServiceMocks.createRun.mockImplementation(
      async (_db: unknown, input: { requestId: string }) => {
        const run: StoredRun = {
          id: `run-${runs.length + 1}`,
          userId: USER_ID,
          requestId: input.requestId,
          conversationId: CONVERSATION_ID,
          state: 'running',
          originSurface: 'web',
          workMode: 'agiwork',
          provider: 'minimax',
          model: MINIMAX_MODEL_ID,
          createdAt: '2026-09-07T00:00:00.000Z',
          updatedAt: '2026-09-07T00:00:00.000Z',
        };
        runs.push(run);
        return run;
      },
    );

    const responses = await Promise.all([
      POST(makeAgiWorkRequest('race-turn-a')),
      POST(makeAgiWorkRequest('race-turn-b')),
    ]);
    const statuses = responses.map((response) => response.status).sort((a, b) => a - b);

    expect(statuses).toEqual([SUCCESS_STATUS, CONFLICT_STATUS]);
    expect(runServiceMocks.createRun).toHaveBeenCalledTimes(1);
    expect(runs).toHaveLength(1);

    const conflict = responses.find((response) => response.status === CONFLICT_STATUS);
    await expect(conflict?.json()).resolves.toMatchObject({
      error: { code: 'conversation_run_in_progress' },
    });
    expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed' }),
    );
  });

  it('scopes the admission lock to the owner and the conversation', async () => {
    vi.clearAllMocks();
    const advisoryKeys: string[] = [];

    mockGetClerkAuthUser.mockResolvedValue({ userId: USER_ID, email: 'u@example.com' });
    mockGetSubscription.mockResolvedValue(makeSubscription());
    rlsMocks.getUserScopedDb.mockResolvedValue({
      db: makeLockingDb(advisoryKeys),
      userId: USER_ID,
    });
    mockCheckAvailable.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 10000 });
    mockGetBalance.mockResolvedValue({
      account_id: 'acct-1',
      credits_remaining_cents: 10000,
      credits_allocated_cents: 20000,
    });
    managedUsageMocks.reserve.mockImplementation(async (input) => ({
      db: input.db,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      leaseToken: 'lease-test',
      estimatedCostMicrousd: input.estimatedCostMicrousd,
      estimatedCostCents: input.estimatedCostCents,
    }));
    mockGetProviderFromModel.mockReturnValue('minimax');
    workflowMocks.loadMcpTools.mockResolvedValue([]);
    workflowMocks.loadConnectorTools.mockResolvedValue({ tools: [], dropped: [], limit: 32 });
    workflowMocks.start.mockResolvedValue({
      workflowRunId: 'wrun_race_2',
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    });
    runServiceMocks.findActive.mockResolvedValue(null);
    runServiceMocks.createRun.mockResolvedValue({
      id: 'run-solo-1',
      userId: USER_ID,
      requestId: 'solo-turn',
      conversationId: CONVERSATION_ID,
      state: 'running',
      originSurface: 'web',
      workMode: 'agiwork',
      provider: 'minimax',
      model: MINIMAX_MODEL_ID,
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    });

    const response = await POST(makeAgiWorkRequest('solo-turn'));

    expect(response.status).toBe(SUCCESS_STATUS);
    expect(advisoryKeys).toHaveLength(1);
    expect(advisoryKeys[0]).toContain(USER_ID);
    expect(advisoryKeys[0]).toContain(CONVERSATION_ID);
  });
});
