import { describe, expect, it, vi } from 'vitest';
import { ManagedCloudAgentRunHttpError } from '@agiworkforce/cloud-contracts';
import type {
  ManagedCloudAgentRunClient,
  ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import {
  cancelChromeManagedRun,
  findChromeManagedRunByRequestId,
  resumeChromeManagedRun,
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

describe('Chrome managed run control', () => {
  it.each([401, 403])('classifies HTTP %s as an auth boundary failure', async (status) => {
    const client: ManagedCloudAgentRunClient = {
      listRuns: vi.fn(),
      getRun: vi.fn(),
      followRun: vi.fn().mockRejectedValue(new ManagedCloudAgentRunHttpError('rejected', status)),
      cancelRun: vi.fn().mockRejectedValue(new ManagedCloudAgentRunHttpError('rejected', status)),
    };

    await expect(
      resumeChromeManagedRun({ run: reference, alreadyVisibleText: '' }, dependencies(client)),
    ).resolves.toMatchObject({ status: 'error', code: 'auth_required' });
    await expect(cancelChromeManagedRun(reference, dependencies(client))).resolves.toMatchObject({
      status: 'error',
      code: 'auth_required',
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
          schemaVersion: 3,
          sessionId: 'session-1',
          turnId: 'turn-1',
          sequence: 0,
          emittedAtMs: 1_000,
          event: { type: 'text-delta', delta: 'Hello' },
        });
        await options?.onEvent?.({
          schemaVersion: 3,
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
          schemaVersion: 3,
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

    expect(cancelRun).toHaveBeenCalledWith(RUN_ID, {});
    expect(result).toMatchObject({ status: 'success', run: { state: 'cancelled' } });
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

    const allManagedRunStates = [
      'queued',
      'running',
      'awaiting_input',
      'ready_for_review',
      'completed',
      'failed',
      'cancelled',
      'paused',
      'archived',
    ];
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
