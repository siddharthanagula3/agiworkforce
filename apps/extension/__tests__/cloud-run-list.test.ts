/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ManagedCloudAgentRunAlreadyResumingError,
  ManagedCloudAgentRunApprovalExpiredError,
  managedCloudAgentRunPath,
} from '@agiworkforce/cloud-contracts';
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  listChromeManagedRuns,
  readChromeManagedRunJournal,
  resolveChromeManagedRunApproval,
  type ChromeManagedRunDependencies,
} from '../src/features/cloud-bridge/managedRunControl';
import {
  buildCloudRunsPanel,
  summarizeRunJournal,
} from '../src/features/side-panel/cloudRunsPanel';

const RUN_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_RUN_ID = '33333333-3333-4333-8333-333333333333';
const REFRESH_INTERVAL_MS = 5;

function run(overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
  return {
    id: RUN_ID,
    userId: 'user-1',
    requestId: 'request-1',
    conversationId: null,
    originSurface: 'desktop',
    workMode: 'agiwork',
    state: 'running',
    provider: 'anthropic',
    model: 'model-1',
    lastEventSequence: 0,
    cancellationRequestedAt: null,
    completedAt: null,
    createdAt: '2026-08-26T10:00:00.000Z',
    updatedAt: '2026-08-26T10:05:00.000Z',
    ...overrides,
  };
}

function awaitingApprovalRun(): CloudAgentRun {
  return run({
    state: 'awaiting_input',
    pendingApproval: {
      requestedAt: '2026-08-26T10:05:00.000Z',
      toolCalls: [
        { toolCallId: 'call-a', name: 'shell', argsPreview: 'rm -rf build' },
        { toolCallId: 'call-b', name: 'fetch', argsPreview: 'https://example.com' },
      ],
    },
  });
}

function textEvent(sequence: number, delta: string): AgentEventEnvelope {
  return {
    schemaVersion: 4,
    sessionId: 'session-1',
    turnId: 'turn-1',
    sequence,
    emittedAtMs: 1_000 + sequence,
    event: { type: 'text-delta', delta },
  };
}

function stopButton(root: HTMLElement): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>('.sp-runs-icon-btn')].find(
    (button) => button.textContent === 'Stop',
  );
}

function client(overrides: Partial<ManagedCloudAgentRunClient> = {}): ManagedCloudAgentRunClient {
  return {
    listRuns: vi.fn(),
    getRun: vi.fn(),
    followRun: vi.fn(),
    cancelRun: vi.fn(),
    resumeRun: vi.fn(),
    ...overrides,
  };
}

function dependencies(
  managedClient: ManagedCloudAgentRunClient,
  token: string | null = 'token-1',
): ChromeManagedRunDependencies {
  return {
    getAuthToken: vi.fn(async () => token),
    createClient: vi.fn(() => managedClient),
  };
}

