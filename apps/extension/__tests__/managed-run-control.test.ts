import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ManagedCloudAgentRunHttpError,
  AgentEventEnvelopeSchema,
  AGENT_EVENT_SCHEMA_VERSION,
  createManagedCloudAgentRunClient,
  readManagedCloudAgentRunHandle,
  MANAGED_CLOUD_AGENT_RUN_ID_HEADER,
  MANAGED_CLOUD_AGENT_RUN_URL_HEADER,
  MANAGED_CLOUD_TOOL_LOOP_HEADER,
  MANAGED_CLOUD_TOOL_LOOP_DURABLE,
} from '@agiworkforce/cloud-contracts';
import type {
  ManagedCloudAgentRunClient,
  ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import {
  ALL_MANAGED_RUN_STATES,
  MANAGED_RUN_CANCELLATION_CONFIRMATION_TIMEOUT_MS,
  RESUMED_RUN_BROWSER_STEP_MESSAGE,
  cancelChromeManagedRun,
  cancelAndConfirmChromeManagedRun,
  findChromeManagedRunByRequestId,
  listChromeManagedRuns,
  resumeChromeManagedRun,
  assertChromeManagedCallerRun,
  type ChromeManagedRunDependencies,
} from '../src/features/cloud-bridge/managedRunControl';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const reference: ManagedCloudAgentRunReference = {
  runId: RUN_ID,
  runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
  lastSequence: 1,
  state: 'running',
};

function dependencies(client: ManagedCloudAgentRunClient): ChromeManagedRunDependencies {
  return {
    getAuthToken: vi.fn(async () => 'token-1'),
    createClient: vi.fn(() => client),
  };
}

function completedRun() {
  return {
    id: RUN_ID,
    userId: 'user-1',
    requestId: 'request-1',
    conversationId: null,
    originSurface: 'chrome' as const,
    workMode: 'agiwork' as const,
    state: 'completed' as const,
    provider: 'openai',
    model: 'model-1',
    lastEventSequence: 3,
    cancellationRequestedAt: null,
    completedAt: '2026-07-17T20:00:00.000Z',
    createdAt: '2026-07-17T19:00:00.000Z',
    updatedAt: '2026-07-17T20:00:00.000Z',
  };
}

afterEach(() => vi.useRealTimers());

describe('Chrome managed run control', () => {
  it.each(['completed', 'awaiting_input'] as const)(
    'distinguishes %s from a pending canonical caller boundary',
    async (state) => {
      const client: ManagedCloudAgentRunClient = {
        listRuns: vi.fn(),
        getRun: vi.fn(),
        cancelRun: vi.fn(),
        followRun: vi.fn(async (_id, options) => {
          await options?.onEvent?.(
            AgentEventEnvelopeSchema.parse({
              schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
              sessionId: 'fixture-session',
              turnId: 'fixture-turn',
              sequence: 0,
              emittedAtMs: 1000,
              event: {
                type: 'caller-tools-requested',
                nextEventSequence: 3,
                calls: [
                  {
                    id: 'fixture-call',
                    type: 'function',
                    function: { name: 'original_fixture_tool', arguments: '{}' },
                  },
                ],
              },
            }),
          );
          return {
            run: {
              ...completedRun(),
              state,
              completedAt: state === 'completed' ? completedRun().completedAt : null,
            },
            lastSequence: 3,
          };
        }),
      };
      const result = await resumeChromeManagedRun(
        {
          run: reference,
          alreadyVisibleText: '',
          originalCallerToolNames: ['original_fixture_tool'],
        },
        dependencies(client),
      );
      expect(result.status).toBe(state === 'completed' ? 'success' : 'error');
      if (result.status === 'error') expect(result.message).not.toContain('Send the request again');
    },
  );

  it('does not confuse an acknowledged caller boundary with a later hosted approval', async () => {
    const events = [
      {
        type: 'caller-tools-requested',
        nextEventSequence: 3,
        calls: [
          {
            id: 'fixture-call',
            type: 'function',
            function: { name: 'original_fixture_tool', arguments: '{}' },
          },
        ],
      },
      { type: 'task-state-changed', taskId: 'fixture-turn', state: 'awaiting_input' },
      { type: 'lifecycle', phase: 'paused' },
      { type: 'lifecycle', phase: 'resumed' },
      { type: 'task-state-changed', taskId: 'fixture-turn', state: 'awaiting_approval' },
    ];
    const client: ManagedCloudAgentRunClient = {
      listRuns: vi.fn(),
      getRun: vi.fn(),
      cancelRun: vi.fn(),
      followRun: vi.fn(async (_id, options) => {
        for (const [sequence, event] of events.entries())
          await options?.onEvent?.(
            AgentEventEnvelopeSchema.parse({
              schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
              sessionId: 'fixture-session',
              turnId: 'fixture-turn',
              emittedAtMs: 1000 + sequence,
              sequence,
              event,
            }),
          );
        return {
          run: {
            ...completedRun(),
            state: 'awaiting_approval',
            completedAt: null,
            lastEventSequence: 4,
          },
          lastSequence: 4,
        };
      }),
    };
    expect(
      (
        await resumeChromeManagedRun(
          {
            run: reference,
            alreadyVisibleText: '',
            originalCallerToolNames: ['original_fixture_tool'],
          },
          dependencies(client),
        )
      ).status,
    ).toBe('success');
  });

  it('reads legacy journal calls against the captured original names before auth yields', async () => {
    const names = ['original_fixture_tool'];
    const events = [
      { type: 'tool-use-start', toolUseId: 'fixture-call', name: names[0] },
      { type: 'tool-use-delta', toolUseId: 'fixture-call', deltaJson: '{}' },
      { type: 'tool-use-end', toolUseId: 'fixture-call' },
      { type: 'stop', reason: 'tool-use' },
    ];
    const client: ManagedCloudAgentRunClient = {
      listRuns: vi.fn(),
      getRun: vi.fn(),
      cancelRun: vi.fn(),
      followRun: vi.fn(async (_id, options) => {
        for (const [sequence, event] of events.entries())
          await options?.onEvent?.(
            AgentEventEnvelopeSchema.parse({
              schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
              sessionId: 'fixture-session',
              turnId: 'fixture-turn',
              emittedAtMs: 1000 + sequence,
              sequence,
              event,
            }),
          );
        return {
          run: { ...completedRun(), state: 'awaiting_input', completedAt: null },
          lastSequence: 4,
        };
      }),
    };
    const result = await resumeChromeManagedRun(
      { run: reference, alreadyVisibleText: '', originalCallerToolNames: names },
      {
        ...dependencies(client),
        getAuthToken: async () => {
          names[0] = 'changed_after_admission';
          return 'fixture-token';
        },
      },
    );
    expect(result).toEqual({
      status: 'error',
      code: 'protocol_error',
      message: RESUMED_RUN_BROWSER_STEP_MESSAGE,
    });
  });

  it('settles a resumed run that stopped for a browser step with a one-line Retry explanation', async () => {
    const events = [
      { type: 'tool-use-start', toolUseId: 'call-1', name: 'browser_read_page' },
      { type: 'tool-use-delta', toolUseId: 'call-1', deltaJson: '{}' },
      { type: 'tool-use-end', toolUseId: 'call-1' },
      { type: 'stop', reason: 'tool-use' },
    ];
    const client: ManagedCloudAgentRunClient = {
      listRuns: vi.fn(),
      getRun: vi.fn(),
      cancelRun: vi.fn(),
      followRun: vi.fn(async (_id, options) => {
        for (const [sequence, event] of events.entries())
          await options?.onEvent?.(
            AgentEventEnvelopeSchema.parse({
              schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
              sessionId: 'session-1',
              turnId: 'turn-1',
              emittedAtMs: 1000 + sequence,
              sequence,
              event,
            }),
          );
        return {
          run: { ...completedRun(), state: 'awaiting_input', completedAt: null },
          lastSequence: 3,
        };
      }),
    };

    const result = await resumeChromeManagedRun(
      { run: reference, alreadyVisibleText: '' },
      dependencies(client),
    );

    expect(result).toEqual({
      status: 'error',
      code: 'protocol_error',
      message: RESUMED_RUN_BROWSER_STEP_MESSAGE,
    });
    expect(RESUMED_RUN_BROWSER_STEP_MESSAGE).not.toContain('\n');
  });

  it('returns a structured failure when recovery credentials cannot refresh', async () => {
    const client: ManagedCloudAgentRunClient = {
      listRuns: vi.fn(),
      getRun: vi.fn(),
      cancelRun: vi.fn(),
      followRun: vi.fn(),
    };
    expect(
      await resumeChromeManagedRun(
        { run: reference, alreadyVisibleText: '' },
        {
          ...dependencies(client),
          getAuthToken: async () => {
            throw new Error('offline');
          },
        },
      ),
    ).toMatchObject({ status: 'error', code: 'server_error' });
    expect(client.followRun).not.toHaveBeenCalled();
  });

  it('classifies HTTP 401 as an auth boundary failure', async () => {
    const client: ManagedCloudAgentRunClient = {
      listRuns: vi.fn(),
      getRun: vi.fn(),
      followRun: vi.fn().mockRejectedValue(new ManagedCloudAgentRunHttpError('rejected', 401)),
      cancelRun: vi.fn().mockRejectedValue(new ManagedCloudAgentRunHttpError('rejected', 401)),
    };

    await expect(
      resumeChromeManagedRun({ run: reference, alreadyVisibleText: '' }, dependencies(client)),
    ).resolves.toMatchObject({ status: 'error', code: 'auth_required' });
    await expect(cancelChromeManagedRun(reference, dependencies(client))).resolves.toMatchObject({
      status: 'error',
      code: 'auth_required',
    });
  });

  it('never reads a 403 without a reason as a lost sign-in', async () => {
    const client: ManagedCloudAgentRunClient = {
      listRuns: vi.fn(),
      getRun: vi.fn(),
      followRun: vi.fn().mockRejectedValue(new ManagedCloudAgentRunHttpError('rejected', 403)),
      cancelRun: vi.fn().mockRejectedValue(new ManagedCloudAgentRunHttpError('rejected', 403)),
    };

    const resumed = await resumeChromeManagedRun(
      { run: reference, alreadyVisibleText: '' },
      dependencies(client),
    );
    expect(resumed).toMatchObject({ status: 'error', code: 'invalid_request' });
    expect(resumed).not.toMatchObject({ code: 'auth_required' });
    await expect(cancelChromeManagedRun(reference, dependencies(client))).resolves.toMatchObject({
      status: 'error',
      code: 'invalid_request',
    });
  });

  describe('a refusal from the server keeps its own reason', () => {
    function serverAnswering(
      status: number,
      body: unknown,
      headers: Record<string, string> = {},
    ): Partial<ChromeManagedRunDependencies> {
      return {
        getAuthToken: vi.fn(async () => 'token-1'),
        fetchImpl: vi.fn(async () => Response.json(body, { status, headers })),
      };
    }

    it("shows a workspace policy in the administrator's words when resuming and cancelling", async () => {
      const policy =
        'Your workspace administrator has turned off AGI Cloud in the Chrome extension.';
      const body = {
        error: { type: 'organization_policy', code: 'surface_not_allowed', message: policy },
      };
      await expect(
        resumeChromeManagedRun(
          { run: reference, alreadyVisibleText: '' },
          serverAnswering(403, body),
        ),
      ).resolves.toEqual({ status: 'error', code: 'policy_blocked', message: policy });
      await expect(cancelChromeManagedRun(reference, serverAnswering(403, body))).resolves.toEqual({
        status: 'error',
        code: 'policy_blocked',
        message: policy,
      });
    });

    it('tells a plan limit and an account gate apart from a sign-in', async () => {
      const plan = 'Background tasks are not included in this plan.';
      await expect(
        listChromeManagedRuns(
          10,
          serverAnswering(403, { error: { code: 'SUBSCRIPTION_REQUIRED', message: plan } }),
        ),
      ).resolves.toEqual({ status: 'error', code: 'plan_required', message: plan });

      const gate = 'This account is not available right now.';
      await expect(
        listChromeManagedRuns(
          10,
          serverAnswering(403, { error: { code: 'ACCOUNT_UNAVAILABLE', message: gate } }),
        ),
      ).resolves.toEqual({ status: 'error', code: 'account_suspended', message: gate });
    });

    it('reads a 503 as a short outage with the wait the server asked for', async () => {
      await expect(
        listChromeManagedRuns(
          10,
          serverAnswering(
            503,
            { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' } },
            { 'retry-after': '5' },
          ),
        ),
      ).resolves.toEqual({
        status: 'error',
        code: 'server_error',
        message: 'AGI Cloud is temporarily unavailable. Try again in 5 seconds.',
        retryAfterSeconds: 5,
      });
    });
  });

  it('replays the exact durable journal from the beginning without duplicating visible text', async () => {
    const onText = vi.fn();
    const onAgentEvent = vi.fn();
    const onRunReference = vi.fn();
    const client: ManagedCloudAgentRunClient = {
      listRuns: vi.fn(),
      getRun: vi.fn(),
      cancelRun: vi.fn(),
      followRun: vi.fn(async (_runId, options) => {
        await options?.onEvent?.({
          schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
          sessionId: 'session-1',
          turnId: 'turn-1',
          sequence: 0,
          emittedAtMs: 1_000,
          event: { type: 'text-delta', delta: 'Hello' },
        });
        await options?.onEvent?.({
          schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
          sessionId: 'session-1',
          turnId: 'turn-1',
          sequence: 1,
          emittedAtMs: 1_001,
          event: {
            type: 'progress-update',
            progressId: 'research',
            summary: 'Searching sources',
            status: 'running',
          },
        });
        await options?.onEvent?.({
          schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
          sessionId: 'session-1',
          turnId: 'turn-1',
          sequence: 2,
          emittedAtMs: 1_002,
          event: { type: 'text-delta', delta: ' world' },
        });
        return { run: completedRun(), lastSequence: 3 };
      }),
    };

    const result = await resumeChromeManagedRun(
      { run: reference, alreadyVisibleText: 'Hello' },
      { ...dependencies(client), onText, onAgentEvent, onRunReference },
    );

    expect(client.followRun).toHaveBeenCalledWith(
      RUN_ID,
      expect.objectContaining({ afterSequence: -1 }),
    );
    expect(onText).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith(' world');
    expect(onAgentEvent).toHaveBeenCalledTimes(3);
    expect(onRunReference).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'completed', lastSequence: 3 }),
    );
    expect(result).toEqual({ status: 'success' });
  });

  it('rejects a foreign stored run path before reading authentication', async () => {
    const deps = dependencies({
      listRuns: vi.fn(),
      getRun: vi.fn(),
      cancelRun: vi.fn(),
      followRun: vi.fn(),
    });

    const result = await resumeChromeManagedRun(
      {
        run: { ...reference, runPath: 'https://attacker.example/run' },
        alreadyVisibleText: '',
      },
      deps,
    );

    expect(result).toMatchObject({ status: 'error', code: 'invalid_request' });
    expect(deps.getAuthToken).not.toHaveBeenCalled();
  });

  it('cancels the server-owned run instead of only aborting the browser reader', async () => {
    const cancelRun = vi.fn(async () => ({
      ...completedRun(),
      state: 'cancelled' as const,
      completedAt: null,
      cancellationRequestedAt: '2026-07-17T20:01:00.000Z',
    }));
    const result = await cancelChromeManagedRun(
      reference,
      dependencies({ listRuns: vi.fn(), getRun: vi.fn(), followRun: vi.fn(), cancelRun }),
    );

    expect(cancelRun).toHaveBeenCalledWith(RUN_ID, { signal: expect.any(AbortSignal) });
    expect(result).toMatchObject({ status: 'success', run: { state: 'cancelled' } });
  });

  it('follows an actual detachable response reference after202 until a terminal owned snapshot is observed', async () => {
    const handle = readManagedCloudAgentRunHandle(
      new Response('', {
        headers: {
          [MANAGED_CLOUD_AGENT_RUN_ID_HEADER]: RUN_ID,
          [MANAGED_CLOUD_AGENT_RUN_URL_HEADER]: reference.runPath,
          [MANAGED_CLOUD_TOOL_LOOP_HEADER]: MANAGED_CLOUD_TOOL_LOOP_DURABLE,
        },
      }),
    )!;
    const actualReference = { ...handle, lastSequence: 3 };
    expect(actualReference).not.toHaveProperty('state');
    const requested = {
      ...completedRun(),
      state: 'running' as const,
      lastEventSequence: 3,
      completedAt: null,
      cancellationRequestedAt: '2026-07-17T20:01:00.000Z',
    };
    const stopped = { ...requested, state: 'cancelled' as const, lastEventSequence: 6 };
    let deliverTerminal!: (response: Response) => void;
    const terminal = new Promise<Response>((resolve) => {
      deliverTerminal = resolve;
    });
    const requests: Array<{
      path: string;
      method: string;
      token: string | null;
      signal: AbortSignal | null | undefined;
    }> = [];
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({
        path,
        method: init?.method ?? 'GET',
        token: new Headers(init?.headers).get('Authorization'),
        signal: init?.signal,
      });
      return init?.method === 'POST'
        ? Response.json({ run: requested }, { status: 202 })
        : terminal;
    });
    const getAuthToken = vi.fn(async () => 'captured-owner-token');
    const createClient = vi.fn((token: string) =>
      createManagedCloudAgentRunClient({
        baseUrl: 'https://qa.example',
        getAuthToken: async () => token,
        fetchImpl,
      }),
    );
    let resolved = false;
    const result = cancelChromeManagedRun(actualReference, { getAuthToken, createClient }).then(
      (value) => {
        resolved = true;
        return value;
      },
    );
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(resolved).toBe(false);
    expect(requests.map((request) => request.method)).toEqual(['POST', 'GET']);
    expect(requests.every((request) => request.token === 'Bearer captured-owner-token')).toBe(true);
    expect(requests[0]!.signal).toBe(requests[1]!.signal);
    expect(requests[0]!.signal?.aborted).toBe(false);
    deliverTerminal(Response.json({ run: stopped, events: [], nextAfterSequence: 3 }));
    expect(await result).toMatchObject({
      status: 'success',
      run: { id: RUN_ID, state: 'cancelled', lastEventSequence: 6 },
    });
    expect(getAuthToken).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledOnce();
  });

  it('does not mistake a nonterminal follow boundary for confirmed cancellation', async () => {
    const requested = { ...completedRun(), state: 'running' as const };
    const followRun = vi.fn(async () => ({
      run: { ...requested, state: 'needs_approval' as const },
      lastSequence: 4,
    }));
    const result = await cancelChromeManagedRun(
      reference,
      dependencies({
        listRuns: vi.fn(),
        getRun: vi.fn(),
        cancelRun: vi.fn(async () => requested),
        followRun,
      }),
    );
    expect(result).toMatchObject({
      status: 'error',
      code: 'server_error',
      message: expect.stringContaining('without confirming'),
    });
  });

  it.each(['run', 'owner'] as const)(
    'rejects a changed %s during cancellation confirmation',
    async (changed) => {
      const requested = { ...completedRun(), state: 'running' as const };
      const stopped = {
        ...requested,
        state: 'cancelled' as const,
        ...(changed === 'run'
          ? { id: '22222222-2222-4222-8222-222222222222' }
          : { userId: 'other-user' }),
      };
      const result = await cancelChromeManagedRun(
        reference,
        dependencies({
          listRuns: vi.fn(),
          getRun: vi.fn(),
          cancelRun: vi.fn(async () => requested),
          followRun: vi.fn(async () => ({ run: stopped, lastSequence: 4 })),
        }),
      );
      expect(result).toMatchObject({
        status: 'error',
        message: expect.stringContaining('run or owner'),
      });
    },
  );

  it('bounds confirmation without allowing a late terminal callback to report success', async () => {
    vi.useFakeTimers();
    let finish!: (value: { run: ReturnType<typeof completedRun>; lastSequence: number }) => void;
    const followRun = vi.fn(
      () =>
        new Promise<{ run: ReturnType<typeof completedRun>; lastSequence: number }>((resolve) => {
          finish = resolve;
        }),
    );
    const operation = cancelChromeManagedRun(
      reference,
      dependencies({
        listRuns: vi.fn(),
        getRun: vi.fn(),
        cancelRun: vi.fn(async () => ({ ...completedRun(), state: 'running' as const })),
        followRun,
      }),
    );
    await vi.waitFor(() => expect(followRun).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(MANAGED_RUN_CANCELLATION_CONFIRMATION_TIMEOUT_MS);
    expect(await operation).toMatchObject({
      status: 'error',
      code: 'server_error',
      message: expect.stringContaining('deadline'),
    });
    expect(followRun.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    finish({ run: completedRun(), lastSequence: 4 });
    await Promise.resolve();
    expect(followRun).toHaveBeenCalledOnce();
  });

  it('finds a Chrome run through an exact tenant-scoped request id filter', async () => {
    const listRuns = vi.fn().mockResolvedValueOnce({
      runs: [completedRun()],
      nextCursor: null,
    });
    const client: ManagedCloudAgentRunClient = {
      listRuns,
      getRun: vi.fn(),
      followRun: vi.fn(),
      cancelRun: vi.fn(),
    };

    const result = await findChromeManagedRunByRequestId('request-1', dependencies(client));

    const allManagedRunStates = [...ALL_MANAGED_RUN_STATES];
    expect(listRuns).toHaveBeenCalledOnce();
    expect(listRuns).toHaveBeenCalledWith({
      states: allManagedRunStates,
      requestId: 'request-1',
      limit: 1,
      signal: undefined,
    });
    expect(result).toEqual({
      runId: RUN_ID,
      runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
      lastSequence: -1,
      state: 'completed',
      cancellationRequestedAt: null,
    });
  });

  it('treats only a terminal empty exact request lookup as authoritative absence', async () => {
    const listRuns = vi.fn().mockResolvedValueOnce({ runs: [], nextCursor: null });
    const client: ManagedCloudAgentRunClient = {
      listRuns,
      getRun: vi.fn(),
      followRun: vi.fn(),
      cancelRun: vi.fn(),
    };

    await expect(
      findChromeManagedRunByRequestId('request-1', dependencies(client)),
    ).resolves.toBeNull();
    expect(listRuns).toHaveBeenCalledOnce();
  });

  it('rejects a continuation cursor on an exact request lookup', async () => {
    const listRuns = vi.fn().mockResolvedValueOnce({ runs: [], nextCursor: 'unexpected-page' });
    const client: ManagedCloudAgentRunClient = {
      listRuns,
      getRun: vi.fn(),
      followRun: vi.fn(),
      cancelRun: vi.fn(),
    };

    await expect(
      findChromeManagedRunByRequestId('request-1', dependencies(client)),
    ).rejects.toThrow('invalid continuation cursor');
  });

  it('forwards recovery cancellation to the exact request lookup', async () => {
    const controller = new AbortController();
    const listRuns = vi.fn().mockImplementationOnce(async () => {
      controller.abort();
      throw new DOMException('Cancelled.', 'AbortError');
    });
    const client: ManagedCloudAgentRunClient = {
      listRuns,
      getRun: vi.fn(),
      followRun: vi.fn(),
      cancelRun: vi.fn(),
    };

    const pending = findChromeManagedRunByRequestId(
      'request-1',
      dependencies(client),
      controller.signal,
    );

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(listRuns).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
  });

  it('rejects a malformed recovery identity before reading auth', async () => {
    const deps = dependencies({
      listRuns: vi.fn(),
      getRun: vi.fn(),
      followRun: vi.fn(),
      cancelRun: vi.fn(),
    });

    await expect(findChromeManagedRunByRequestId('bad key', deps)).rejects.toThrow(
      'Invalid Managed Cloud request identity',
    );
    expect(deps.getAuthToken).not.toHaveBeenCalled();
  });
});

