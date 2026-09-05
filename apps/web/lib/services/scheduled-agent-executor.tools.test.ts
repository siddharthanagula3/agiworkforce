import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { listCanonicalModels, type ModelMetadata } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const mockBuildToolLoopStream = vi.fn();
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: vi.fn(() => 'route-id'),
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(async () => null),
  pauseE2BSession: vi.fn(),
}));
vi.mock('@/lib/server/generated-file-persist', () => ({
  persistGeneratedFileBytes: vi.fn(),
}));

const mockLoadMcpToolDefs = vi.fn(async () => [] as unknown[]);
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/app/api/llm/v1/chat/completions/lib/tool-loop')>();
  return { ...actual, loadMcpToolDefs: () => mockLoadMcpToolDefs() };
});

const mockLoadConnectorToolPermissions = vi.fn();
vi.mock(
  '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions')
      >();
    return {
      ...actual,
      loadConnectorToolPermissions: (...args: unknown[]) =>
        mockLoadConnectorToolPermissions(...args),
    };
  },
);

const mockLoadUserConnectorToolCatalog = vi.fn();
vi.mock('@/lib/user-connector-tools', () => ({
  loadUserConnectorToolCatalog: (...args: unknown[]) => mockLoadUserConnectorToolCatalog(...args),
  makeUserConnectorExecutor: vi.fn(() => vi.fn()),
}));

vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/routing')>();
  return {
    ...actual,
    classifyTaskLocally: vi.fn(() => ({ type: 'general', confidence: 0.8 })),
    resolveAutoRoute: vi.fn(),
  };
});
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn() },
}));
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  UPGRADE_HREF: '/pricing',
  fingerprintManagedUsageRequest: vi.fn(() => 'request-hash'),
  reserveManagedUsageRequest: vi.fn(),
  markManagedUsageProviderStarted: vi.fn(),
  reserveManagedUsageProviderStep: vi.fn(async () => ({
    operationResult: 'covered',
    estimatedCostCents: 2,
  })),
  finalizeManagedUsageRequest: vi.fn(),
  MANAGED_CHAT_CONTRACT_VERSION: '2026-07-15',
  ManagedUsageRequestError: class ManagedUsageRequestError extends Error {},
  createManagedUsageErrorBody: vi.fn(),
  markManagedUsageClientDelivered: vi.fn(),
  parseManagedUsageIdempotencyKey: vi.fn(),
  resolveManagedQuotaRecovery: vi.fn(),
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    estimateCost: vi.fn(() => 2),
    calculateCost: vi.fn(() => 3),
    calculateCostDollars: vi.fn(() => 0.02),
  },
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: vi.fn(),
  toGenericUpstreamError: vi.fn(),
  buildProtocolRouteAdapter: vi.fn(),
  listAvailableManagedProviderIds: vi.fn(() => new Set()),
  resolveProviderFromModel: vi.fn(() => 'anthropic'),
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: vi.fn(),
}));

import { resolveAutoRoute } from '@agiworkforce/routing';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';
import { buildServerProviderAdapter } from '@/lib/services/provider-adapter-service';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import { executeScheduledAgent } from './scheduled-agent-executor';
import type { ScheduleTask } from './schedule-service';

function requireCatalogModel(predicate: (model: ModelMetadata) => boolean): ModelMetadata {
  const model = listCanonicalModels().find(predicate);
  if (!model) throw new Error('Scheduled tool-access fixture is missing from the model catalog');
  return model;
}

const TOOL_CAPABLE_MODEL = requireCatalogModel(
  (model) => model.provider === 'qwen' && model.capabilities.tools === true,
);
const TOOL_INCAPABLE_MODEL = requireCatalogModel((model) => model.capabilities.tools === false);

