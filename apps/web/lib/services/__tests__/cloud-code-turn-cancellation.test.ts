import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderAdapter, StreamChunk } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(),
  revokeE2BSessionCredentials: vi.fn(),
}));
vi.mock('@/lib/e2b/session-store', () => ({
  MANAGED_CLOUD_E2B_TENANT_ID: 'managed-cloud',
  managedCloudCodeSessionScope: vi.fn(() => ({ scope: 'test' })),
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: vi.fn(() => ({ stream: vi.fn() })),
  resolveProviderFromModel: vi.fn(() => 'anthropic'),
}));
vi.mock('@/lib/services/cloud-code-agent-runner', () => ({
  createCloudCodeToolRunner: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../managed-usage-request-service')>()),
  fingerprintManagedUsageRequest: vi.fn(() => 'request-hash'),
  reserveManagedUsageRequest: vi.fn(async () => ({ userId: 'user-1', leaseToken: 'lease-1' })),
  reserveManagedUsageProviderStep: vi.fn(async () => ({})),
  markManagedUsageProviderStarted: vi.fn(async () => undefined),
  finalizeManagedUsageRequest: vi.fn(async () => ({})),
}));
vi.mock('../cloud-code-session-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cloud-code-session-service')>()),
  claimCloudCodeSessionForRun: vi.fn(async () => ({ leaseToken: 'lease-1' })),
  releaseCloudCodeSessionAfterRun: vi.fn(async () => ({ state: 'ready' })),
}));

import { getE2BExecutor, revokeE2BSessionCredentials } from '@/lib/e2b/runtime';
import {
  cloudCodeToolRetrySafety,
  runCloudCodeAgentTurn,
  type CloudCodeToolRunner,
} from '../cloud-code-agent-loop';
import {
  CLOUD_CODE_TURN_CANCELLATION,
  executePersistedAgentTurn,
  isCloudCodeTurnCancellationRequested,
  requestCloudCodeTurnCancellation,
} from '../cloud-code-agent-service';
import { CloudCodeConflictError } from '../cloud-code-session-service';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const TURN_ID = '22222222-2222-4222-8222-222222222222';
const OWNER = { userId: 'user-1', organizationId: null };

beforeEach(() => {
  vi.mocked(revokeE2BSessionCredentials).mockResolvedValue({
    sandboxId: 'sbx-1',
    killed: 2,
    survived: 0,
    gateCacheCleared: true,
  });
});

function streamOf(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function adapterYielding(turns: StreamChunk[][]): ProviderAdapter {
  let index = 0;
  return {
    id: 'test-provider',
    stream: vi.fn(() => streamOf(turns[Math.min(index++, turns.length - 1)] ?? [])),
  } as unknown as ProviderAdapter;
}

function toolCallChunks(ids: string[]): StreamChunk[] {
  return ids.flatMap((id) => [
    { type: 'tool-use-start', toolUseId: id, name: 'run_command' },
    { type: 'tool-use-delta', toolUseId: id, deltaJson: JSON.stringify({ command: 'ls' }) },
    { type: 'tool-use-end', toolUseId: id },
  ]) as StreamChunk[];
}

function runner(): CloudCodeToolRunner {
  return {
    readFile: vi.fn(async () => ({ output: '', isError: false })),
    listFiles: vi.fn(async () => ({ output: '', isError: false })),
    runCommand: vi.fn(async () => ({ output: 'ran', isError: false })),
    runSharedExecutionTool: vi.fn(async () => ({ output: '', isError: false })),
  };
}

describe('the agent loop observes a stop it was never signalled about', () => {
  it('stops between steps without starting the next provider call', async () => {
    const adapter = adapterYielding([toolCallChunks(['call-1'])]);
    let cancelled = false;

    const result = await runCloudCodeAgentTurn({
      adapter,
      model: 'test-model',
      goal: 'do the thing',
      runner: runner(),
      signal: new AbortController().signal,
      isCancelled: () => cancelled,
      onEvent: async () => {
        cancelled = true;
      },
    });

    expect(result.stopReason).toBe('cancelled');
    expect(adapter.stream).toHaveBeenCalledTimes(1);
  });

  it('stops between the tool calls of one step, leaving the rest unrun', async () => {
    const toolRunner = runner();
    let cancelled = false;

    const result = await runCloudCodeAgentTurn({
      adapter: adapterYielding([toolCallChunks(['call-1', 'call-2', 'call-3'])]),
      model: 'test-model',
      goal: 'do the thing',
      runner: toolRunner,
      signal: new AbortController().signal,
      isCancelled: () => cancelled,
      onEvent: async (event) => {
        if (event.type === 'tool-end') cancelled = true;
      },
    });

    expect(result.stopReason).toBe('cancelled');
    expect(toolRunner.runCommand).toHaveBeenCalledTimes(1);
  });

  it('runs to completion when no stop was asked for', async () => {
    const result = await runCloudCodeAgentTurn({
      adapter: adapterYielding([[{ type: 'text-delta', delta: 'all done' } as StreamChunk]]),
      model: 'test-model',
      goal: 'do the thing',
      runner: runner(),
      signal: new AbortController().signal,
      isCancelled: () => false,
    });

    expect(result.stopReason).toBe('done');
    expect(result.finalMessage).toBe('all done');
  });
});

function runRow() {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: 'user-1',
    request_id: 'turn-key-12345678',
    conversation_id: null,
    origin_surface: 'web',
    work_mode: 'agiwork',
    state: 'running',
    provider: 'anthropic',
    model: 'a-model',
    last_event_sequence: -1,
    cancellation_requested_at: '2026-09-07T20:00:00.000Z',
    completed_at: null,
    created_at: '2026-09-07T19:00:00.000Z',
    updated_at: '2026-09-07T20:00:00.000Z',
  };
}

