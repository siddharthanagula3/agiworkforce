import { describe, expect, it, vi } from 'vitest';
import type { ManagedCloudAgentRunReference } from '@agiworkforce/cloud-contracts';
import {
  isScheduledCancellationRetryDue,
  requestScheduledTaskCancellation,
  ScheduledTaskCancellationAttemptCoordinator,
  selectScheduledTaskCancellationCredential,
} from '../src/features/background/scheduled-task-cancellation';
import type { ScheduledTaskRunJournal } from '../src/features/background/scheduled-task-runs';

const OWNER = { accountId: 'account-a', authIncarnation: 'session-a' } as const;
const REPLACEMENT_OWNER = {
  accountId: 'account-a',
  authIncarnation: 'session-a-replacement',
} as const;
const RUN: ManagedCloudAgentRunReference = {
  runId: '11111111-1111-4111-8111-111111111111',
  runPath: '/api/llm/v1/chat/completions/runs/11111111-1111-4111-8111-111111111111',
  lastSequence: 3,
  state: 'running',
};

function journal(overrides: Partial<ScheduledTaskRunJournal> = {}): ScheduledTaskRunJournal {
  return {
    version: 1,
    taskId: 'task-1',
    taskName: 'Morning brief',
    prompt: 'Summarize my inbox',
    requestId: 'agi.chrome.task.request-1',
    owner: OWNER,
    createdAt: 1_000,
    updatedAt: 1_000,
    recoveryAttempts: 0,
    cancellationPending: false,
    cancellationAttempts: 0,
    cancellationAbsenceObservations: 0,
    ...overrides,
  };
}

function dependencies(initial = journal()) {
  let stored = initial;
  const updateJournal = vi.fn(async (_taskId, _requestId, patch) => {
    stored = { ...stored, ...patch, updatedAt: 2_000 };
    return stored;
  });
  return {
    updateJournal,
    removeJournal: vi.fn(async () => true),
    findRun: vi.fn(async () => null),
    cancelRun: vi.fn(),
    wait: vi.fn(async () => undefined),
    now: vi.fn(() => 2_000),
    warn: vi.fn(),
  };
}

