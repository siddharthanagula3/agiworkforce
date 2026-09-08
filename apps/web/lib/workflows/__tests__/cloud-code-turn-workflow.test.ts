import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStart, mockDurableInitialTurnsEnabled } = vi.hoisted(() => ({
  mockStart: vi.fn(),
  mockDurableInitialTurnsEnabled: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('workflow/api', () => ({ start: mockStart }));
vi.mock('../durable-initial-turns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../durable-initial-turns')>();
  return { ...actual, areDurableInitialTurnsEnabled: mockDurableInitialTurnsEnabled };
});

import {
  parseCloudCodeTurnWorkflowInput,
  type CloudCodeTurnWorkflowInput,
} from '../cloud-code-turn-workflow-input';
import {
  DURABLE_CODE_TURNS_ENV,
  areDurableCodeTurnsEnabled,
  startCloudCodeTurnWorkflow,
} from '../start-cloud-code-turn-workflow';

function workflowInput(
  overrides: Partial<CloudCodeTurnWorkflowInput> = {},
): CloudCodeTurnWorkflowInput {
  return {
    userId: 'user-1',
    organizationId: null,
    runId: '33333333-3333-4333-8333-333333333333',
    sessionId: '11111111-1111-4111-8111-111111111111',
    turnId: '22222222-2222-4222-8222-222222222222',
    goal: 'fix the failing test',
    model: 'a-model',
    provider: 'anthropic',
    planTier: 'pro',
    idempotencyKey: 'turn-key-12345678',
    session: {
      workspacePath: '/home/user/project',
      networkAccess: 'trusted',
      runtimeId: 'codex',
      repositoryUrl: 'https://github.com/acme/widgets.git',
      extraHosts: [],
    },
    ...overrides,
  };
}

const originalFlag = process.env[DURABLE_CODE_TURNS_ENV];

beforeEach(() => {
  vi.clearAllMocks();
  mockDurableInitialTurnsEnabled.mockReturnValue(true);
  mockStart.mockResolvedValue({ runId: 'workflow-run-1' });
  process.env[DURABLE_CODE_TURNS_ENV] = '1';
});

afterEach(() => {
  if (originalFlag === undefined) delete process.env[DURABLE_CODE_TURNS_ENV];
  else process.env[DURABLE_CODE_TURNS_ENV] = originalFlag;
});

describe('the durable Code turn input boundary', () => {
  it('accepts the input the start path builds', () => {
    expect(parseCloudCodeTurnWorkflowInput(workflowInput())).toEqual(workflowInput());
  });

  it('carries the environment the sandbox must be rebuilt with', () => {
    const parsed = parseCloudCodeTurnWorkflowInput(workflowInput());
    expect(parsed.session).toEqual({
      workspacePath: '/home/user/project',
      networkAccess: 'trusted',
      runtimeId: 'codex',
      repositoryUrl: 'https://github.com/acme/widgets.git',
      extraHosts: [],
    });
  });

  it('refuses a field it does not know, rather than carrying it silently', () => {
    expect(() =>
      parseCloudCodeTurnWorkflowInput({
        ...workflowInput(),
        somethingNew: true,
      } as unknown as CloudCodeTurnWorkflowInput),
    ).toThrow();
  });

  it('refuses a network tier that is not one of the three', () => {
    expect(() =>
      parseCloudCodeTurnWorkflowInput(
        workflowInput({
          session: { ...workflowInput().session, networkAccess: 'wide-open' as never },
        }),
      ),
    ).toThrow();
  });

  it('refuses identifiers that are not identifiers', () => {
    for (const broken of [
      { turnId: 'not-a-uuid' },
      { sessionId: '../other-user' },
      { runId: '' },
      { idempotencyKey: 'short' },
    ]) {
      expect(() => parseCloudCodeTurnWorkflowInput(workflowInput(broken as never))).toThrow();
    }
  });
});

describe('choosing a transport for a Code turn', () => {
  it('is off unless the deployment opts in', () => {
    delete process.env[DURABLE_CODE_TURNS_ENV];
    expect(areDurableCodeTurnsEnabled()).toBe(false);
    process.env[DURABLE_CODE_TURNS_ENV] = 'true';
    expect(areDurableCodeTurnsEnabled()).toBe(true);
  });

  it('hands the turn to the runner when it is enabled', async () => {
    await expect(startCloudCodeTurnWorkflow(workflowInput())).resolves.toEqual({
      transport: 'durable',
      workflowRunId: 'workflow-run-1',
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('falls back inline, with a reason, when the deployment has not opted in', async () => {
    delete process.env[DURABLE_CODE_TURNS_ENV];
    await expect(startCloudCodeTurnWorkflow(workflowInput())).resolves.toMatchObject({
      transport: 'inline',
      degradedReason: 'not_enabled',
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('falls back inline when the shared durable kill switch is engaged', async () => {
    mockDurableInitialTurnsEnabled.mockReturnValue(false);
    await expect(startCloudCodeTurnWorkflow(workflowInput())).resolves.toMatchObject({
      transport: 'inline',
      degradedReason: 'kill_switch',
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('falls back inline rather than throwing when the start fails', async () => {
    mockStart.mockRejectedValue(new Error('workflow platform unreachable'));
    await expect(startCloudCodeTurnWorkflow(workflowInput())).resolves.toMatchObject({
      transport: 'inline',
      degradedReason: 'workflow_start_failed',
    });
  });
});

describe('what the durable invocation wires up', () => {
  it('records every provider and workspace call as a durable operation, and reads a stop from either row', async () => {
    vi.resetModules();
    const capture: { execution?: Record<string, unknown> } = {};
    const operation = vi.fn(async (_db: unknown, input: { execute: () => Promise<unknown> }) =>
      input.execute(),
    );
    const stopRequested = vi.fn(async () => true);

    vi.doMock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: vi.fn() }) }));
    vi.doMock('@/lib/server/claimed-user-scope-db', () => ({
      createClaimedUserScopedDb: (db: unknown) => db,
    }));
    vi.doMock('@/lib/services/cloud-code-agent-service', () => ({
      executePersistedAgentTurn: vi.fn(async (execution: Record<string, unknown>) => {
        capture.execution = execution;
        return { turnId: 'turn-1', stopReason: 'done', stepsUsed: 1 };
      }),
    }));
    vi.doMock('@/lib/services/cloud-code-durable-run', () => ({
      isCloudCodeDurableStopRequested: stopRequested,
    }));
    vi.doMock('../cloud-agent-operation-executor', () => ({
      executeCloudAgentOperation: operation,
    }));

    const { executeCloudCodeTurnInvocation } = await import('../cloud-code-turn-workflow');
    await executeCloudCodeTurnInvocation(workflowInput());

    const execution = capture.execution as {
      providerExecutor: (request: unknown) => Promise<unknown>;
      toolExecutor: (request: unknown) => Promise<unknown>;
      isCancellationRequested: () => Promise<boolean>;
      session: unknown;
      signal: AbortSignal;
    };

    expect(execution.session).toEqual(workflowInput().session);
    expect(execution.signal.aborted).toBe(false);

    await execution.providerExecutor({
      operationKey: 'provider:0',
      step: 0,
      execute: async () => ({ text: 'hi', toolCalls: [] }),
    });
    expect(operation.mock.calls[0]?.[1]).toMatchObject({
      operationKey: 'provider:0',
      operationKind: 'provider',
      retrySafety: 'unsafe',
      runId: workflowInput().runId,
    });

    await execution.toolExecutor({
      operationKey: 'tool:1:call-1',
      step: 1,
      toolName: 'read_file',
      args: { path: 'a.ts' },
      retrySafety: 'safe',
      execute: async () => ({ output: 'contents', isError: false }),
    });
    expect(operation.mock.calls[1]?.[1]).toMatchObject({
      operationKey: 'tool:1:call-1',
      operationKind: 'tool',
      retrySafety: 'safe',
    });

    await expect(execution.isCancellationRequested()).resolves.toBe(true);
    expect(stopRequested).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      runId: workflowInput().runId,
      turnId: workflowInput().turnId,
    });

    vi.doUnmock('@/lib/server/neon-db');
    vi.doUnmock('@/lib/server/claimed-user-scope-db');
    vi.doUnmock('@/lib/services/cloud-code-agent-service');
    vi.doUnmock('@/lib/services/cloud-code-durable-run');
    vi.doUnmock('../cloud-agent-operation-executor');
  });
});
