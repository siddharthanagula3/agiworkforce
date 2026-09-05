import { afterEach, describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { listCanonicalModels, requireProviderDefaultModel } from '@agiworkforce/types';

const COMPAT_PROVIDER_CASES = [
  { provider: 'minimax', content: 'MiniMax says hi.' },
  { provider: 'zhipu', content: 'Zhipu says hi.' },
  { provider: 'qwen', content: 'Qwen says hi.' },
  { provider: 'deepseek', content: 'DeepSeek says hi.' },
  { provider: 'xai', content: 'XAI says hi.' },
  { provider: 'perplexity', content: 'Perplexity says hi.' },
] as const;

const COMPAT_CASES = COMPAT_PROVIDER_CASES.map(({ provider, content }) => ({
  provider,
  model: requireProviderDefaultModel(provider),
  content,
}));

const MINIMAX_MODEL_ID = requireProviderDefaultModel('minimax');
const PERPLEXITY_TOOLLESS_MODEL_ID = (() => {
  const model = listCanonicalModels().find(
    (candidate) => candidate.provider === 'perplexity' && candidate.capabilities.tools === false,
  );
  if (!model) throw new Error('A catalog-backed tool-less search fixture is required');
  return model.id;
})();

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
vi.mock('@/lib/model-tiers', () => ({
  canAccessModel: () => true,
}));
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
vi.mock('@/lib/egress-policy', () => ({
  validateEgressUrl: vi.fn(),
  validateUserImageUrl: vi.fn(),
  EgressPolicyError: class EgressPolicyError extends Error {},
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

function compatAdapterMock(providerId: string, content: string) {
  return {
    [`create${providerId}Adapter`]: vi.fn(() => ({
      id: providerId.toLowerCase(),
      label: providerId,
      auth: [],
      config: {},
      async catalog() {
        return [];
      },
      async *stream() {
        yield { type: 'text-delta', delta: content };
        yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
        yield { type: 'stop', reason: 'end_turn' };
      },
    })),
  };
}

vi.mock('@agiworkforce/providers-minimax', () => compatAdapterMock('Minimax', 'MiniMax says hi.'));
vi.mock('@agiworkforce/providers-moonshot', () =>
  compatAdapterMock('Moonshot', 'Moonshot says hi.'),
);
vi.mock('@agiworkforce/providers-zhipu', () => compatAdapterMock('Zhipu', 'Zhipu says hi.'));
vi.mock('@agiworkforce/providers-qwen', () => compatAdapterMock('Qwen', 'Qwen says hi.'));
vi.mock('@agiworkforce/providers-openrouter', () =>
  compatAdapterMock('OpenRouter', 'OpenRouter says hi.'),
);
vi.mock('@agiworkforce/providers-deepseek', () =>
  compatAdapterMock('DeepSeek', 'DeepSeek says hi.'),
);
vi.mock('@agiworkforce/providers-xai', () => compatAdapterMock('XAI', 'XAI says hi.'));
vi.mock('@agiworkforce/providers-perplexity', () =>
  compatAdapterMock('Perplexity', 'Perplexity says hi.'),
);

vi.mock('@agiworkforce/providers-anthropic', () => ({
  createAnthropicAdapter: vi.fn(() => ({
    id: 'anthropic',
    label: 'Anthropic',
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
vi.mock('@agiworkforce/providers-google', () => ({
  createGoogleAdapter: vi.fn(() => ({
    id: 'google',
    label: 'Google',
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
vi.mock('@agiworkforce/providers-openai', () => ({
  createOpenAIAdapter: vi.fn(() => ({
    id: 'openai',
    label: 'OpenAI',
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

const rlsMocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
}));

const workflowRouteMocks = vi.hoisted(() => ({
  start: vi.fn(),
  createRun: vi.fn(),
  findActive: vi.fn(),
  loadMcpTools: vi.fn(),
  loadConnectorTools: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: rlsMocks.getUserScopedDb,
}));

// Only the reservation entry points are stubbed; `isFreePlanTier` and the policy
// constants stay real. `isFreeTrialRequest` answers false by default so every
// existing paid case below is unaffected.
const freeTrialMocks = vi.hoisted(() => ({
  isFreeTrial: vi.fn(() => false),
  begin: vi.fn(),
  applyBudget: vi.fn(() => ({ ok: true, maxOutputTokens: 4096 })),
  settle: vi.fn(async () => undefined),
}));

vi.mock('@/lib/services/free-trial-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/free-trial-service')>()),
  isFreeTrialRequest: freeTrialMocks.isFreeTrial,
  beginFreeTrialRequest: freeTrialMocks.begin,
  applyFreeTrialProviderBudget: freeTrialMocks.applyBudget,
  settleFreeTrialRequest: freeTrialMocks.settle,
}));

vi.mock('@/lib/workflows/start-cloud-agent-workflow', () => ({
  startCloudAgentWorkflowExecution: workflowRouteMocks.start,
}));

vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/cloud-agent-run-service')>()),
  createCloudAgentRun: workflowRouteMocks.createRun,
  findActiveCloudAgentRunForConversation: workflowRouteMocks.findActive,
}));

vi.mock('@/lib/user-connector-tools', () => ({
  loadUserConnectorToolCatalog: workflowRouteMocks.loadConnectorTools,
  makeUserConnectorExecutor: vi.fn(),
}));

vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/llm/v1/chat/completions/lib/tool-loop')>()),
  loadMcpToolDefs: workflowRouteMocks.loadMcpTools,
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
    estimateCost: vi.fn(() => 5),
    calculateCost: vi.fn(() => 4),
    getInputCostPerMtok: vi.fn(() => 3.0),
    getCacheWriteCostPerMtok: vi.fn(() => 3.0),
  },
}));

import { POST } from '@/app/api/llm/v1/chat/completions/route';
import {
  recordDurableTransportClaim,
  DURABLE_FIRST_EVENT_BUDGET_ENV,
  DURABLE_FIRST_EVENT_BUDGET_EVENT,
} from '@/lib/workflows/durable-stream-liveness';
import { logger } from '@/lib/logger';
import { CHAT_TURN_PHASE, CHAT_TURN_SPAN } from '@/app/api/llm/v1/chat/completions/lib/turn-phases';

function makeRequest(model: string, conversationId?: string, stream = false): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'test-managed-chat-request',
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'hi' }],
      stream,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }),
  });
}

function makeAgiWorkRequest(model: string, conversationId?: string): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'test-durable-agi-work-request',
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'complete this durable task' }],
      stream: true,
      work_mode: 'agiwork',
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }),
  });
}

