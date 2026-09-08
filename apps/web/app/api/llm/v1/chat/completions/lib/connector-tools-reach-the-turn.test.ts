import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireProviderDefaultModel } from '@agiworkforce/types';

const MINIMAX_MODEL_ID = requireProviderDefaultModel('minimax');
const USER_ID = 'user-1';
const GITHUB_SERVER_ID = 'github';

const admitManagedTurnSlot = () => ({
  admitted: true,
  limit: null,
  active: 0,
  slot: { release: async () => {} },
});
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
  acquireManagedTurnSlot: vi.fn(async () => admitManagedTurnSlot()),
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

/**
 * The connector data the account owns. Everything above this line is the
 * ordinary route harness; `@/lib/user-connector-tools` is deliberately NOT
 * mocked, because the join between a connected connector and the turn's tool
 * catalog is exactly what this file exists to prove. Every other route test
 * stubs that module wholesale, so severing the wiring would fail nothing.
 */
const connectorData = vi.hoisted(() => ({
  githubInstallations: [] as { installation_id: number; account_login: string }[],
}));

vi.mock('@/lib/github-app', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/github-app')>()),
  isGitHubAppConfigured: () => true,
  isGitHubInstallationLinkingAvailable: () => true,
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: vi.fn(async (sql: string) =>
      /github_installations/i.test(sql) ? connectorData.githubInstallations : [],
    ),
  }),
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: () => ({ query: vi.fn(async () => []) }),
}));
vi.mock('@/lib/connectors/oauth-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/oauth-store')>()),
  getUserConnectorOAuthGrantSummaries: vi.fn(async () => []),
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
const workflowMocks = vi.hoisted(() => ({ start: vi.fn(), loadMcpTools: vi.fn() }));
const toolLoopMocks = vi.hoisted(() => ({ classify: vi.fn() }));

vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: rlsMocks.getUserScopedDb }));
vi.mock('@/lib/workflows/start-cloud-agent-workflow', () => ({
  startCloudAgentWorkflowExecution: workflowMocks.start,
}));
vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/cloud-agent-run-service')>()),
  createCloudAgentRun: runServiceMocks.createRun,
  findActiveCloudAgentRunForConversation: runServiceMocks.findActive,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/llm/v1/chat/completions/lib/tool-loop')>()),
  loadMcpToolDefs: workflowMocks.loadMcpTools,
}));

/**
 * The seam the turn's tool catalog passes through. Capturing it here is what
 * makes "reached the turn" observable without asserting on provider bytes.
 */
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop-routing', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/app/api/llm/v1/chat/completions/lib/tool-loop-routing')
    >();
  return {
    ...actual,
    classifyToolLoopInputs: (...args: Parameters<typeof actual.classifyToolLoopInputs>) => {
      toolLoopMocks.classify(...args);
      return actual.classifyToolLoopInputs(...args);
    },
  };
});

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
  CreditService: {
    checkAvailable: (...args: unknown[]) => mockCheckAvailable(...args),
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
    estimateListCost: vi.fn(() => null),
    estimateCost: vi.fn(() => 5),
    calculateCost: vi.fn(() => 4),
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

interface ToolDef {
  serverId: string;
  toolName: string;
}

function offeredConnectorTools(): ToolDef[] {
  const call = toolLoopMocks.classify.mock.calls.at(-1);
  const mcpTools = (call?.[0] ?? []) as ToolDef[];
  return mcpTools.filter((tool) => tool.serverId === GITHUB_SERVER_ID);
}

function makeRequest(disabledConnectorIds?: string[]): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'Idempotency-Key': `connector-reach-${Date.now()}-${Math.random()}`,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL_ID,
      messages: [{ role: 'user', content: 'open the pull request diff' }],
      stream: true,
      ...(disabledConnectorIds ? { disabled_connector_ids: disabledConnectorIds } : {}),
    }),
  });
}

function arrangePaidTurn(): void {
  mockGetClerkAuthUser.mockResolvedValue({ userId: USER_ID, email: 'u@example.com' });
  mockGetSubscription.mockResolvedValue({
    id: 'sub_1',
    status: 'active',
    plan_tier: 'max',
    stripe_price_id: 'price_pro',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
  });
  rlsMocks.getUserScopedDb.mockResolvedValue({
    db: { query: vi.fn(async () => []) },
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
    estimatedCostCents: input.estimatedCostCents,
  }));
  mockGetProviderFromModel.mockReturnValue('minimax');
  workflowMocks.loadMcpTools.mockResolvedValue([]);
  workflowMocks.start.mockResolvedValue({
    workflowRunId: 'wrun_connector_1',
    readable: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
  });
  runServiceMocks.findActive.mockResolvedValue(null);
  runServiceMocks.createRun.mockResolvedValue({
    id: 'run-connector-1',
    userId: USER_ID,
    requestId: 'request-connector-1',
    state: 'running',
    originSurface: 'web',
    workMode: 'chat',
    provider: 'minimax',
    model: MINIMAX_MODEL_ID,
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
  });
}

describe('WEB-CONNECTORS-NO-RUNTIME-EFFECT-01 · connectors reach the turn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectorData.githubInstallations = [];
    arrangePaidTurn();
  });

  it('offers a connected connector its tools on the turn', async () => {
    connectorData.githubInstallations = [{ installation_id: 42, account_login: 'acme' }];

    await POST(makeRequest());

    const tools = offeredConnectorTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.map((tool) => tool.toolName)).toContain('get_pull_request_diff');
  });

  it('offers nothing for a connector the account has not connected', async () => {
    connectorData.githubInstallations = [];

    await POST(makeRequest());

    expect(offeredConnectorTools()).toEqual([]);
  });

  it('offers nothing for a connected connector the turn switched off', async () => {
    connectorData.githubInstallations = [{ installation_id: 42, account_login: 'acme' }];

    await POST(makeRequest([GITHUB_SERVER_ID]));

    expect(offeredConnectorTools()).toEqual([]);
  });
});