describe('requestCloudCodeTurnCancellation', () => {
  let queries: { sql: string; params: unknown[] }[] = [];

  function db(rows: Record<string, unknown>[]) {
    return {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        // The stop mirror looks for a durable run by the turn's key; these
        // cases are all inline turns, which have none.
        if (/from public\.cloud_agent_runs/.test(sql)) return [];
        return rows;
      }),
    };
  }

  beforeEach(() => {
    queries = [];
  });

  it('records the stop against the running turn of the session', async () => {
    const result = await requestCloudCodeTurnCancellation(
      db([
        {
          id: TURN_ID,
          idempotency_key: 'turn-key-12345678',
          cancel_requested_at: '2026-09-07T20:00:00.000Z',
        },
      ]) as never,
      OWNER,
      SESSION_ID,
    );

    expect(result).toEqual({
      turnId: TURN_ID,
      requestedAt: '2026-09-07T20:00:00.000Z',
      durable: false,
      processesStopped: 2,
      credentialsRevoked: true,
    });
    expect(queries[0]?.sql).toContain('cancel_requested_at = coalesce(cancel_requested_at, now())');
    expect(queries[0]?.sql).toContain('user_id = $2');
    expect(queries[0]?.params).toEqual([
      SESSION_ID,
      'user-1',
      null,
      ['running', 'awaiting_approval'],
      null,
    ]);
  });

  it('keeps the first request time when stop is pressed twice', async () => {
    await requestCloudCodeTurnCancellation(
      db([{ id: TURN_ID, cancel_requested_at: '2026-09-07T20:00:00.000Z' }]) as never,
      OWNER,
      SESSION_ID,
    );
    expect(queries[0]?.sql).not.toContain('cancel_requested_at = now()');
  });

  it('mirrors the stop onto the durable run that is carrying the turn', async () => {
    const adapter = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        if (/public\.cloud_agent_runs/.test(sql)) return [runRow()];
        return [
          {
            id: TURN_ID,
            idempotency_key: 'turn-key-12345678',
            cancel_requested_at: '2026-09-07T20:00:00.000Z',
          },
        ];
      }),
    };

    const result = await requestCloudCodeTurnCancellation(adapter as never, OWNER, SESSION_ID);

    expect(result.durable).toBe(true);
    expect(queries.some((call) => /update public\.cloud_agent_runs/.test(call.sql))).toBe(true);
  });

  it('refuses when nothing is running', async () => {
    await expect(
      requestCloudCodeTurnCancellation(db([]) as never, OWNER, SESSION_ID),
    ).rejects.toBeInstanceOf(CloudCodeConflictError);
  });

  it('scopes the read of the request to the turn and its owner', async () => {
    await expect(
      isCloudCodeTurnCancellationRequested(
        db([{ cancel_requested_at: '2026-09-07T20:00:00.000Z' }]) as never,
        OWNER,
        TURN_ID,
      ),
    ).resolves.toBe(true);
    expect(queries[0]?.sql).toContain('id = $1 and user_id = $2');
    expect(queries[0]?.params).toEqual([TURN_ID, 'user-1', null]);
  });

  it('reads no request as no stop', async () => {
    await expect(
      isCloudCodeTurnCancellationRequested(
        db([{ cancel_requested_at: null }]) as never,
        OWNER,
        TURN_ID,
      ),
    ).resolves.toBe(false);
  });
});