function makeSubscription() {
  return {
    id: 'sub_1',
    status: 'active',
    plan_tier: 'pro',
    stripe_price_id: 'price_pro',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
  };
}

describe.each(COMPAT_CASES)(
  'POST /api/llm/v1/chat/completions, $provider adapter dispatch (task #34)',
  ({ provider, model, content }) => {
    it(`routes an explicit ${provider} model through its own adapter`, async () => {
      vi.clearAllMocks();
      mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1', email: 'u@example.com' });
      mockGetSubscription.mockResolvedValue(makeSubscription());
      rlsMocks.getUserScopedDb.mockResolvedValue({
        db: { query: vi.fn(async () => []) },
        userId: 'user-1',
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
      mockGetProviderFromModel.mockReturnValue(provider);

      const response = await POST(makeRequest(model));
      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        x_agi_workforce?: { provider?: string };
      };

      expect(data.x_agi_workforce?.provider).toBe(provider);
      expect(data.choices?.[0]?.message?.content).toBe(content);
    });
  },
);

describe('Managed Web provider admission', () => {
  it.each([
    ['groq', 'fixture-unroutable-groq-model'],
    ['openrouter', 'fixture-unroutable-openrouter-model'],
  ])('rejects %s when it has no selectable Managed Web route', async (provider, model) => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1', email: 'u@example.com' });
    mockGetSubscription.mockResolvedValue(makeSubscription());
    rlsMocks.getUserScopedDb.mockResolvedValue({
      db: { query: vi.fn(async () => []) },
      userId: 'user-1',
    });
    mockGetProviderFromModel.mockReturnValue(provider);

    const response = await POST(makeRequest(model));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'model_route_unavailable' },
    });
    expect(mockCheckAvailable).not.toHaveBeenCalled();
  });
});