describe('Chrome Stop authoritative terminal confirmation', () => {
  function json(value: unknown): Response {
    return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  }
  it('follows an accepted running cancellation to the authoritative terminal snapshot', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json({ run: { ...completedRun(), state: 'running', completedAt: null } }),
      )
      .mockResolvedValueOnce(
        json({ run: { ...completedRun(), state: 'cancelled' }, events: [], nextAfterSequence: 3 }),
      );
    const client = createManagedCloudAgentRunClient({ fetchImpl });
    await expect(
      cancelAndConfirmChromeManagedRun(reference, dependencies(client)),
    ).resolves.toMatchObject({ status: 'success', run: { state: 'cancelled' } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]![0]).toBe(reference.runPath);
    expect(fetchImpl.mock.calls[0]![1]?.method).toBe('POST');
    expect(fetchImpl.mock.calls[1]![0]).toContain(RUN_ID);
    expect(fetchImpl.mock.calls[1]![1]?.method).not.toBe('POST');
  });
  it('refuses a nonterminal paused follow boundary', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json({ run: { ...completedRun(), state: 'running', completedAt: null } }),
      )
      .mockResolvedValueOnce(
        json({
          run: { ...completedRun(), state: 'paused', completedAt: null },
          events: [],
          nextAfterSequence: 3,
        }),
      );
    await expect(
      cancelAndConfirmChromeManagedRun(
        reference,
        dependencies(createManagedCloudAgentRunClient({ fetchImpl })),
      ),
    ).resolves.toMatchObject({ status: 'error', code: 'server_error' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('aborts the real confirmation read without inventing a terminal result', async () => {
    const controller = new AbortController();
    let readSignal: AbortSignal | null | undefined;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json({ run: { ...completedRun(), state: 'running', completedAt: null } }),
      )
      .mockImplementationOnce((_url: string, options?: RequestInit) => {
        readSignal = options?.signal;
        return new Promise((_resolve, reject) =>
          readSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          ),
        );
      });
    const result = cancelAndConfirmChromeManagedRun(
      reference,
      dependencies(createManagedCloudAgentRunClient({ fetchImpl })),
      controller.signal,
    );
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    expect(readSignal?.aborted).toBe(false);
    controller.abort();
    await expect(result).resolves.toMatchObject({ status: 'error', code: 'server_error' });
    expect(readSignal?.aborted).toBe(true);
  });
});