describe('a stop reaches the sandbox, not just the turn row', () => {
  function db() {
    return {
      query: vi.fn(async (sql: string) => {
        if (/from public\.cloud_agent_runs/.test(sql)) return [];
        return [{ id: TURN_ID, idempotency_key: 'k-12345678', cancel_requested_at: new Date(0) }];
      }),
    };
  }

  it('kills the sandbox processes the turn had in flight', async () => {
    await requestCloudCodeTurnCancellation(db() as never, OWNER, SESSION_ID);

    expect(revokeE2BSessionCredentials).toHaveBeenCalledWith({
      tenantId: 'managed-cloud',
      userId: 'user-1',
      resource: { kind: 'code_session', id: SESSION_ID },
    });
  });

  it('still records the stop when the sandbox cannot be reached', async () => {
    vi.mocked(revokeE2BSessionCredentials).mockRejectedValueOnce(new Error('sandbox gone'));

    const result = await requestCloudCodeTurnCancellation(db() as never, OWNER, SESSION_ID);

    expect(result.turnId).toBe(TURN_ID);
    expect(result.processesStopped).toBe(0);
    expect(result.credentialsRevoked).toBe(false);
  });

  it('does not claim to have recalled what is already outside the sandbox', () => {
    expect(CLOUD_CODE_TURN_CANCELLATION.partialOutputRetained).toBe(true);
    expect(CLOUD_CODE_TURN_CANCELLATION.cannotBeStopped).toContain(
      'a branch the turn already pushed, or a pull request it already opened',
    );
  });
});

describe('a turn that stops short leaves its work reviewable', () => {
  const WORKSPACE = '/workspace/repo';
  const DIRTY_STATUS = ' M src/index.ts\n?? src/new.ts\n';

  function gitResult(stdout: string) {
    return { ok: true, output: stdout, stdout, stderr: '', exitCode: 0 };
  }

  function executor(status: string) {
    return {
      pause: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
      git: {
        status: vi.fn(async () => gitResult(status)),
        add: vi.fn(async () => gitResult('')),
        commit: vi.fn(async () => gitResult('committed')),
      },
    };
  }

  function turnDb() {
    const writes: { sql: string; params: unknown[] }[] = [];
    return {
      writes,
      adapter: {
        query: vi.fn(async (sql: string, params: unknown[]) => {
          writes.push({ sql, params });
          return [{ id: TURN_ID, step_index: 0 }];
        }),
      },
    };
  }

  async function runStoppedTurn(sandbox: ReturnType<typeof executor>) {
    const aborted = new AbortController();
    aborted.abort();
    const db = turnDb();
    vi.mocked(getE2BExecutor).mockResolvedValue(sandbox as never);

    const outcome = await executePersistedAgentTurn({
      db: db.adapter as never,
      owner: OWNER,
      session: {
        networkAccess: 'none',
        runtimeId: null,
        workspacePath: WORKSPACE,
        repositoryUrl: 'https://github.test/acme/repo.git',
      },
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      goal: 'do the thing',
      model: 'a-model',
      provider: 'anthropic',
      planTier: 'pro',
      idempotencyKey: 'k-12345678',
      signal: aborted.signal,
      priorMessages: [],
    });
    return { outcome, db };
  }

  it('commits what it changed before the sandbox is handed back', async () => {
    const sandbox = executor(DIRTY_STATUS);
    const { outcome } = await runStoppedTurn(sandbox);

    expect(sandbox.git.add).toHaveBeenCalledWith({ path: WORKSPACE, all: true });
    expect(sandbox.git.commit).toHaveBeenCalledWith(
      expect.objectContaining({ path: WORKSPACE, message: expect.stringContaining(TURN_ID) }),
    );
    const commitOrder = sandbox.git.commit.mock.invocationCallOrder[0] ?? 0;
    const pauseOrder = sandbox.pause.mock.invocationCallOrder[0] ?? 0;
    expect(commitOrder).toBeLessThan(pauseOrder);
    expect(outcome.stopReason).toBe('cancelled');
  });

  it('tells the reader the partial work is still there', async () => {
    const { outcome } = await runStoppedTurn(executor(DIRTY_STATUS));

    expect(outcome.errorMessage).toContain('2 files');
    expect(outcome.errorMessage).toContain('still there to review');
  });

  it('commits nothing when the turn changed nothing', async () => {
    const sandbox = executor('');
    const { outcome } = await runStoppedTurn(sandbox);

    expect(sandbox.git.commit).not.toHaveBeenCalled();
    expect(outcome.errorMessage).not.toContain('still there to review');
  });

  it('never reports a stopped turn as a success', async () => {
    const { outcome, db } = await runStoppedTurn(executor(DIRTY_STATUS));

    expect(outcome.stopReason).toBe('cancelled');
    const terminal = db.writes.find((write) => /set state = \$2/.test(write.sql));
    expect(terminal?.params[1]).toBe('cancelled');
  });
});

