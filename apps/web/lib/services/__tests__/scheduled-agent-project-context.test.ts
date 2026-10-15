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

import { contextSource } from '@agiworkforce/context';
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
  mocks.memoryPolicy = { enabled: false };
  mocks.contextPolicy = {};
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

describe("a scheduled run on a project reads the project's other chats", () => {
  const SIBLING_EXCERPT = 'We settled on credits at 50 per dollar.';

  async function runOnProjectWithChats(searchPastChats: boolean) {
    const engine = await vi.importActual<ScanModule6>('@agiworkforce/context-engine');
    mocks.memoryPolicy = {
      enabled: false,
      generateFromHistory: false,
      allowToolAssistedGeneration: false,
      searchPastChats,
    };
    mocks.contextPolicy = { ...engine.OPEN_ORGANIZATION_CONTEXT_POLICY };
    mocks.resolveContext.mockImplementation(engine.resolveContext);
    mocks.loadProjectContext.mockResolvedValue({
      projectId: PROJECT,
      name: 'Launch',
      description: null,
      instructions: 'Answer tersely.',
      knowledgeFiles: [],
      siblingChats: [{ title: 'Pricing thread', preview: SIBLING_EXCERPT }],
      sources: [
        contextSource({
          sourceClass: 'project_instruction',
          locator: `user_projects/${PROJECT}`,
          projectId: PROJECT,
          ownerUserId: OWNER,
        }),
        contextSource({
          sourceClass: 'project_sibling_chat',
          locator: 'web_conversations/conversation-2',
          projectId: PROJECT,
          ownerUserId: OWNER,
        }),
      ],
    });
    const stream = vi.fn(() => new ReadableStream());
    mocks.buildServerProviderAdapter.mockReturnValue({ stream });

    await run(makeTask({ sources: { project: true, memory: false, web: false } }));

    const resolution = (await mocks.resolveContext.mock.results[0]?.value) as Awaited<
      ReturnType<ScanModule6['resolveContext']>
    >;
    return { sent: JSON.stringify(stream.mock.calls[0]), manifest: resolution.manifest };
  }

  it('sends them when the account searches past chats', async () => {
    const { sent } = await runOnProjectWithChats(true);

    expect(sent).toContain('Answer tersely.');
    expect(sent).toContain(SIBLING_EXCERPT);
  });

  it('leaves them out, and records why, when the account has search past chats off', async () => {
    const { sent, manifest } = await runOnProjectWithChats(false);

    expect(sent).toContain('Answer tersely.');
    expect(sent).not.toContain(SIBLING_EXCERPT);
    expect(
      manifest.entries.find((entry) => entry.sourceClass === 'project_sibling_chat'),
    ).toMatchObject({ includedCount: 0, excluded: [{ reason: 'source_disabled', count: 1 }] });
  });
});
