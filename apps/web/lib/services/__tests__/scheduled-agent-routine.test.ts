import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/services/project-context-service');
type ScanModule1 = typeof import('@/lib/services/managed-usage-request-service');
type ScanModule2 = typeof import('@/lib/services/provider-adapter-service');
type ScanModule3 = typeof import('@/app/api/llm/v1/chat/completions/lib/adapter-response');
type ScanModule4 = typeof import('@/lib/services/subscription-service');
type ScanModule5 = typeof import('@/lib/services/managed-compute-access');
type ScanModule6 = typeof import('@agiworkforce/context-engine');
type ScanModule7 = typeof import('@/lib/services/managed-memory-context-service');
type ScanModule8 = typeof import('@/app/api/llm/v1/chat/completions/lib/tool-loop-routing');
type ScanModule9 = typeof import('@agiworkforce/routing');
type ScanModule10 = typeof import('@/lib/agents/agent-turn-config');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  resolveAutoRoute: vi.fn(),
  loadProjectContext: vi.fn(),
  reserveManagedUsageRequest: vi.fn(),
  finalizeManagedUsageRequest: vi.fn(),
  markManagedUsageProviderStarted: vi.fn(),
  buildServerProviderAdapter: vi.fn(),
  drainToLlmResponse: vi.fn(),
  getSubscription: vi.fn(),
  evaluateManagedComputeAccess: vi.fn(),
  resolveContext: vi.fn(),
  loadAgentTurnConfig: vi.fn(),
  memoryPolicy: { enabled: false } as Record<string, boolean>,
  contextPolicy: {} as Record<string, boolean>,
}));

vi.mock('@/lib/services/project-context-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  loadProjectContext: mocks.loadProjectContext,
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  reserveManagedUsageRequest: mocks.reserveManagedUsageRequest,
  finalizeManagedUsageRequest: mocks.finalizeManagedUsageRequest,
  markManagedUsageProviderStarted: mocks.markManagedUsageProviderStarted,
}));

vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  buildServerProviderAdapter: mocks.buildServerProviderAdapter,
}));

vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  drainToLlmResponse: mocks.drainToLlmResponse,
}));

vi.mock('@/lib/services/subscription-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule4>();
  return {
    ...actual,
    SubscriptionService: { ...actual.SubscriptionService, getSubscription: mocks.getSubscription },
  };
});

vi.mock('@/lib/services/managed-compute-access', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  evaluateManagedComputeAccess: mocks.evaluateManagedComputeAccess,
}));

vi.mock('@agiworkforce/context-engine', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  createPostgresContextManifestStore: () => ({ write: async () => undefined }),
  resolveContext: mocks.resolveContext,
}));

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  formatManagedMemorySystemPrompt: () => null,
  loadManagedMemoryPolicy: async () => mocks.memoryPolicy,
  loadOrganizationContextPolicy: async () => mocks.contextPolicy,
  loadProjectMemoryScope: async () => ({ projectId: null, usesGlobalMemory: true }),
  managedMemoryContextLoader: () => ({
    sourceClass: 'managed_memory',
    budgetChars: 0,
    load: async () => [],
  }),
}));

// The project gate sits before either provider path; the single-shot completion
// is the cheaper of the two to drive here.
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop-routing', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  classifyToolLoopInputs: () => ({ shouldRun: false }),
}));

vi.mock('@agiworkforce/routing', async (importOriginal) => ({
  ...(await importOriginal<ScanModule9>()),
  resolveAutoRoute: mocks.resolveAutoRoute,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/agents/agent-turn-config', async (importOriginal) => ({
  ...(await importOriginal<ScanModule10>()),
  loadAgentTurnConfig: mocks.loadAgentTurnConfig,
}));

import { requireProviderDefaultModel } from '@agiworkforce/types';
import { ScheduledAgentUnavailableError, executeScheduledAgent } from '../scheduled-agent-executor';
import type { ScheduleTask } from '../schedule-service';

const OWNER = 'user-owner';
const AGENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ROUTED_MODEL = requireProviderDefaultModel('openai');

function makeTask(overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id: 'task-1',
    userId: OWNER,
    name: 'Weekly notes',
    description: null,
    scheduleType: 'cron',
    cronExpression: '0 8 * * 1',
    executeAt: null,
    intervalMs: null,
    timezone: 'UTC',
    isEnabled: true,
    expiresAt: null,
    maxExecutions: null,
    executionCount: 0,
    actionType: 'agent',
    actionConfig: null,
    prompt: 'Write this week’s release notes.',
    model: null,
    status: 'active',
    lastExecutedAt: null,
    nextExecutionAt: null,
    lastError: null,
    metadata: null,
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
    projectId: null,
    agentId: AGENT,
    ...overrides,
  } as ScheduleTask;
}