describe('authoritative caller checkpoint inspection', () => {
  const calls = [
    {
      id: 'fixture-call',
      type: 'function' as const,
      function: { name: 'original_fixture_tool', arguments: '{}' },
    },
  ];
  const checkpoint = {
    schema_version: AGENT_EVENT_SCHEMA_VERSION,
    run_id: RUN_ID,
    turn_id: 'fixture-turn',
    next_event_sequence: 8,
    calls,
  };
  const event = (sequence: number, value: unknown) =>
    AgentEventEnvelopeSchema.parse({
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: 'fixture-session',
      turnId: 'fixture-turn',
      sequence,
      emittedAtMs: 1000 + sequence,
      event: value,
    });
  function clientFor(
    state: 'awaiting_input' | 'completed' | 'cancelled' = 'awaiting_input',
    complete = true,
  ) {
    const events = [
      event(5, { type: 'caller-tools-requested', calls, nextEventSequence: 8 }),
      event(6, {
        type: 'task-state-changed',
        taskId: 'fixture-turn',
        state: 'awaiting_input',
        summary: 'Browser work',
      }),
      ...(complete ? [event(7, { type: 'lifecycle', phase: 'paused' })] : []),
    ];
    const last = complete ? 7 : 6;
    const fetchImpl = vi.fn(
      async (input: string | URL | Request) =>
        new Response(
          JSON.stringify({
            run: {
              ...completedRun(),
              requestId: 'fixture-request',
              state,
              lastEventSequence: last,
              completedAt: state === 'completed' ? completedRun().completedAt : null,
            },
            events: events.filter(
              (event) =>
                event.sequence >
                Number(
                  new URL(
                    typeof input === 'string'
                      ? input
                      : input instanceof URL
                        ? input.href
                        : input.url,
                  ).searchParams.get('after') ?? -1,
                ),
            ),
            nextAfterSequence: last,
            hasMore: false,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    return {
      client: createManagedCloudAgentRunClient({
        baseUrl: 'https://example.test',
        getAuthToken: async () => 'fixture-token',
        fetchImpl,
      }),
      fetchImpl,
    };
  }
  it('exposes a complete current caller boundary using the saved offering', async () => {
    const h = clientFor(),
      onCallerCheckpoint = vi.fn();
    const result = await resumeChromeManagedRun(
      {
        run: reference,
        alreadyVisibleText: '',
        originalCallerToolNames: ['original_fixture_tool'],
      },
      { ...dependencies(h.client), onCallerCheckpoint },
    );
    expect(result.status).toBe('error');
    expect(onCallerCheckpoint).toHaveBeenCalledExactlyOnceWith(checkpoint);
  });
  it.each(['completed', 'cancelled'] as const)(
    'does not dispatch historical caller work from a %s run',
    async (state) => {
      const h = clientFor(state),
        onCallerCheckpoint = vi.fn();
      await resumeChromeManagedRun(
        {
          run: reference,
          alreadyVisibleText: '',
          originalCallerToolNames: ['original_fixture_tool'],
        },
        { ...dependencies(h.client), onCallerCheckpoint },
      );
      expect(onCallerCheckpoint).not.toHaveBeenCalled();
    },
  );
  it('does not expose an incomplete pause boundary', async () => {
    const h = clientFor('awaiting_input', false),
      onCallerCheckpoint = vi.fn();
    expect(
      (
        await resumeChromeManagedRun(
          {
            run: reference,
            alreadyVisibleText: '',
            originalCallerToolNames: ['original_fixture_tool'],
          },
          { ...dependencies(h.client), onCallerCheckpoint },
        )
      ).status,
    ).toBe('error');
    expect(onCallerCheckpoint).not.toHaveBeenCalled();
  });
  it('checks live run state and original request identity immediately before an effect', async () => {
    const h = clientFor();
    await assertChromeManagedCallerRun(
      checkpoint,
      { requestId: 'fixture-request', conversationId: null },
      dependencies(h.client),
    );
    await expect(
      assertChromeManagedCallerRun(
        checkpoint,
        { requestId: 'another-request', conversationId: null },
        dependencies(h.client),
      ),
    ).rejects.toThrow('checkpoint changed');
    expect(h.fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('refuses a run attached to another cloud conversation', async () => {
    const h = clientFor();
    await expect(
      assertChromeManagedCallerRun(
        checkpoint,
        { requestId: 'fixture-request', conversationId: '33333333-3333-4333-8333-333333333333' },
        dependencies(h.client),
      ),
    ).rejects.toThrow('checkpoint changed');
  });
  it('snapshots checkpoint and request identity before credential refresh yields', async () => {
    const h = clientFor(),
      input = structuredClone(checkpoint),
      identity = { requestId: 'fixture-request', conversationId: null };
    const deps = dependencies(h.client);
    vi.mocked(deps.getAuthToken).mockImplementationOnce(async () => {
      input.next_event_sequence = 9;
      identity.requestId = 'another-request';
      return 'fixture-token';
    });
    await assertChromeManagedCallerRun(input, identity, deps);
    expect(String(h.fetchImpl.mock.calls[0]![0])).toContain('after=7');
  });
  it.each(['completed', 'cancelled'] as const)(
    'refuses an effect after a live %s state',
    async (state) => {
      const h = clientFor(state);
      await expect(
        assertChromeManagedCallerRun(
          checkpoint,
          { requestId: 'fixture-request', conversationId: null },
          dependencies(h.client),
        ),
      ).rejects.toThrow('run stopped');
    },
  );
});