function sseStreamFrom(lines: string[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    model: 'fixture-model',
  })}\n\n`;
}

function toolNames(call: unknown): string[] {
  const request = call as { tools?: Array<{ function?: { name?: string } }> };
  return (request.tools ?? [])
    .map((tool) => tool.function?.name)
    .filter((name): name is string => Boolean(name));
}

const task: ScheduleTask = {
  id: 'task-1',
  userId: 'user-1',
  name: 'Morning briefing',
  description: null,
  scheduleType: 'cron',
  cronExpression: '0 9 * * *',
  executeAt: null,
  intervalMs: null,
  timezone: 'UTC',
  isEnabled: true,
  expiresAt: null,
  maxExecutions: null,
  executionCount: 1,
  actionType: 'agent',
  actionConfig: null,
  prompt: 'Search the web for todays AI news and summarise it',
  model: 'auto-balanced',
  status: 'active',
  lastExecutedAt: null,
  nextExecutionAt: null,
  lastError: null,
  metadata: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const executionScope = {
  db: { query: vi.fn() } as never,
  userId: 'user-1',
  organizationId: '11111111-1111-4111-8111-111111111111',
  budgetMs: 40_000,
};

const CONNECTOR_TOOL = {
  qualifiedName: 'mcp__github__list_issues',
  serverId: 'github',
  toolName: 'list_issues',
  description: 'List issues',
  origin: 'connector' as const,
  inputSchema: { type: 'object', properties: {} },
};

function permissions(level?: 'allow' | 'ask' | 'deny') {
  return {
    levelFor: () => level,
    levelForConnectorTool: () => level,
    isDenied: () => level === 'deny',
    isConnectorToolDenied: () => level === 'deny',
    size: level ? 1 : 0,
  };
}

function routeTo(model: ModelMetadata) {
  vi.mocked(resolveAutoRoute).mockReturnValue({
    status: 'selected',
    requestedSelection: 'auto-balanced',
    requestedProfile: 'balanced',
    effectiveProfile: 'balanced',
    taskType: 'general',
    modelKey: model.id,
    provider: model.provider,
    providerModelId: model.id,
    routeId: 'route-1',
    harnessId: 'managed/chat',
    fallbacks: [],
    reason: 'preferred_slot',
  } as never);
}

describe('scheduled agent tool access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PERPLEXITY_API_KEY', 'test-search-key');
    vi.mocked(SubscriptionService.getSubscription).mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
    } as never);
    routeTo(TOOL_CAPABLE_MODEL);
    mockLoadMcpToolDefs.mockResolvedValue([]);
    mockLoadUserConnectorToolCatalog.mockResolvedValue({ tools: [], dropped: [], limit: null });
    mockLoadConnectorToolPermissions.mockResolvedValue(permissions());
    vi.mocked(reserveManagedUsageRequest).mockResolvedValue({
      db: { query: vi.fn() },
      userId: 'user-1',
      idempotencyKey: 'schedule-run:run-1',
      requestHash: 'request-hash',
      leaseToken: 'lease-1',
      estimatedCostCents: 2,
    } as never);
    vi.mocked(markManagedUsageProviderStarted).mockResolvedValue();
    vi.mocked(finalizeManagedUsageRequest).mockResolvedValue({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 3,
    });
    mockBuildToolLoopStream.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('offers a scheduled run the platform web tools and runs the tool it calls', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        sseStreamFrom([
          chunk({
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                function: { name: 'url_fetch', arguments: JSON.stringify({ url: 'x' }) },
              },
            ],
          }),
          chunk({}, 'tool_calls'),
        ]),
      )
      .mockResolvedValueOnce(
        sseStreamFrom([chunk({ content: 'Here is the news.' }), chunk({}, 'stop')]),
      );

    const result = await executeScheduledAgent(
      task,
      new AbortController().signal,
      'run-1',
      executionScope,
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalled();
    const firstRequest = mockBuildToolLoopStream.mock.calls[0]?.[2];
    expect(toolNames(firstRequest)).toEqual(expect.arrayContaining(['web_search', 'url_fetch']));
    expect(result.text).toBe('Here is the news.');
    expect(result.toolsUsed).toContain('url_fetch');
    expect(drainToLlmResponse).not.toHaveBeenCalled();
  });

  it('never offers an MCP or connector tool that has no saved allow verdict', async () => {
    mockLoadUserConnectorToolCatalog.mockResolvedValue({
      tools: [CONNECTOR_TOOL],
      dropped: [],
      limit: null,
    });
    mockBuildToolLoopStream.mockResolvedValue(
      sseStreamFrom([chunk({ content: 'done' }), chunk({}, 'stop')]),
    );

    await executeScheduledAgent(task, new AbortController().signal, 'run-2', executionScope);

    expect(toolNames(mockBuildToolLoopStream.mock.calls[0]?.[2])).not.toContain(
      CONNECTOR_TOOL.qualifiedName,
    );
  });

  it('offers a connector tool the user already pre-approved', async () => {
    mockLoadConnectorToolPermissions.mockResolvedValue(permissions('allow'));
    mockLoadUserConnectorToolCatalog.mockResolvedValue({
      tools: [CONNECTOR_TOOL],
      dropped: [],
      limit: null,
    });
    mockBuildToolLoopStream.mockResolvedValue(
      sseStreamFrom([chunk({ content: 'done' }), chunk({}, 'stop')]),
    );

    await executeScheduledAgent(task, new AbortController().signal, 'run-3', executionScope);

    expect(toolNames(mockBuildToolLoopStream.mock.calls[0]?.[2])).toContain(
      CONNECTOR_TOOL.qualifiedName,
    );
  });

  it('falls back to a single completion when the routed model cannot call tools', async () => {
    routeTo(TOOL_INCAPABLE_MODEL);
    vi.mocked(buildServerProviderAdapter).mockReturnValue({
      stream: vi.fn(() => ({}) as never),
    } as never);
    vi.mocked(drainToLlmResponse).mockResolvedValue({
      model: TOOL_INCAPABLE_MODEL.id,
      content: 'Plain answer',
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });

    const result = await executeScheduledAgent(
      task,
      new AbortController().signal,
      'run-4',
      executionScope,
    );

    expect(mockBuildToolLoopStream).not.toHaveBeenCalled();
    expect(result.text).toBe('Plain answer');
    expect(result.toolsUsed).toBeUndefined();
  });
});