describe('the loop performs provider and tool calls through an injectable executor', () => {
  it('performs them directly when no executor is given, which is the inline path', async () => {
    const toolRunner = runner();
    const result = await runCloudCodeAgentTurn({
      adapter: adapterYielding([
        toolCallChunks(['call-1']),
        [{ type: 'text-delta', delta: 'done' } as StreamChunk],
      ]),
      model: 'test-model',
      goal: 'do the thing',
      runner: toolRunner,
      signal: new AbortController().signal,
    });

    expect(result.stopReason).toBe('done');
    expect(toolRunner.runCommand).toHaveBeenCalledTimes(1);
  });

  it('routes the provider call through the executor with a stable key', async () => {
    const providerExecutor = vi.fn(async (request) => request.execute());
    await runCloudCodeAgentTurn({
      adapter: adapterYielding([[{ type: 'text-delta', delta: 'done' } as StreamChunk]]),
      model: 'test-model',
      goal: 'do the thing',
      runner: runner(),
      signal: new AbortController().signal,
      providerExecutor,
    });

    expect(providerExecutor).toHaveBeenCalledTimes(1);
    expect(providerExecutor.mock.calls[0]?.[0]).toMatchObject({
      operationKey: 'provider:0',
      step: 0,
    });
  });

  it('routes a tool call through the executor and classifies its retry safety', async () => {
    const toolExecutor = vi.fn(async (request) => request.execute());
    await runCloudCodeAgentTurn({
      adapter: adapterYielding([
        toolCallChunks(['call-1']),
        [{ type: 'text-delta', delta: 'done' } as StreamChunk],
      ]),
      model: 'test-model',
      goal: 'do the thing',
      runner: runner(),
      signal: new AbortController().signal,
      toolExecutor,
    });

    expect(toolExecutor.mock.calls[0]?.[0]).toMatchObject({
      operationKey: 'tool:1:call-1',
      toolName: 'run_command',
      retrySafety: 'unsafe',
    });
  });

  it('lets the executor answer from a record instead of running the tool again', async () => {
    const toolRunner = runner();
    const result = await runCloudCodeAgentTurn({
      adapter: adapterYielding([
        toolCallChunks(['call-1']),
        [{ type: 'text-delta', delta: 'done' } as StreamChunk],
      ]),
      model: 'test-model',
      goal: 'do the thing',
      runner: toolRunner,
      signal: new AbortController().signal,
      toolExecutor: async () => ({ output: 'replayed from the ledger', isError: false }),
    });

    expect(result.stopReason).toBe('done');
    expect(toolRunner.runCommand).not.toHaveBeenCalled();
  });

  it('calls a refusal a refusal, without recording it as a step that touched anything', async () => {
    const toolExecutor = vi.fn(async (request) => request.execute());
    await runCloudCodeAgentTurn({
      adapter: adapterYielding([
        [
          { type: 'tool-use-start', toolUseId: 'call-x', name: 'not_a_tool' },
          { type: 'tool-use-delta', toolUseId: 'call-x', deltaJson: '{}' },
          { type: 'tool-use-end', toolUseId: 'call-x' },
        ] as StreamChunk[],
        [{ type: 'text-delta', delta: 'done' } as StreamChunk],
      ]),
      model: 'test-model',
      goal: 'do the thing',
      runner: runner(),
      signal: new AbortController().signal,
      toolExecutor,
    });

    expect(toolExecutor).not.toHaveBeenCalled();
  });
});

describe('retry safety of a Code tool', () => {
  it('is safe for a read and unsafe for anything that runs in the workspace', () => {
    expect(cloudCodeToolRetrySafety('read_file')).toBe('safe');
    expect(cloudCodeToolRetrySafety('list_files')).toBe('safe');
    expect(cloudCodeToolRetrySafety('run_command')).toBe('unsafe');
    expect(cloudCodeToolRetrySafety('execute_code')).toBe('unsafe');
  });
});