describe('scheduled task durable cancellation', () => {
  it('prefers captured A authority and rejects ambient B for an A journal', () => {
    const capturedA = { token: 'captured-a', owner: OWNER };
    const ambientB = {
      token: 'ambient-b',
      owner: { accountId: 'account-b', authIncarnation: 'session-b' },
    };

    expect(selectScheduledTaskCancellationCredential(OWNER, capturedA, ambientB)).toBe(capturedA);
    expect(selectScheduledTaskCancellationCredential(OWNER, null, ambientB)).toBeNull();
    expect(
      selectScheduledTaskCancellationCredential(OWNER, null, {
        token: 'replacement-a',
        owner: REPLACEMENT_OWNER,
      }),
    ).toMatchObject({ token: 'replacement-a' });
  });

  it('retries after a weaker in-flight attempt when captured cancellation authority arrives', async () => {
    const coordinator = new ScheduledTaskCancellationAttemptCoordinator();
    let resolveWeak!: (value: boolean) => void;
    const weakAttempt = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveWeak = resolve;
        }),
    );
    const strongAttempt = vi.fn(async () => true);

    const weak = coordinator.run(
      'agi.chrome.task.request-1',
      { hasCredential: false, hasKnownRun: false },
      weakAttempt,
    );
    const strong = coordinator.run(
      'agi.chrome.task.request-1',
      { hasCredential: true, hasKnownRun: true },
      strongAttempt,
    );
    await vi.waitFor(() => expect(weakAttempt).toHaveBeenCalledOnce());
    resolveWeak(false);

    await expect(weak).resolves.toBe(false);
    await expect(strong).resolves.toBe(true);
    expect(strongAttempt).toHaveBeenCalledOnce();
  });

  it('persists a tombstone and retains it when the server run cannot yet be found', async () => {
    const deps = dependencies();

    await expect(
      requestScheduledTaskCancellation(
        journal(),
        { token: 'token-a', owner: OWNER },
        undefined,
        deps,
      ),
    ).resolves.toBe(false);

    expect(deps.updateJournal.mock.calls[0]?.[2]).toMatchObject({
      cancellationPending: true,
      cancellationRequestedAt: 2_000,
    });
    expect(deps.findRun).toHaveBeenCalledTimes(3);
    expect(deps.removeJournal).not.toHaveBeenCalled();
  });

  it('surfaces a storage failure instead of reporting teardown success without a tombstone', async () => {
    const deps = dependencies();
    deps.updateJournal.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(
      requestScheduledTaskCancellation(
        journal(),
        { token: 'token-a', owner: OWNER },
        undefined,
        deps,
      ),
    ).rejects.toThrow('storage unavailable');

    expect(deps.findRun).not.toHaveBeenCalled();
    expect(deps.removeJournal).not.toHaveBeenCalled();
  });

  it('persists a captured run handle even before a cancellation credential is available', async () => {
    const deps = dependencies();

    await expect(requestScheduledTaskCancellation(journal(), null, RUN, deps)).resolves.toBe(false);

    expect(deps.updateJournal).toHaveBeenCalledWith(
      'task-1',
      'agi.chrome.task.request-1',
      expect.objectContaining({ cancellationPending: true, cloudRun: RUN }),
    );
    expect(deps.cancelRun).not.toHaveBeenCalled();
  });

  it('settles immediately when the journal proves dispatch never started', async () => {
    const initial = journal({ dispatchPreparedAt: 1_000 });
    const deps = dependencies(initial);

    await expect(
      requestScheduledTaskCancellation(
        initial,
        { token: 'token-a', owner: OWNER },
        undefined,
        deps,
      ),
    ).resolves.toBe(true);

    expect(deps.removeJournal).toHaveBeenCalledWith('task-1', 'agi.chrome.task.request-1');
    expect(deps.cancelRun).not.toHaveBeenCalled();
  });

  it('settles exact request-id absence after the bounded consistency window', async () => {
    const initial = journal({
      cancellationPending: true,
      cancellationAttempts: 2,
      cancellationAbsenceObservations: 2,
      dispatchPreparedAt: 1_000,
      dispatchStartedAt: 1_000,
    });
    const deps = dependencies(initial);
    deps.now.mockReturnValue(301_000);

    await expect(
      requestScheduledTaskCancellation(
        initial,
        { token: 'token-a', owner: OWNER },
        undefined,
        deps,
      ),
    ).resolves.toBe(true);

    expect(deps.removeJournal).toHaveBeenCalledWith('task-1', 'agi.chrome.task.request-1');
  });

  it('never treats lookup failures as exact server absence', async () => {
    const initial = journal({
      cancellationPending: true,
      cancellationAttempts: 3,
      cancellationAbsenceObservations: 2,
      dispatchPreparedAt: 1_000,
      dispatchStartedAt: 1_000,
    });
    const deps = dependencies(initial);
    deps.now.mockReturnValue(301_000);
    deps.findRun.mockRejectedValue(new Error('gateway unavailable'));

    await expect(
      requestScheduledTaskCancellation(
        initial,
        { token: 'token-a', owner: OWNER },
        undefined,
        deps,
      ),
    ).resolves.toBe(false);

    expect(deps.findRun).toHaveBeenCalledTimes(3);
    expect(deps.removeJournal).not.toHaveBeenCalled();
    expect(deps.updateJournal).not.toHaveBeenCalledWith(
      'task-1',
      'agi.chrome.task.request-1',
      expect.objectContaining({ cancellationAbsenceObservations: 3 }),
    );
  });

  it('aborts and releases a never-settling exact lookup', async () => {
    const deps = dependencies();
    let lookupSignal: AbortSignal | undefined;
    deps.findRun.mockImplementation(
      async (_requestId, _dependencies, signal) =>
        new Promise<null>((_resolve, reject) => {
          lookupSignal = signal;
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelled.', 'AbortError')),
            { once: true },
          );
        }),
    );

    await expect(
      requestScheduledTaskCancellation(journal(), { token: 'token-a', owner: OWNER }, undefined, {
        ...deps,
        ioTimeoutMs: 5,
      }),
    ).resolves.toBe(false);

    expect(lookupSignal?.aborted).toBe(true);
    expect(deps.removeJournal).not.toHaveBeenCalled();
  });

  it('aborts and releases a never-settling cancellation request', async () => {
    const deps = dependencies();
    let cancellationSignal: AbortSignal | undefined;
    deps.cancelRun.mockImplementation(
      async (_run, _dependencies, signal) =>
        new Promise((resolve) => {
          cancellationSignal = signal;
          signal?.addEventListener(
            'abort',
            () => resolve({ status: 'error', code: 'cancelled', message: 'Cancelled.' } as const),
            { once: true },
          );
        }),
    );

    await expect(
      requestScheduledTaskCancellation(
        journal({ cloudRun: RUN }),
        { token: 'token-a', owner: OWNER },
        RUN,
        { ...deps, ioTimeoutMs: 5 },
      ),
    ).resolves.toBe(false);

    expect(cancellationSignal?.aborted).toBe(true);
    expect(deps.removeJournal).not.toHaveBeenCalled();
  });

  it('settles a pre-dispatch tombstone without auth or network access', async () => {
    const initial = journal({ dispatchPreparedAt: 1_000 });
    const deps = dependencies(initial);

    await expect(requestScheduledTaskCancellation(initial, null, undefined, deps)).resolves.toBe(
      true,
    );

    expect(deps.findRun).not.toHaveBeenCalled();
    expect(deps.removeJournal).toHaveBeenCalledWith('task-1', 'agi.chrome.task.request-1');
  });

  it('retains the tombstone when cancellation is not acknowledged', async () => {
    const deps = dependencies();
    deps.cancelRun.mockResolvedValue({
      status: 'error',
      code: 'server_error',
      message: 'gateway unavailable',
    });

    await expect(
      requestScheduledTaskCancellation(
        journal({ cloudRun: RUN }),
        { token: 'token-a', owner: OWNER },
        RUN,
        deps,
      ),
    ).resolves.toBe(false);

    expect(deps.removeJournal).not.toHaveBeenCalled();
  });

  it('accepts same-account replacement auth for cancellation and removes only terminal ack', async () => {
    const deps = dependencies();
    deps.cancelRun.mockResolvedValue({
      status: 'success',
      run: {
        id: RUN.runId,
        accountId: OWNER.accountId,
        userId: 'user-a',
        requestId: 'agi.chrome.task.request-1',
        originSurface: 'chrome',
        state: 'cancelled',
        createdAt: '2026-08-02T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:01.000Z',
        cancellationRequestedAt: '2026-08-02T00:00:01.000Z',
      },
    });

    await expect(
      requestScheduledTaskCancellation(
        journal({ cloudRun: RUN }),
        { token: 'replacement-token', owner: REPLACEMENT_OWNER },
        RUN,
        deps,
      ),
    ).resolves.toBe(true);

    expect(deps.removeJournal).toHaveBeenCalledWith('task-1', 'agi.chrome.task.request-1');
  });

  it.each(['ready_for_review', 'completed', 'failed', 'cancelled', 'archived'] as const)(
    'treats server terminal state %s as settled without another cancel request',
    async (state) => {
      const deps = dependencies();
      const terminalRun = { ...RUN, state };

      await expect(
        requestScheduledTaskCancellation(
          journal({ cloudRun: terminalRun }),
          { token: 'token-a', owner: OWNER },
          terminalRun,
          deps,
        ),
      ).resolves.toBe(true);

      expect(deps.cancelRun).not.toHaveBeenCalled();
      expect(deps.removeJournal).toHaveBeenCalled();
    },
  );

  it.each(['awaiting_input', 'paused'] as const)(
    'settles non-autonomous %s after the server acknowledges cancellation intent',
    async (state) => {
      const deps = dependencies();
      const boundaryRun = { ...RUN, state };
      deps.cancelRun.mockResolvedValue({
        status: 'success',
        run: {
          id: RUN.runId,
          accountId: OWNER.accountId,
          userId: 'user-a',
          requestId: 'agi.chrome.task.request-1',
          originSurface: 'chrome',
          state,
          createdAt: '2026-08-02T00:00:00.000Z',
          updatedAt: '2026-08-02T00:00:01.000Z',
          cancellationRequestedAt: '2026-08-02T00:00:01.000Z',
        },
      });

      await expect(
        requestScheduledTaskCancellation(
          journal({ cloudRun: boundaryRun }),
          { token: 'token-a', owner: OWNER },
          boundaryRun,
          deps,
        ),
      ).resolves.toBe(true);

      expect(deps.removeJournal).toHaveBeenCalled();
    },
  );

  it('does not use a different account credential to inspect or cancel the run', async () => {
    const deps = dependencies();

    await expect(
      requestScheduledTaskCancellation(
        journal({ cloudRun: RUN }),
        {
          token: 'token-b',
          owner: { accountId: 'account-b', authIncarnation: 'session-b' },
        },
        RUN,
        deps,
      ),
    ).resolves.toBe(false);

    expect(deps.findRun).not.toHaveBeenCalled();
    expect(deps.cancelRun).not.toHaveBeenCalled();
    expect(deps.removeJournal).not.toHaveBeenCalled();
  });

  it('backs retries off and caps the delay at five minutes', () => {
    expect(
      isScheduledCancellationRetryDue(
        journal({
          cancellationPending: true,
          cancellationAttempts: 1,
          cancellationLastAttemptAt: 1_000,
        }),
        10_999,
      ),
    ).toBe(false);
    expect(
      isScheduledCancellationRetryDue(
        journal({
          cancellationPending: true,
          cancellationAttempts: 100,
          cancellationLastAttemptAt: 1_000,
        }),
        301_000,
      ),
    ).toBe(true);
  });
});
