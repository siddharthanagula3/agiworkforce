import { describe, expect, it, vi } from 'vitest';
import {
  ManagedCloudAgentRunAbortError,
  ManagedCloudAgentRunContractError,
  ManagedCloudAgentRunReferenceSchema,
  createManagedCloudAgentRunClient,
  reconcileManagedCloudPublicText,
  readManagedCloudAgentRunHandle,
} from '../managed-cloud-agent-runs-client';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

function run(state = 'running', lastEventSequence = 1) {
  return {
    id: RUN_ID,
    userId: 'user-1',
    requestId: 'request-1',
    conversationId: 'conversation-1',
    originSurface: 'desktop',
    workMode: 'agiwork',
    state,
    provider: 'openai',
    model: 'model-1',
    lastEventSequence,
    cancellationRequestedAt: null,
    completedAt: state === 'completed' ? '2026-07-17T20:00:00.000Z' : null,
    createdAt: '2026-07-17T19:00:00.000Z',
    updatedAt: '2026-07-17T20:00:00.000Z',
  };
}

function event(sequence: number) {
  return {
    schemaVersion: 4,
    sessionId: 'session-1',
    turnId: 'turn-1',
    sequence,
    emittedAtMs: 1_000 + sequence,
    event: {
      type: 'progress-update',
      progressId: `progress-${sequence}`,
      summary: `Step ${sequence}`,
      status: 'running',
    },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('managed Cloud agent-run client', () => {
  it('validates only canonical serializable run references', () => {
    expect(
      ManagedCloudAgentRunReferenceSchema.parse({
        runId: RUN_ID,
        runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
        lastSequence: 7,
        state: 'running',
        cancellationRequestedAt: null,
      }),
    ).toMatchObject({ runId: RUN_ID, lastSequence: 7, state: 'running' });

    expect(() =>
      ManagedCloudAgentRunReferenceSchema.parse({
        runId: RUN_ID,
        runPath: 'https://attacker.example/run',
        lastSequence: 7,
      }),
    ).toThrow();
  });

  it('reconciles exact and partially overlapping public text across reconnect', () => {
    expect(reconcileManagedCloudPublicText('Already visible', 'Already visible')).toEqual({
      pending: '',
      unmatchedIncoming: '',
    });
    expect(reconcileManagedCloudPublicText('Hello ', 'Hello world')).toEqual({
      pending: '',
      unmatchedIncoming: 'world',
    });
    expect(reconcileManagedCloudPublicText('Hello world', 'Hello ')).toEqual({
      pending: 'world',
      unmatchedIncoming: '',
    });
    expect(reconcileManagedCloudPublicText('different', 'new text')).toEqual({
      pending: 'different',
      unmatchedIncoming: 'new text',
    });
  });

  it('reads a validated same-origin run handle from completion response headers', () => {
    const response = new Response(null, {
      headers: {
        'X-AGI-Agent-Run-Id': RUN_ID,
        'X-AGI-Agent-Run-URL': `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
      },
    });

    expect(readManagedCloudAgentRunHandle(response)).toEqual({
      runId: RUN_ID,
      runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
    });
  });

  it('rejects a foreign or mismatched run URL instead of following an untrusted header', () => {
    const response = new Response(null, {
      headers: {
        'X-AGI-Agent-Run-Id': RUN_ID,
        'X-AGI-Agent-Run-URL': 'https://attacker.invalid/runs/other',
      },
    });

    expect(() => readManagedCloudAgentRunHandle(response)).toThrow(
      ManagedCloudAgentRunContractError,
    );
  });

  it('fetches cursor pages with auth and runtime-validates the response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ run: run(), events: [event(1)], nextAfterSequence: 1 }),
    );
    const client = createManagedCloudAgentRunClient({
      baseUrl: 'https://agi.example',
      getAuthToken: async () => 'token-1',
      fetchImpl,
    });

    await expect(client.getRun(RUN_ID, { afterSequence: 0, limit: 25 })).resolves.toMatchObject({
      nextAfterSequence: 1,
      events: [expect.objectContaining({ sequence: 1 })],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://agi.example/api/llm/v1/chat/completions/runs/${RUN_ID}?after=0&limit=25`,
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-1' },
        signal: undefined,
      }),
    );
  });

  it('lists filtered runs through the tenant-scoped collection endpoint', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ runs: [run('awaiting_input')], nextCursor: 'next-page' }),
    );
    const client = createManagedCloudAgentRunClient({
      baseUrl: 'https://agi.example',
      getAuthToken: async () => 'token-1',
      fetchImpl,
    });

    await expect(
      client.listRuns({
        states: ['running', 'awaiting_input'],
        requestId: 'request-1',
        limit: 25,
        cursor: 'current-page',
      }),
    ).resolves.toMatchObject({
      runs: [expect.objectContaining({ state: 'awaiting_input' })],
      nextCursor: 'next-page',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://agi.example/api/llm/v1/chat/completions/runs?state=running&state=awaiting_input&limit=25&requestId=request-1&cursor=current-page',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-1' },
        signal: undefined,
      }),
    );
  });

  it('rejects invalid list filters before making a request', async () => {
    const fetchImpl = vi.fn();
    const client = createManagedCloudAgentRunClient({ fetchImpl });

    await expect(client.listRuns({ states: ['not-a-state'] as never[] })).rejects.toThrow();
    await expect(client.listRuns({ cursor: 'x'.repeat(513) })).rejects.toThrow();
    await expect(client.listRuns({ requestId: 'bad key' })).rejects.toThrow();
    await expect(client.listRuns({ requestId: 'x'.repeat(129) })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('replays every page without gaps and stops only at a terminal run state', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          run: run('running', 2),
          events: [event(0), event(1)],
          nextAfterSequence: 1,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ run: run('running', 2), events: [event(2)], nextAfterSequence: 2 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ run: run('completed', 3), events: [event(3)], nextAfterSequence: 3 }),
      );
    const seen: number[] = [];
    const client = createManagedCloudAgentRunClient({ fetchImpl });

    const result = await client.followRun(RUN_ID, {
      afterSequence: -1,
      pageSize: 2,
      pollIntervalMs: 0,
      onEvent: (envelope) => {
        seen.push(envelope.sequence);
      },
    });

    expect(seen).toEqual([0, 1, 2, 3]);
    expect(result.run.state).toBe('completed');
    expect(result.lastSequence).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('retries transient status failures with bounded backoff', async () => {
    const wait = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'busy' }, { status: 503 }))
      .mockResolvedValueOnce(
        jsonResponse({ run: run('completed', 0), events: [event(0)], nextAfterSequence: 0 }),
      );
    const client = createManagedCloudAgentRunClient({ fetchImpl, wait });

    const result = await client.followRun(RUN_ID, {
      maxTransientErrors: 2,
      retryDelayMs: 20,
      pollIntervalMs: 0,
    });

    expect(result.run.state).toBe('completed');
    expect(wait).toHaveBeenCalledWith(20, undefined);
  });

  it('cancels through decorated mutation headers and stops reconnect on abort', async () => {
    const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ run: run('running') }, { status: 202 });
      return jsonResponse({ run: run(), events: [], nextAfterSequence: -1 });
    });
    const client = createManagedCloudAgentRunClient({
      fetchImpl,
      getAuthToken: async () => 'token-1',
      decorateMutationHeaders: (headers) => ({ ...headers, 'x-csrf-token': 'csrf-1' }),
    });

    await client.cancelRun(RUN_ID);
    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-1',
          'x-csrf-token': 'csrf-1',
        },
      }),
    );

    const controller = new AbortController();
    controller.abort();
    await expect(client.followRun(RUN_ID, { signal: controller.signal })).rejects.toBeInstanceOf(
      ManagedCloudAgentRunAbortError,
    );
  });

  describe('answering an approval from a surface that is not watching the run', () => {
    function resumeClient(response: Response) {
      const fetchImpl = vi.fn(async () => response);
      const client = createManagedCloudAgentRunClient({
        fetchImpl,
        getAuthToken: async () => 'token-1',
        decorateMutationHeaders: (headers) => ({ ...headers, 'x-csrf-token': 'csrf-1' }),
      });
      return { client, fetchImpl };
    }

    it('posts the decisions and releases the continuation stream it will not read', async () => {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(new TextEncoder().encode('data: {}\n\n'));
        },
        cancel() {
          cancelled = true;
        },
      });
      const { client, fetchImpl } = resumeClient(
        new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      );

      await client.resumeRun(RUN_ID, [{ toolCallId: 'call-1', decision: 'approved' }]);

      expect(fetchImpl).toHaveBeenCalledWith(
        '/api/llm/v1/chat/completions/approve',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            run_id: RUN_ID,
            tool_approvals: [{ tool_call_id: 'call-1', decision: 'approved' }],
          }),
          headers: expect.objectContaining({ 'x-csrf-token': 'csrf-1' }),
        }),
      );
      expect(cancelled).toBe(true);
    });

    it('carries steering guidance to the resume endpoint', async () => {
      const { client, fetchImpl } = resumeClient(jsonResponse({}));

      await client.resumeRun(RUN_ID, [{ toolCallId: 'call-1', decision: 'approved' }], {
        guidance: '  Use the docs repo instead.  ',
      });

      expect(fetchImpl).toHaveBeenCalledWith(
        '/api/llm/v1/chat/completions/approve',
        expect.objectContaining({
          body: JSON.stringify({
            run_id: RUN_ID,
            tool_approvals: [{ tool_call_id: 'call-1', decision: 'approved' }],
            guidance: 'Use the docs repo instead.',
          }),
        }),
      );
    });

    it('names the two outcomes a person can act on instead of a generic HTTP failure', async () => {
      const conflict = resumeClient(
        jsonResponse(
          { error: { message: 'This approval is already being resumed.' } },
          {
            status: 409,
          },
        ),
      );
      await expect(
        conflict.client.resumeRun(RUN_ID, [{ toolCallId: 'call-1', decision: 'approved' }]),
      ).rejects.toMatchObject({ name: 'ManagedCloudAgentRunAlreadyResumingError', status: 409 });

      const expired = resumeClient(
        jsonResponse({ error: { message: 'This approval request expired.' } }, { status: 410 }),
      );
      await expect(
        expired.client.resumeRun(RUN_ID, [{ toolCallId: 'call-1', decision: 'rejected' }]),
      ).rejects.toMatchObject({ name: 'ManagedCloudAgentRunApprovalExpiredError', status: 410 });
    });

    it('rejects a malformed decision set before it reaches the network', async () => {
      const { client, fetchImpl } = resumeClient(jsonResponse({}));

      await expect(client.resumeRun(RUN_ID, [])).rejects.toBeTruthy();
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });
});