describe('Chrome managed run browsing', () => {
  it('lists every surface a run could have started on, not just this browser', async () => {
    const listRuns = vi.fn().mockResolvedValue({ runs: [run()], nextCursor: 'page-2' });
    const result = await listChromeManagedRuns({}, dependencies(client({ listRuns })));

    expect(listRuns).toHaveBeenCalledWith(
      expect.not.objectContaining({ requestId: expect.any(String) }),
    );
    expect(result).toMatchObject({ status: 'success', page: { nextCursor: 'page-2' } });
    if (result.status !== 'success') throw new Error('expected a page');
    // Narrowing the page back down to this browser would leave every assertion
    // above green, so the surviving run itself is what the claim rests on.
    expect(result.page.runs.map((entry) => entry.originSurface)).toEqual(['desktop']);
  });

  it('anchors an over-long journal to its newest events, not its oldest', async () => {
    const longRun = run({ state: 'running', lastEventSequence: 5_000 });
    const getRun = vi
      .fn()
      .mockResolvedValueOnce({
        run: longRun,
        events: [textEvent(0, 'the very first thing')],
        nextAfterSequence: 0,
      })
      .mockResolvedValueOnce({
        run: longRun,
        events: [textEvent(5_000, 'what it is doing now')],
        nextAfterSequence: 5_000,
      });

    const result = await readChromeManagedRunJournal(
      { runId: RUN_ID },
      dependencies(client({ getRun })),
    );

    expect(getRun).toHaveBeenNthCalledWith(
      1,
      RUN_ID,
      expect.objectContaining({ afterSequence: -1 }),
    );
    expect(getRun).toHaveBeenNthCalledWith(
      2,
      RUN_ID,
      expect.objectContaining({ afterSequence: 1_000 }),
    );
    if (result.status !== 'success') throw new Error('expected a journal');
    expect(result.journal.truncated).toBe(true);
    expect(result.journal.nextAfterSequence).toBe(5_000);
    expect(result.journal.events).toHaveLength(1);
  });

  it('resumes a journal from the caller cursor instead of re-reading the log', async () => {
    const getRun = vi.fn().mockResolvedValue({
      run: run({ lastEventSequence: 12 }),
      events: [textEvent(12, ' more')],
      nextAfterSequence: 12,
    });

    await readChromeManagedRunJournal(
      { runId: RUN_ID, afterSequence: 11 },
      dependencies(client({ getRun })),
    );

    expect(getRun).toHaveBeenCalledTimes(1);
    expect(getRun).toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ afterSequence: 11 }));
  });

  it('reports a missing session instead of listing an empty page', async () => {
    const listRuns = vi.fn();
    const result = await listChromeManagedRuns({}, dependencies(client({ listRuns }), null));

    expect(result).toMatchObject({ status: 'error', code: 'auth_required' });
    expect(listRuns).not.toHaveBeenCalled();
  });

  it('pages a journal until the durable log is exhausted', async () => {
    const getRun = vi
      .fn()
      .mockResolvedValueOnce({
        run: run({ lastEventSequence: 3 }),
        events: [textEvent(0, 'Hel'), textEvent(1, 'lo')],
        nextAfterSequence: 2,
      })
      .mockResolvedValueOnce({
        run: run({ lastEventSequence: 3 }),
        events: [textEvent(2, ' world')],
        nextAfterSequence: 3,
      });

    const result = await readChromeManagedRunJournal(
      { runId: RUN_ID },
      dependencies(client({ getRun })),
    );

    expect(getRun).toHaveBeenCalledTimes(2);
    expect(getRun).toHaveBeenLastCalledWith(RUN_ID, expect.objectContaining({ afterSequence: 2 }));
    expect(result).toMatchObject({ status: 'success', journal: { truncated: false } });
    if (result.status !== 'success') throw new Error('expected a journal');
    expect(result.journal.events).toHaveLength(3);
  });

  it('rejects a malformed run identity before reading authentication', async () => {
    const deps = dependencies(client());
    const result = await readChromeManagedRunJournal({ runId: 'not-a-run' }, deps);

    expect(result).toMatchObject({ status: 'error', code: 'invalid_request' });
    expect(deps.getAuthToken).not.toHaveBeenCalled();
  });

  it('answers every tool call in one paused approval and carries guidance', async () => {
    const resumeRun = vi.fn().mockResolvedValue(undefined);
    const result = await resolveChromeManagedRunApproval(
      {
        runId: RUN_ID,
        toolCallIds: ['call-a', 'call-b'],
        decision: 'approved',
        guidance: '  stay inside the repo  ',
      },
      dependencies(client({ resumeRun })),
    );

    expect(resumeRun).toHaveBeenCalledWith(
      RUN_ID,
      [
        { toolCallId: 'call-a', decision: 'approved' },
        { toolCallId: 'call-b', decision: 'approved' },
      ],
      { guidance: 'stay inside the repo' },
    );
    expect(result).toEqual({ status: 'success' });
  });

  it('names the surface that won the race when another device already answered', async () => {
    const resumeRun = vi
      .fn()
      .mockRejectedValue(new ManagedCloudAgentRunAlreadyResumingError('conflict'));
    const result = await resolveChromeManagedRunApproval(
      { runId: RUN_ID, toolCallIds: ['call-a'], decision: 'approved' },
      dependencies(client({ resumeRun })),
    );

    expect(result).toMatchObject({ status: 'error', code: 'already_resolved' });
  });

  it('separates an expired approval from a transport failure', async () => {
    const resumeRun = vi
      .fn()
      .mockRejectedValue(new ManagedCloudAgentRunApprovalExpiredError('gone'));
    const result = await resolveChromeManagedRunApproval(
      { runId: RUN_ID, toolCallIds: ['call-a'], decision: 'rejected' },
      dependencies(client({ resumeRun })),
    );

    expect(result).toMatchObject({ status: 'error', code: 'approval_expired' });
  });
});