describe('Managed Web conversation ownership', () => {
  it('rejects a foreign conversation before reserving credits or starting a provider', async () => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'attacker-user', email: 'a@example.com' });
    mockGetSubscription.mockResolvedValue(makeSubscription());
    const query = vi.fn().mockResolvedValue([]);
    rlsMocks.getUserScopedDb.mockResolvedValue({ db: { query }, userId: 'attacker-user' });
    mockGetProviderFromModel.mockReturnValue('minimax');

    const response = await POST(
      makeRequest(MINIMAX_MODEL_ID, '0190a000-0000-7000-8000-0000000000cc'),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'conversation_not_found' },
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/web_conversations[\s\S]*user_id\s*=\s*\$2/i),
      ['0190a000-0000-7000-8000-0000000000cc', 'attacker-user'],
    );
    expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
  });
});

describe('Managed Web AGI Work dispatch', () => {
  function arrangePaidAgenticTurn(): void {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1', email: 'u@example.com' });
    mockGetSubscription.mockResolvedValue({ ...makeSubscription(), plan_tier: 'max' });
    rlsMocks.getUserScopedDb.mockResolvedValue({
      db: { query: vi.fn(async () => []) },
      userId: 'user-1',
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
    workflowRouteMocks.loadMcpTools.mockResolvedValue([]);
    workflowRouteMocks.loadConnectorTools.mockResolvedValue({
      tools: [],
      dropped: [],
      limit: 32,
    });
    workflowRouteMocks.createRun.mockResolvedValue({
      id: 'run-durable-1',
      userId: 'user-1',
      requestId: 'request-durable-1',
      state: 'queued',
      originSurface: 'web',
      workMode: 'agiwork',
      provider: 'minimax',
      model: MINIMAX_MODEL_ID,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    });
  }

  function durableWorkflowStream() {
    return {
      workflowRunId: 'wrun_durable_1',
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    };
  }

  const DURABLE_BUDGET_MS = 20;
  const OUTLIVES_DURABLE_BUDGET_MS = 250;

  function slowDurableWorkflowStream() {
    const cancel = vi.fn(async () => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    return {
      cancel,
      workflow: {
        workflowRunId: 'wrun_durable_slow',
        cancel,
        readable: new ReadableStream<Uint8Array>({
          start(controller) {
            timer = setTimeout(() => {
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
              controller.close();
            }, OUTLIVES_DURABLE_BUDGET_MS);
          },
          cancel() {
            if (timer) clearTimeout(timer);
          },
        }),
      },
    };
  }

  function chatTurnSpanAttributes(): Record<string, unknown> {
    const emitted = vi
      .mocked(logger.info)
      .mock.calls.map(([record]) => record as Record<string, unknown>)
      .find((record) => record['span_name'] === CHAT_TURN_SPAN);
    if (!emitted) throw new Error(`no ${CHAT_TURN_SPAN} span was emitted`);
    return emitted;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    recordDurableTransportClaim();
  });

  it('runs a paid agentic turn on the durable transport so it survives the client', async () => {
    arrangePaidAgenticTurn();
    vi.stubEnv('AGI_DURABLE_INITIAL_TURNS', '1');
    workflowRouteMocks.start.mockResolvedValue(durableWorkflowStream());

    const response = await POST(makeAgiWorkRequest(MINIMAX_MODEL_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Tool-Loop')).toBe('durable');
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBe('wrun_durable_1');
    expect(response.headers.get('X-AGI-Agent-Run-Id')).toBe('run-durable-1');
    expect(workflowRouteMocks.start).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-durable-1', userId: 'user-1' }),
    );
    expect(workflowRouteMocks.loadConnectorTools).toHaveBeenCalledWith('user-1', {
      customConnectorLimit: undefined,
      planTier: 'max',
      isToolDenied: expect.any(Function),
    });
  });

  it('takes the durable transport by default, with no environment override set', async () => {
    arrangePaidAgenticTurn();
    vi.stubEnv('AGI_DURABLE_INITIAL_TURNS', undefined);
    workflowRouteMocks.start.mockResolvedValue(durableWorkflowStream());

    const response = await POST(makeAgiWorkRequest(MINIMAX_MODEL_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Tool-Loop')).toBe('durable');
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBe('wrun_durable_1');
    expect(workflowRouteMocks.start).toHaveBeenCalledTimes(1);
  });

  it('reverts to the request-scoped stream when the kill-switch is off', async () => {
    arrangePaidAgenticTurn();
    vi.stubEnv('AGI_DURABLE_INITIAL_TURNS', '0');
    workflowRouteMocks.start.mockResolvedValue(durableWorkflowStream());

    const response = await POST(makeAgiWorkRequest(MINIMAX_MODEL_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Tool-Loop')).toBe('active');
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBeNull();
    expect(response.headers.get('X-AGI-Agent-Run-Id')).toBe('run-durable-1');
    expect(workflowRouteMocks.start).not.toHaveBeenCalled();
  });

  it('degrades to the request-scoped stream instead of failing the turn when the workflow will not start', async () => {
    arrangePaidAgenticTurn();
    vi.stubEnv('AGI_DURABLE_INITIAL_TURNS', '1');
    workflowRouteMocks.start.mockRejectedValue(new Error('workflow storage unavailable'));

    const response = await POST(makeAgiWorkRequest(MINIMAX_MODEL_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Tool-Loop')).toBe('active');
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBeNull();
  });

  /**
   * AGI-126. The durable branch used to read `processed.managedUsage && ...`, so
   * the DEFAULT tier was the one tier that never got durability. A free-trial
   * turn still created a `cloud_agent_runs` row, so it LOOKED durable to the runs
   * list and the approval APIs, then died with the client connection, and a
   * pause it recorded could never be resumed, because the resume routes could not
   * build a workflow input without a managed reservation.
   */
  // AGI Work itself is Pro-gated, so the free tier's agentic turn is an ordinary
  // streaming chat turn that happens to have MCP tools in its catalog, which is
  // exactly the shape that opens a `cloud_agent_runs` row and can pause on an
  // approval.
  function arrangeFreeTrialToolTurn(): void {
    arrangePaidAgenticTurn();
    mockGetSubscription.mockResolvedValue({ ...makeSubscription(), plan_tier: 'free' });
    freeTrialMocks.isFreeTrial.mockReturnValue(true);
    freeTrialMocks.begin.mockImplementation(
      async ({ userId, requestId }: { userId: string; requestId: string }) => ({
        ok: true,
        reservation: { kind: 'free_trial', userId, requestId, reservedMicrousd: 5_000 },
      }),
    );
    freeTrialMocks.applyBudget.mockReturnValue({ ok: true, maxOutputTokens: 4096 });
    workflowRouteMocks.loadMcpTools.mockResolvedValue([
      {
        qualifiedName: 'mcp__github__get_pull_request',
        serverId: 'github',
        toolName: 'get_pull_request',
        description: 'Read a pull request',
        inputSchema: { type: 'object', properties: {} },
      },
    ]);
  }

  it('runs a free-trial tool-using turn on the durable transport, like every other tier', async () => {
    arrangeFreeTrialToolTurn();
    vi.stubEnv('AGI_DURABLE_INITIAL_TURNS', '1');
    workflowRouteMocks.start.mockResolvedValue(durableWorkflowStream());

    const response = await POST(makeRequest(MINIMAX_MODEL_ID, undefined, true));

    if (response.status !== 200) {
      throw new Error(`free-trial turn refused: ${await response.text()}`);
    }
    expect(response.headers.get('X-AGI-Tool-Loop')).toBe('durable');
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBe('wrun_durable_1');
    expect(workflowRouteMocks.start).toHaveBeenCalledTimes(1);
  });

  it('hands the durable start a free-trial reservation and no managed one', async () => {
    arrangeFreeTrialToolTurn();
    workflowRouteMocks.start.mockResolvedValue(durableWorkflowStream());

    await POST(makeRequest(MINIMAX_MODEL_ID, undefined, true));

    const started = workflowRouteMocks.start.mock.calls[0]![0] as {
      processed: { freeTrial?: unknown; managedUsage?: unknown };
    };
    expect(started.processed.freeTrial).toMatchObject({
      kind: 'free_trial',
      userId: 'user-1',
      reservedMicrousd: 5_000,
    });
    expect(started.processed.managedUsage).toBeUndefined();
    // A free turn must never reserve managed credit on its way to durability.
    expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
  });

  it('still reverts a free-trial turn to the request-scoped stream when the kill-switch is off', async () => {
    arrangeFreeTrialToolTurn();
    vi.stubEnv('AGI_DURABLE_INITIAL_TURNS', '0');
    workflowRouteMocks.start.mockResolvedValue(durableWorkflowStream());

    const response = await POST(makeRequest(MINIMAX_MODEL_ID, undefined, true));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Tool-Loop')).toBe('active');
    expect(workflowRouteMocks.start).not.toHaveBeenCalled();
  });

  it('serves a plain chat turn inline once the durable first byte misses its budget', async () => {
    arrangeFreeTrialToolTurn();
    vi.stubEnv('AGI_DURABLE_INITIAL_TURNS', '1');
    vi.stubEnv(DURABLE_FIRST_EVENT_BUDGET_ENV, String(DURABLE_BUDGET_MS));
    const slow = slowDurableWorkflowStream();
    workflowRouteMocks.start.mockResolvedValue(slow.workflow);

    const response = await POST(makeRequest(MINIMAX_MODEL_ID, undefined, true));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Tool-Loop')).toBe('active');
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBeNull();
    // Exactly one durable attempt, exactly one cancel: the turn is served once.
    expect(workflowRouteMocks.start).toHaveBeenCalledTimes(1);
    expect(slow.cancel).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: DURABLE_FIRST_EVENT_BUDGET_EVENT }),
      expect.any(String),
    );
    expect(chatTurnSpanAttributes()).toMatchObject({
      [`phase.${CHAT_TURN_PHASE.durableBudgetFallback}_ms`]: expect.any(Number),
    });
  });

  it('keeps an agi work run on the durable transport past the plain chat budget', async () => {
    arrangePaidAgenticTurn();
    vi.stubEnv('AGI_DURABLE_INITIAL_TURNS', '1');
    vi.stubEnv(DURABLE_FIRST_EVENT_BUDGET_ENV, String(DURABLE_BUDGET_MS));
    const slow = slowDurableWorkflowStream();
    workflowRouteMocks.start.mockResolvedValue(slow.workflow);

    const response = await POST(makeAgiWorkRequest(MINIMAX_MODEL_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Tool-Loop')).toBe('durable');
    expect(response.headers.get('X-AGI-Workflow-Run-Id')).toBe('wrun_durable_slow');
    expect(slow.cancel).not.toHaveBeenCalled();
  });

  it('skips the durable attempt for the next plain chat turn while the budget breaker is open', async () => {
    arrangeFreeTrialToolTurn();
    vi.stubEnv('AGI_DURABLE_INITIAL_TURNS', '1');
    vi.stubEnv(DURABLE_FIRST_EVENT_BUDGET_ENV, String(DURABLE_BUDGET_MS));
    workflowRouteMocks.start.mockResolvedValue(slowDurableWorkflowStream().workflow);

    await POST(makeRequest(MINIMAX_MODEL_ID, undefined, true));
    workflowRouteMocks.start.mockClear();
    const second = await POST(makeRequest(MINIMAX_MODEL_ID, undefined, true));

    expect(second.status).toBe(200);
    expect(second.headers.get('X-AGI-Tool-Loop')).toBe('active');
    expect(workflowRouteMocks.start).not.toHaveBeenCalled();
  });

  it('leaves an ordinary chat turn with no tools off the durable transport entirely', async () => {
    arrangePaidAgenticTurn();
    workflowRouteMocks.start.mockResolvedValue(durableWorkflowStream());

    const response = await POST(makeRequest(MINIMAX_MODEL_ID, undefined, true));

    expect(response.status).toBe(200);
    expect(workflowRouteMocks.start).not.toHaveBeenCalled();
    expect(workflowRouteMocks.createRun).not.toHaveBeenCalled();
  });
});

describe('Managed Web conversation run concurrency guard', () => {
  it('rejects a new turn with 409 while a prior run for the conversation is still active', async () => {
    vi.clearAllMocks();
    const conversationId = '0190a000-0000-7000-8000-0000000000aa';
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1', email: 'u@example.com' });
    mockGetSubscription.mockResolvedValue({ ...makeSubscription(), plan_tier: 'max' });
    const query = vi.fn(async (sql: string) =>
      /web_conversations/i.test(sql) ? [{ id: conversationId, user_id: 'user-1' }] : [],
    );
    rlsMocks.getUserScopedDb.mockResolvedValue({ db: { query }, userId: 'user-1' });
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
    workflowRouteMocks.loadMcpTools.mockResolvedValue([]);
    workflowRouteMocks.loadConnectorTools.mockResolvedValue({
      tools: [],
      dropped: [],
      limit: 32,
    });
    workflowRouteMocks.findActive.mockResolvedValue({
      id: 'run-active-1',
      userId: 'user-1',
      requestId: 'request-active-1',
      state: 'running',
      originSurface: 'web',
      workMode: 'agiwork',
      provider: 'minimax',
      model: MINIMAX_MODEL_ID,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    });

    const response = await POST(makeAgiWorkRequest(MINIMAX_MODEL_ID, conversationId));

    expect(response.status, await response.clone().text()).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'conversation_run_in_progress', run_id: 'run-active-1' },
    });
    expect(response.headers.get('X-AGI-Agent-Run-Id')).toBe('run-active-1');

    expect(workflowRouteMocks.findActive).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-1', conversationId }),
    );
    expect(workflowRouteMocks.createRun).not.toHaveBeenCalled();
    expect(workflowRouteMocks.start).not.toHaveBeenCalled();
    expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed' }),
    );
  });
});

describe('Per-model tools capability gate', () => {
  it('does not load MCP/connector tools for a catalog tools:false search model', async () => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1', email: 'u@example.com' });
    mockGetSubscription.mockResolvedValue({ ...makeSubscription(), plan_tier: 'max' });
    rlsMocks.getUserScopedDb.mockResolvedValue({
      db: { query: vi.fn(async () => []) },
      userId: 'user-1',
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
    mockGetProviderFromModel.mockReturnValue('perplexity');
    workflowRouteMocks.loadMcpTools.mockResolvedValue([{ name: 'op_tool' }]);
    workflowRouteMocks.loadConnectorTools.mockResolvedValue({
      tools: [{ name: 'gh_tool' }],
      dropped: [],
      limit: 32,
    });

    const response = await POST(makeRequest(PERPLEXITY_TOOLLESS_MODEL_ID, undefined, true));

    expect(workflowRouteMocks.loadMcpTools).not.toHaveBeenCalled();
    expect(workflowRouteMocks.loadConnectorTools).not.toHaveBeenCalled();
    expect(workflowRouteMocks.start).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
