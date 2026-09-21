import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

vi.mock('@/lib/services/project-context-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/project-context-service')>()),
  loadProjectContext: mocks.loadProjectContext,
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  reserveManagedUsageRequest: mocks.reserveManagedUsageRequest,
  finalizeManagedUsageRequest: mocks.finalizeManagedUsageRequest,
  markManagedUsageProviderStarted: mocks.markManagedUsageProviderStarted,
}));

vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/provider-adapter-service')>()),
  buildServerProviderAdapter: mocks.buildServerProviderAdapter,
}));

vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/app/api/llm/v1/chat/completions/lib/adapter-response')
  >()),
  drainToLlmResponse: mocks.drainToLlmResponse,
}));

vi.mock('@/lib/services/subscription-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/subscription-service')>();
  return {
    ...actual,
    SubscriptionService: { ...actual.SubscriptionService, getSubscription: mocks.getSubscription },
  };
});

vi.mock('@/lib/services/managed-compute-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-compute-access')>()),
  evaluateManagedComputeAccess: mocks.evaluateManagedComputeAccess,
}));

vi.mock('@agiworkforce/context-engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/context-engine')>()),
  createPostgresContextManifestStore: () => ({}),
  resolveContext: mocks.resolveContext,
}));

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-memory-context-service')>()),
  formatManagedMemorySystemPrompt: () => null,
  loadManagedMemoryPolicy: async () => ({ enabled: false }),
  loadOrganizationContextPolicy: async () => ({}),
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
  ...(await importOriginal<
    typeof import('@/app/api/llm/v1/chat/completions/lib/tool-loop-routing')
  >()),
  classifyToolLoopInputs: () => ({ shouldRun: false }),
}));

vi.mock('@agiworkforce/routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/routing')>()),
  resolveAutoRoute: mocks.resolveAutoRoute,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { requireProviderDefaultModel } from '@agiworkforce/types';
import {
  ScheduledProjectContextUnavailableError,
  executeScheduledAgent,
} from '../scheduled-agent-executor';
import type { ScheduleTask } from '../schedule-service';

const OWNER = 'user-owner';
const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeTask(overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id: 'task-1',
    userId: OWNER,
    name: 'Morning brief',
    description: null,
    scheduleType: 'cron',
    cronExpression: '0 8 * * *',
    executeAt: null,
    intervalMs: null,
    timezone: 'UTC',
    isEnabled: true,
    expiresAt: null,
    maxExecutions: null,
    executionCount: 3,
    actionType: 'agent',
    actionConfig: null,
    prompt: 'Summarise what changed since yesterday.',
    model: null,
    status: 'active',
    lastExecutedAt: null,
    nextExecutionAt: null,
    lastError: null,
    metadata: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    projectId: PROJECT,
    ...overrides,
  } as ScheduleTask;
}

function makeScope() {
  return {
    userId: OWNER,
    organizationId: null,
    db: { query: vi.fn(async () => []), execute: vi.fn(async () => undefined) },
  } as unknown as Parameters<typeof executeScheduledAgent>[3];
}

function run(task: ScheduleTask) {
  return executeScheduledAgent(task, new AbortController().signal, 'run-1', makeScope());
}

const ROUTED_MODEL = requireProviderDefaultModel('openai');

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
  mocks.buildServerProviderAdapter.mockReturnValue({ stream: () => new ReadableStream() });
  mocks.drainToLlmResponse.mockResolvedValue({
    content: 'Here is the brief.',
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
  });
});

describe('a scheduled run bound to a project it cannot read', () => {
  it('refuses before calling a model when the project is deleted', async () => {
    mocks.loadProjectContext.mockResolvedValue(null);

    await expect(run(makeTask())).rejects.toBeInstanceOf(ScheduledProjectContextUnavailableError);

    expect(mocks.buildServerProviderAdapter).not.toHaveBeenCalled();
    expect(mocks.drainToLlmResponse).not.toHaveBeenCalled();
  });

  it('takes no usage reservation, so there is none left to release', async () => {
    mocks.loadProjectContext.mockResolvedValue(null);

    await expect(run(makeTask())).rejects.toThrow(ScheduledProjectContextUnavailableError);

    expect(mocks.reserveManagedUsageRequest).not.toHaveBeenCalled();
    expect(mocks.markManagedUsageProviderStarted).not.toHaveBeenCalled();
    expect(mocks.finalizeManagedUsageRequest).not.toHaveBeenCalled();
  });

  it('carries the declared reason code and names the project it could not read', async () => {
    mocks.loadProjectContext.mockResolvedValue(null);

    const error = await run(makeTask()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ScheduledProjectContextUnavailableError);
    const refusal = error as ScheduledProjectContextUnavailableError;
    expect(refusal.code).toBe('RESOURCE_DELETED');
    expect(refusal.projectId).toBe(PROJECT);
    expect(refusal.message).toMatch(/before it called a model/);
  });

  it('refuses a project in another workspace the same way', async () => {
    mocks.loadProjectContext.mockResolvedValue(null);

    await expect(
      run(makeTask({ projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })),
    ).rejects.toBeInstanceOf(ScheduledProjectContextUnavailableError);
    expect(mocks.drainToLlmResponse).not.toHaveBeenCalled();
  });

  it('refuses a project the owner can no longer read, without resolving any context', async () => {
    mocks.loadProjectContext.mockResolvedValue(null);

    await expect(run(makeTask())).rejects.toBeInstanceOf(ScheduledProjectContextUnavailableError);

    expect(mocks.resolveContext).not.toHaveBeenCalled();
  });
});

describe('every other scheduled run is unchanged', () => {
  it('runs a task with no project at all', async () => {
    const result = await run(makeTask({ projectId: null }));

    expect(mocks.loadProjectContext).not.toHaveBeenCalled();
    expect(result.text).toBe('Here is the brief.');
    expect(mocks.reserveManagedUsageRequest).toHaveBeenCalledTimes(1);
  });

  it('runs a task whose project still loads', async () => {
    mocks.loadProjectContext.mockResolvedValue({
      projectId: PROJECT,
      name: 'Launch',
      description: null,
      instructions: 'Answer tersely.',
      knowledgeFiles: [],
      siblingChats: [],
      sources: [],
    });

    const result = await run(makeTask());

    expect(mocks.loadProjectContext).toHaveBeenCalledWith(expect.anything(), {
      projectId: PROJECT,
      userId: OWNER,
    });
    expect(result.text).toBe('Here is the brief.');
    expect(mocks.reserveManagedUsageRequest).toHaveBeenCalledTimes(1);
  });
});