describe('side-panel cloud run list', () => {
  function panelDependencies(overrides: Record<string, unknown> = {}) {
    return {
      listRuns: vi
        .fn()
        .mockResolvedValue({ status: 'success', page: { runs: [], nextCursor: null } }),
      readJournal: vi.fn().mockResolvedValue({
        status: 'success',
        journal: { run: run(), events: [], nextAfterSequence: -1, truncated: false },
      }),
      resolveApproval: vi.fn().mockResolvedValue({ status: 'success' }),
      cancelRun: vi.fn().mockResolvedValue({ status: 'success', run: run() }),
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      now: () => Date.parse('2026-08-26T10:06:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('shows runs started on other surfaces with their state', async () => {
    const deps = panelDependencies({
      listRuns: vi.fn().mockResolvedValue({
        status: 'success',
        page: { runs: [run({ state: 'ready_for_review' })], nextCursor: null },
      }),
    });
    const panel = buildCloudRunsPanel(deps);
    document.body.appendChild(panel.panelEl);
    panel.setActive(true);

    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector('.sp-run-row')).not.toBeNull();
    });
    expect(panel.panelEl.querySelector('.sp-run-badge')?.textContent).toBe('Ready for review');
    expect(panel.panelEl.querySelector('.sp-run-sub')?.textContent).toBe('Started on Desktop');
    panel.dispose();
  });

  it('resolves a paused approval from the panel and re-reads the run', async () => {
    const resolveApproval = vi.fn().mockResolvedValue({ status: 'success' });
    const deps = panelDependencies({
      listRuns: vi.fn().mockResolvedValue({
        status: 'success',
        page: { runs: [awaitingApprovalRun()], nextCursor: null },
      }),
      resolveApproval,
    });
    const panel = buildCloudRunsPanel(deps);
    document.body.appendChild(panel.panelEl);
    panel.setActive(true);

    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector('.sp-run-approve')).not.toBeNull();
    });
    const guidance = panel.panelEl.querySelector<HTMLTextAreaElement>('.sp-run-approval-guidance');
    guidance!.value = 'skip the delete';
    guidance!.dispatchEvent(new Event('input'));
    panel.panelEl.querySelector<HTMLButtonElement>('.sp-run-approve')!.click();

    await vi.waitFor(() => {
      expect(resolveApproval).toHaveBeenCalledWith({
        runId: RUN_ID,
        toolCallIds: ['call-a', 'call-b'],
        decision: 'approved',
        guidance: 'skip the delete',
      });
    });
    panel.dispose();
  });

  it('surfaces the losing side of a race instead of pretending the decision landed', async () => {
    const deps = panelDependencies({
      listRuns: vi.fn().mockResolvedValue({
        status: 'success',
        page: { runs: [awaitingApprovalRun()], nextCursor: null },
      }),
      resolveApproval: vi.fn().mockResolvedValue({
        status: 'error',
        code: 'already_resolved',
        message: 'Another device already answered this approval.',
      }),
    });
    const panel = buildCloudRunsPanel(deps);
    document.body.appendChild(panel.panelEl);
    panel.setActive(true);

    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector('.sp-run-reject')).not.toBeNull();
    });
    panel.panelEl.querySelector<HTMLButtonElement>('.sp-run-reject')!.click();

    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector('.sp-runs-status')?.textContent).toBe(
        'Another device already answered this approval.',
      );
    });
    panel.dispose();
  });

  it('opens a run and renders its journal', async () => {
    const deps = panelDependencies({
      listRuns: vi.fn().mockResolvedValue({
        status: 'success',
        page: { runs: [run({ id: OTHER_RUN_ID, state: 'completed' })], nextCursor: null },
      }),
      readJournal: vi.fn().mockResolvedValue({
        status: 'success',
        journal: {
          run: run({ id: OTHER_RUN_ID, state: 'completed' }),
          events: [textEvent(0, 'Read '), textEvent(1, 'the docs')],
          nextAfterSequence: 1,
          truncated: false,
        },
      }),
    });
    const panel = buildCloudRunsPanel(deps);
    document.body.appendChild(panel.panelEl);
    panel.setActive(true);

    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector('.sp-run-row')).not.toBeNull();
    });
    panel.panelEl.querySelector<HTMLButtonElement>('.sp-run-row')!.click();

    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector('.sp-run-entry-title')?.textContent).toBe('Read the docs');
    });
    expect(deps.readJournal).toHaveBeenCalledWith(expect.objectContaining({ runId: OTHER_RUN_ID }));
    panel.dispose();
  });

  it('stops polling the moment the panel stops being the visible tab', async () => {
    const deps = panelDependencies({
      listRuns: vi
        .fn()
        .mockResolvedValue({ status: 'success', page: { runs: [run()], nextCursor: null } }),
    });
    const panel = buildCloudRunsPanel(deps);
    document.body.appendChild(panel.panelEl);
    panel.setActive(true);

    await vi.waitFor(() => {
      expect(deps.listRuns.mock.calls.length).toBeGreaterThan(1);
    });
    panel.setActive(false);
    const settled = deps.listRuns.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, REFRESH_INTERVAL_MS * 8));

    expect(deps.listRuns.mock.calls.length).toBe(settled);
    panel.dispose();
  });

  it('never polls a run that can no longer emit events', async () => {
    const deps = panelDependencies({
      listRuns: vi.fn().mockResolvedValue({
        status: 'success',
        page: { runs: [run({ state: 'completed' })], nextCursor: null },
      }),
    });
    const panel = buildCloudRunsPanel(deps);
    document.body.appendChild(panel.panelEl);
    panel.setActive(true);

    await vi.waitFor(() => {
      expect(deps.listRuns).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, REFRESH_INTERVAL_MS * 8));

    expect(deps.listRuns).toHaveBeenCalledTimes(1);
    panel.dispose();
  });

  it('follows an open run from where the last read stopped', async () => {
    const readJournal = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'success',
        journal: {
          run: run({ state: 'running' }),
          events: [textEvent(0, 'Read '), textEvent(1, 'the docs')],
          nextAfterSequence: 1,
          truncated: false,
        },
      })
      .mockResolvedValueOnce({
        status: 'success',
        journal: {
          run: run({ state: 'running' }),
          events: [textEvent(2, ' twice')],
          nextAfterSequence: 2,
          truncated: false,
        },
      })
      .mockResolvedValue({
        status: 'success',
        journal: {
          run: run({ state: 'running' }),
          events: [],
          nextAfterSequence: 2,
          truncated: false,
        },
      });
    const deps = panelDependencies({
      listRuns: vi
        .fn()
        .mockResolvedValue({ status: 'success', page: { runs: [run()], nextCursor: null } }),
      readJournal,
    });
    const panel = buildCloudRunsPanel(deps);
    document.body.appendChild(panel.panelEl);
    panel.setActive(true);

    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector('.sp-run-row')).not.toBeNull();
    });
    panel.panelEl.querySelector<HTMLButtonElement>('.sp-run-row')!.click();

    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector('.sp-run-entry-title')?.textContent).toBe(
        'Read the docs twice',
      );
    });
    expect(readJournal).toHaveBeenNthCalledWith(
      1,
      expect.not.objectContaining({ afterSequence: expect.anything() }),
    );
    expect(readJournal).toHaveBeenNthCalledWith(2, expect.objectContaining({ afterSequence: 1 }));
    panel.dispose();
  });

  it('clears the previous account rows when the panel is deactivated', async () => {
    const deps = panelDependencies({
      listRuns: vi.fn().mockResolvedValue({
        status: 'success',
        page: { runs: [awaitingApprovalRun()], nextCursor: null },
      }),
    });
    const panel = buildCloudRunsPanel(deps);
    document.body.appendChild(panel.panelEl);
    panel.setActive(true);

    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector('.sp-run-approval-call')).not.toBeNull();
    });
    panel.setActive(false);

    expect(panel.panelEl.querySelector('.sp-run-row')).toBeNull();
    expect(panel.panelEl.querySelector('.sp-run-approval-call')).toBeNull();
    expect(panel.panelEl.textContent).not.toContain('rm -rf build');
    panel.dispose();
  });

  it('stops a live run from its detail view', async () => {
    const cancelRun = vi.fn().mockResolvedValue({ status: 'success', run: run() });
    const deps = panelDependencies({
      listRuns: vi
        .fn()
        .mockResolvedValue({ status: 'success', page: { runs: [run()], nextCursor: null } }),
      cancelRun,
    });
    const panel = buildCloudRunsPanel(deps);
    document.body.appendChild(panel.panelEl);
    panel.setActive(true);

    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector('.sp-run-row')).not.toBeNull();
    });
    panel.panelEl.querySelector<HTMLButtonElement>('.sp-run-row')!.click();

    await vi.waitFor(() => {
      expect(stopButton(panel.panelEl)).not.toBeUndefined();
    });
    stopButton(panel.panelEl)!.click();

    await vi.waitFor(() => {
      expect(cancelRun).toHaveBeenCalledWith({
        runId: RUN_ID,
        runPath: managedCloudAgentRunPath(RUN_ID),
        lastSequence: -1,
        state: 'running',
        cancellationRequestedAt: null,
      });
    });
    panel.dispose();
  });

  it('keeps approve and deny usable when the reload after a decision also fails', async () => {
    const listRuns = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'success',
        page: { runs: [awaitingApprovalRun()], nextCursor: null },
      })
      .mockResolvedValue({ status: 'error', code: 'server_error', message: 'Gateway is down.' });
    const deps = panelDependencies({
      listRuns,
      resolveApproval: vi
        .fn()
        .mockResolvedValue({ status: 'error', code: 'server_error', message: 'Offline.' }),
    });
    const panel = buildCloudRunsPanel(deps);
    document.body.appendChild(panel.panelEl);
    panel.setActive(true);

    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector('.sp-run-approve')).not.toBeNull();
    });
    panel.panelEl.querySelector<HTMLButtonElement>('.sp-run-approve')!.click();

    await vi.waitFor(() => {
      expect(deps.resolveApproval).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector<HTMLButtonElement>('.sp-run-approve')!.disabled).toBe(
        false,
      );
    });
    panel.dispose();
  });

  it('explains a connector pause instead of showing an unanswerable badge', async () => {
    const deps = panelDependencies({
      listRuns: vi.fn().mockResolvedValue({
        status: 'success',
        page: {
          runs: [
            run({
              state: 'awaiting_input',
              pendingInput: {
                requestedAt: '2026-08-26T10:05:00.000Z',
                toolCalls: [
                  {
                    toolCallId: 'call-c',
                    name: 'create_issue',
                    connectorId: 'linear',
                    round: 0,
                    inputRequests: {},
                  },
                ],
              },
            }),
          ],
          nextCursor: null,
        },
      }),
    });
    const panel = buildCloudRunsPanel(deps);
    document.body.appendChild(panel.panelEl);
    panel.setActive(true);

    await vi.waitFor(() => {
      expect(panel.panelEl.querySelector('.sp-run-approval-title')?.textContent).toBe(
        'Waiting on connector details',
      );
    });
    expect(panel.panelEl.querySelector('.sp-run-approve')).toBeNull();
    expect(panel.panelEl.textContent).toContain('Desktop');
    panel.dispose();
  });

  it('merges streamed text into one readable block', () => {
    const entries = summarizeRunJournal([
      textEvent(0, 'Hel'),
      textEvent(1, 'lo'),
      {
        schemaVersion: 4,
        sessionId: 'session-1',
        turnId: 'turn-1',
        sequence: 2,
        emittedAtMs: 1_002,
        event: {
          type: 'tool-execution-start',
          toolCallId: 'call-a',
          name: 'search',
          category: 'search',
          summary: 'Searching the web',
          input: {},
        },
      },
    ]);

    expect(entries).toEqual([
      { kind: 'text', title: 'Hello' },
      { kind: 'tool', title: 'Running search', detail: 'Searching the web' },
    ]);
  });
});
