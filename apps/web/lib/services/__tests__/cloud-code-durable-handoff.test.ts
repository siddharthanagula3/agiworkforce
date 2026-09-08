import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSession,
  mockOpenDurableRun,
  mockStartWorkflow,
  mockListTurns,
  mockResolveProvider,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOpenDurableRun: vi.fn(),
  mockStartWorkflow: vi.fn(),
  mockListTurns: vi.fn(),
  mockResolveProvider: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('workflow/api', () => ({ start: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/e2b/runtime', () => ({ getE2BExecutor: vi.fn(), killE2BSession: vi.fn() }));
vi.mock('@/lib/e2b/session-store', () => ({
  managedCloudCodeSessionScope: vi.fn(() => ({ scope: 'test' })),
  CHAT_SANDBOX_NETWORK_ACCESS: 'trusted',
  deleteE2BSession: vi.fn(),
  getE2BSession: vi.fn(),
  saveE2BSession: vi.fn(),
  withUserSandboxLock: vi.fn(),
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: vi.fn(() => ({ stream: vi.fn() })),
  resolveProviderFromModel: mockResolveProvider,
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return { ...actual, getCloudCodeSession: mockGetSession, listCloudCodeAgentTurns: mockListTurns };
});
vi.mock('@/lib/services/cloud-code-durable-run', () => ({
  openCloudCodeDurableRun: mockOpenDurableRun,
  mirrorCloudCodeStopOntoDurableRun: vi.fn(),
  isCloudCodeDurableStopRequested: vi.fn(),
  findCloudCodeDurableRunId: vi.fn(),
  CLOUD_CODE_RUN_ORIGIN_SURFACE: 'web',
  CLOUD_CODE_RUN_WORK_MODE: 'agiwork',
}));
vi.mock('@/lib/workflows/start-cloud-code-turn-workflow', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/workflows/start-cloud-code-turn-workflow')>();
  return { ...actual, startCloudCodeTurnWorkflow: mockStartWorkflow };
});
vi.mock('@/lib/workflows/cloud-code-turn-workflow', () => ({
  cloudCodeTurnWorkflow: vi.fn(),
  executeCloudCodeTurnInvocation: vi.fn(),
}));

import { DURABLE_CODE_TURNS_ENV } from '@/lib/workflows/start-cloud-code-turn-workflow';
import { CloudCodeTurnStillRunningError, runCloudCodeTurn } from '../cloud-code-turn-transport';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const TURN_ID = '22222222-2222-4222-8222-222222222222';
const OWNER = { userId: 'user-1', organizationId: null };
const IDEMPOTENCY_KEY = '44444444-4444-4444-8444-444444444444';

function db() {
  return { query: vi.fn(async () => [{ id: TURN_ID }]) };
}

function startTurn(adapter: ReturnType<typeof db>) {
  return runCloudCodeTurn({
    db: adapter as never,
    owner: OWNER,
    sessionId: SESSION_ID,
    goal: 'fix the failing test',
    model: 'a-model',
    planTier: 'pro',
    idempotencyKey: IDEMPOTENCY_KEY,
    signal: new AbortController().signal,
  });
}

function finishedTurn(overrides: Record<string, unknown> = {}) {
  return {
    turnId: TURN_ID,
    goal: 'fix the failing test',
    stopReason: 'done',
    stepsUsed: 3,
    inputTokens: 100,
    outputTokens: 20,
    cancelRequestedAt: null,
    finalMessage: 'renamed the fixture',
    errorMessage: null,
    createdAt: '2026-09-08T00:00:00.000Z',
    steps: [],
    ...overrides,
  };
}

const originalFlag = process.env[DURABLE_CODE_TURNS_ENV];

beforeEach(() => {
  vi.clearAllMocks();
  process.env[DURABLE_CODE_TURNS_ENV] = '1';
  mockResolveProvider.mockReturnValue('anthropic');
  mockGetSession.mockResolvedValue({
    state: 'ready',
    archivedAt: null,
    workspacePath: '/home/user/project',
    networkAccess: 'trusted',
    runtimeId: 'codex',
    repositoryUrl: 'https://github.com/acme/widgets.git',
    extraHosts: [],
  });
  mockOpenDurableRun.mockResolvedValue({ runId: '33333333-3333-4333-8333-333333333333' });
  mockStartWorkflow.mockResolvedValue({ transport: 'durable', workflowRunId: 'workflow-run-1' });
  mockListTurns.mockResolvedValue([finishedTurn()]);
});

afterEach(() => {
  if (originalFlag === undefined) delete process.env[DURABLE_CODE_TURNS_ENV];
  else process.env[DURABLE_CODE_TURNS_ENV] = originalFlag;
});

describe('handing a Code turn to the durable runner', () => {
  it('opens the run before starting the workflow, and passes the environment the turn started under', async () => {
    await startTurn(db());

    expect(mockOpenDurableRun).toHaveBeenCalledWith(expect.anything(), OWNER, {
      turnId: TURN_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      provider: 'anthropic',
      model: 'a-model',
    });
    expect(mockStartWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: '33333333-3333-4333-8333-333333333333',
        turnId: TURN_ID,
        session: {
          workspacePath: '/home/user/project',
          networkAccess: 'trusted',
          runtimeId: 'codex',
          repositoryUrl: 'https://github.com/acme/widgets.git',
          extraHosts: [],
        },
      }),
    );
  });

  it('answers with the turn the durable run finished, in the shape the surface already reads', async () => {
    await expect(startTurn(db())).resolves.toMatchObject({
      turnId: TURN_ID,
      stopReason: 'done',
      stepsUsed: 3,
      inputTokens: 100,
      finalMessage: 'renamed the fixture',
    });
  });

  it('keeps waiting while the turn has not reached a stop reason', async () => {
    mockListTurns
      .mockResolvedValueOnce([finishedTurn({ stopReason: null })])
      .mockResolvedValueOnce([finishedTurn()]);

    await expect(startTurn(db())).resolves.toMatchObject({ stopReason: 'done' });
    expect(mockListTurns).toHaveBeenCalledTimes(2);
  });

  it('says the turn is still running rather than reporting a turn that timed out', async () => {
    mockListTurns.mockResolvedValue([finishedTurn({ stopReason: null })]);
    const signal = AbortSignal.abort();

    await expect(
      runCloudCodeTurn({
        db: db() as never,
        owner: OWNER,
        sessionId: SESSION_ID,
        goal: 'fix the failing test',
        model: 'a-model',
        planTier: 'pro',
        idempotencyKey: IDEMPOTENCY_KEY,
        signal,
      }),
    ).rejects.toBeInstanceOf(CloudCodeTurnStillRunningError);
  });

  it('runs the turn request-scoped when the workflow refuses it', async () => {
    mockStartWorkflow.mockResolvedValue({
      transport: 'inline',
      workflowRunId: null,
      degradedReason: 'workflow_start_failed',
    });

    await startTurn(db()).catch(() => undefined);
    expect(mockListTurns).not.toHaveBeenCalled();
  });

  it('runs the turn request-scoped when opening the run throws', async () => {
    mockOpenDurableRun.mockRejectedValue(new Error('database unreachable'));

    await startTurn(db()).catch(() => undefined);
    expect(mockStartWorkflow).not.toHaveBeenCalled();
    expect(mockListTurns).not.toHaveBeenCalled();
  });

  it('does not reach the durable runner at all when the deployment has not opted in', async () => {
    delete process.env[DURABLE_CODE_TURNS_ENV];

    await startTurn(db()).catch(() => undefined);
    expect(mockOpenDurableRun).not.toHaveBeenCalled();
    expect(mockStartWorkflow).not.toHaveBeenCalled();
  });
});