function run(task: ScheduleTask) {
  return executeScheduledAgent(task, new AbortController().signal, 'run-1', {
    userId: OWNER,
    organizationId: null,
    db: { query: vi.fn(async () => []), execute: vi.fn(async () => undefined) },
  } as unknown as Parameters<typeof executeScheduledAgent>[3]);
}

const stream = vi.fn(() => new ReadableStream());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAutoRoute.mockReturnValue({
    status: 'selected',
    requestedSelection: 'auto',
    requestedProfile: null,
    effectiveProfile: null,
    taskType: 'general',
    modelKey: ROUTED_MODEL,
    provider: 'openai',
    providerModelId: ROUTED_MODEL,
    routeId: 'test-route',
    harnessId: 'web/cloud-chat',
    fallbacks: [],
    reason: 'explicit',
  });
  mocks.getSubscription.mockResolvedValue({ plan_tier: 'pro' });
  mocks.evaluateManagedComputeAccess.mockResolvedValue({ allowed: true, code: 'allowed' });
  mocks.resolveContext.mockResolvedValue({
    itemsOf: () => [],
    items: [],
    manifest: { entries: [] },
  });
  mocks.reserveManagedUsageRequest.mockResolvedValue({
    db: {},
    userId: OWNER,
    idempotencyKey: 'schedule-run:run-1',
  });
  mocks.finalizeManagedUsageRequest.mockResolvedValue({ requestStatus: 'completed' });
  mocks.buildServerProviderAdapter.mockReturnValue({ stream });
  mocks.drainToLlmResponse.mockResolvedValue({
    content: 'Here are the notes.',
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
  });
});

describe('a routine that runs as an agent', () => {
  it('stops before any model call or reservation when the agent is paused', async () => {
    mocks.loadAgentTurnConfig.mockResolvedValue({
      ok: false,
      code: 'agent_paused',
      message: 'Release notes writer is paused. Its owner can resume it from Agents.',
    });

    await expect(run(makeTask())).rejects.toBeInstanceOf(ScheduledAgentUnavailableError);
    expect(mocks.loadAgentTurnConfig).toHaveBeenCalledWith(expect.anything(), OWNER, AGENT);
    expect(mocks.reserveManagedUsageRequest).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
  });

  it('does not run once the agent has used its daily budget', async () => {
    mocks.loadAgentTurnConfig.mockResolvedValue({
      ok: false,
      code: 'agent_turn_limit',
      message: 'Release notes writer has reached its limit of 3 messages a day set by its owner.',
    });
    await expect(run(makeTask())).rejects.toBeInstanceOf(ScheduledAgentUnavailableError);
    expect(stream).not.toHaveBeenCalled();
  });

  it('fails closed when the agent cannot be read', async () => {
    mocks.loadAgentTurnConfig.mockRejectedValue(new Error('database unavailable'));
    await expect(run(makeTask())).rejects.toThrow('database unavailable');
    expect(stream).not.toHaveBeenCalled();
  });

  it('runs with the agent’s instructions in front of the routine prompt', async () => {
    mocks.loadAgentTurnConfig.mockResolvedValue({
      ok: true,
      turn: {
        agentId: AGENT,
        files: [],
        config: {
          name: 'Release notes writer',
          description: '',
          icon: 'sparkles',
          accentColor: 'zinc',
          instructions: 'Group changes by area and lead with what users notice.',
          outputExamples: '',
          conversationStarters: [],
          model: null,
          webSearch: false,
          codeExecution: false,
          imageGeneration: true,
          connectorIds: [],
          skillNames: null,
          dailyTurnLimit: null,
        },
      },
    });

    const result = await run(makeTask());
    expect(result.text.startsWith('Here are the notes.')).toBe(true);
    const sent = JSON.stringify(stream.mock.calls[0]);
    expect(sent).toContain('Group changes by area and lead with what users notice.');
    expect(sent).toContain('Release notes writer');
  });

  it('leaves a routine without an agent untouched', async () => {
    await run(makeTask({ agentId: null }));
    expect(mocks.loadAgentTurnConfig).not.toHaveBeenCalled();
    expect(JSON.stringify(stream.mock.calls[0])).not.toContain('You are running as');
  });
});
